import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { previewDatabase } from "../server/preview-database";
import { migrate, seed } from "../server/migrate";
import { hashPassword, seedDemoUsers, verifyPassword } from "../server/auth";
import { PriceFeed, fixtureProvider } from "../server/prices";
import { Ledger } from "../server/ledger";
import { createApp } from "../server/app";

let database: Awaited<ReturnType<typeof previewDatabase>>;
let server: Server;
let base: string;
let closeStreams: () => void;
const origin = "http://desk.test";
const owner = { email: "owner@quoteledger.demo", password: "Demo-owner-2026!" };
const staff = { email: "staff@quoteledger.demo", password: "Demo-staff-2026!" };
const secret = "integration-test-session-secret-at-least-32-chars";
const newLot = () => ({
  sku: "TEST-" + randomUUID().slice(0, 8).toUpperCase(),
  name: "Fictional test bar",
  description: "Test fixture",
  weightMg: 10000,
  fineness: 9999,
  totalUnits: 2,
  reason: "Initial test delivery",
  requestId: randomUUID(),
});
function request(
  path: string,
  body?: unknown,
  cookie = "",
  requestOrigin = origin,
) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(account = owner) {
  const response = await request("/api/auth/login", account);
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
beforeAll(async () => {
  database = await previewDatabase();
  await migrate(database.pool);
  await seed(database.pool);
  await seedDemoUsers(database.pool);
  const feed = new PriceFeed(fixtureProvider());
  await feed.refresh();
  const created = createApp(
    new Ledger(database.pool, feed),
    feed,
    origin,
    database.kind,
    { secret, demoAccounts: true, secureCookies: false },
  );
  closeStreams = created.closeStreams;
  server = created.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await database.pool.query(
    "TRUNCATE dealer_sessions,stock_movements,reservations,quotes,ledger_events,lots CASCADE",
  );
  await database.pool.query("UPDATE users SET active=true");
  await seed(database.pool);
});
afterAll(async () => {
  closeStreams?.();
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await database?.close();
});
it("protects dealer reads and mutations without requiring a login for customer links", async () => {
  expect((await request("/api/workspace")).status).toBe(401);
  expect((await request("/api/inventory", newLot())).status).toBe(401);
  expect((await request("/api/quotes", {})).status).toBe(401);
  expect((await request("/api/auth/session")).status).toBe(200);
  const cookie = await login();
  const response = await request(
    "/api/quotes",
    {
      lotId: "11111111-1111-4111-8111-111111111111",
      quantity: 1,
      marginBps: 300,
      reference: "Fictional API customer",
    },
    cookie,
  );
  expect(response.status).toBe(201);
  const issued = await response.json();
  expect(
    (await request(`/api/quotes/${issued.quote.id}?token=${issued.token}`))
      .status,
  ).toBe(200);
  expect(
    (await request(`/api/quotes/${issued.quote.id}?token=${"a".repeat(64)}`))
      .status,
  ).toBe(404);
});
it("uses server sessions with protected cookies, rotates on login and invalidates on logout", async () => {
  const response = await request("/api/auth/login", owner);
  const setCookie = response.headers.get("set-cookie")!;
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Strict");
  const first = setCookie.split(";")[0];
  const secondResponse = await request("/api/auth/login", owner, first);
  const second = secondResponse.headers.get("set-cookie")!.split(";")[0];
  expect(second).not.toBe(first);
  expect((await request("/api/workspace", undefined, first)).status).toBe(401);
  expect((await request("/api/workspace", undefined, second)).status).toBe(200);
  expect((await request("/api/auth/logout", {}, second)).status).toBe(204);
  expect((await request("/api/workspace", undefined, second)).status).toBe(401);
});
it("rejects an expired or disabled user's session on its next request", async () => {
  let cookie = await login();
  await database.pool.query(
    "UPDATE dealer_sessions SET expires_at=now()-interval '1 second'",
  );
  expect((await request("/api/workspace", undefined, cookie)).status).toBe(401);
  cookie = await login();
  await database.pool.query("UPDATE users SET active=false WHERE email=$1", [
    owner.email,
  ]);
  expect((await request("/api/workspace", undefined, cookie)).status).toBe(401);
});
it("allows staff receiving but rejects adjustments and identity/role spoofing", async () => {
  const cookie = await login(staff);
  const received = await request("/api/inventory", newLot(), cookie);
  expect(received.status).toBe(201);
  const { lot } = await received.json();
  const forbidden = await request(
    `/api/inventory/${lot.id}/adjust`,
    { delta: -1, reason: "Fictional stock count", requestId: randomUUID() },
    cookie,
  );
  expect(forbidden.status).toBe(403);
  expect(
    (
      await request(
        "/api/inventory",
        { ...newLot(), role: "owner", dealerId: randomUUID() },
        cookie,
      )
    ).status,
  ).toBe(400);
  const adjusted = await request(
    `/api/inventory/${lot.id}/adjust`,
    { delta: -1, reason: "Owner stock correction", requestId: randomUUID() },
    await login(),
  );
  expect(adjusted.status).toBe(200);
  expect((await adjusted.json()).lot.availableUnits).toBe(1);
});
it("returns the same generic login error for unknown email and incorrect password", async () => {
  const missing = await request("/api/auth/login", {
    ...owner,
    email: "missing@quoteledger.demo",
  });
  const incorrect = await request("/api/auth/login", {
    ...owner,
    password: "wrong-password",
  });
  expect(missing.status).toBe(401);
  expect(incorrect.status).toBe(401);
  expect((await missing.json()).message).toBe((await incorrect.json()).message);
  const hash = await hashPassword("example-password");
  expect(hash).not.toContain("example-password");
  expect(await verifyPassword("example-password", hash)).toBe(true);
  expect(await verifyPassword("different-password", hash)).toBe(false);
});
it("rejects malformed JSON, foreign origins and non-JSON state changes", async () => {
  const invalid = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{invalid",
  });
  expect(invalid.status).toBe(400);
  expect(
    (await request("/api/auth/login", owner, "", "http://foreign.test")).status,
  ).toBe(403);
  const nonJson = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "text/plain" },
    body: "{}",
  });
  expect(nonJson.status).toBe(415);
});
it("turning demo accounts off also rejects existing demo sessions and passwords", async () => {
  const cookie = await login();
  const feed = new PriceFeed(fixtureProvider());
  const other = createApp(
    new Ledger(database.pool, feed),
    feed,
    origin,
    database.kind,
    { secret, demoAccounts: false, secureCookies: false },
  );
  const otherServer = other.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => otherServer.once("listening", resolve));
  const originalBase = base;
  base = `http://127.0.0.1:${(otherServer.address() as AddressInfo).port}`;
  try {
    expect((await request("/api/workspace", undefined, cookie)).status).toBe(
      401,
    );
    expect((await request("/api/auth/login", owner)).status).toBe(401);
  } finally {
    base = originalBase;
    other.closeStreams();
    await new Promise<void>((resolve) => otherServer.close(() => resolve()));
  }
});

it("reservation outcomes require an owner session and expose the result to the customer", async () => {
  const cookie = await login();
  const staffCookie = await login(staff);
  const issued = await (
    await request(
      "/api/quotes",
      {
        lotId: "11111111-1111-4111-8111-111111111111",
        quantity: 1,
        marginBps: 300,
        reference: "Sale API test",
      },
      cookie,
    )
  ).json();
  const accepted = await (
    await request(`/api/quotes/${issued.quote.id}/accept`, {
      token: issued.token,
      requestId: randomUUID(),
    })
  ).json();
  const url = `/api/reservations/${accepted.reservation.id}/complete`;
  const input = {
    action: "sold",
    reason: "Fictional sale completed",
    requestId: randomUUID(),
  };
  expect((await request(url, input)).status).toBe(401);
  expect((await request(url, input, staffCookie)).status).toBe(403);
  expect((await request(url, input, cookie, "http://other.test")).status).toBe(
    403,
  );
  expect(
    (await request(url, { ...input, action: "paid" }, cookie)).status,
  ).toBe(400);
  const result = await request(url, input, cookie);
  expect(result.status).toBe(200);
  expect((await result.json()).reservation.status).toBe("sold");
  expect((await request(url, input, cookie)).status).toBe(200);
  const customer = await (
    await request(`/api/quotes/${issued.quote.id}?token=${issued.token}`)
  ).json();
  expect(customer.quote.reservation.status).toBe("sold");
  expect(customer.quote.dealerName).toBe("Taha Hadj Lakehal");
});
