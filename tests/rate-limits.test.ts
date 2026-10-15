import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiLimits } from "../server/rate-limits";
let server: Server;
let base: string;
let restore: () => void;
beforeEach(async () => {
  const app = express();
  const limits = createApiLimits();
  app.use("/api", limits.reads, limits.writes);
  app.get("/api/health", (_q, r) => r.json({ ok: true }));
  app.get("/api/read", (_q, r) => r.json({ ok: true }));
  app.post("/api/write", (_q, r) => r.json({ ok: true }));
  app.get("/api/price/stream", limits.stream, (_q, r) => {
    r.setHeader("Content-Type", "text/event-stream");
    r.flushHeaders();
    r.write(": ready\n\n");
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  restore = vi.spyOn(console, "warn").mockImplementation(() => {}).mockRestore;
});
afterAll(() => vi.restoreAllMocks());
import { afterEach } from "vitest";
afterEach(async () => {
  restore();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
it("allows 1200 reads, rejects the next, and never limits health", async () => {
  for (let i = 0; i < 1200; i++) {
    const r = await fetch(base + "/api/read");
    expect(r.status).toBe(200);
    await r.text();
  }
  const limited = await fetch(base + "/api/read");
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBeTruthy();
  await limited.text();
  for (let i = 0; i < 5; i++)
    expect((await fetch(base + "/api/health")).status).toBe(200);
}, 30000);
it("write exhaustion does not consume the independent read budget", async () => {
  for (let i = 0; i < 121; i++) {
    const r = await fetch(base + "/api/write", { method: "POST" });
    expect(r.status).toBe(i < 120 ? 200 : 429);
    await r.text();
  }
  expect((await fetch(base + "/api/read")).status).toBe(200);
});
it("caps concurrent SSE at six and releases a slot on disconnect", async () => {
  const controllers = Array.from({ length: 6 }, () => new AbortController());
  try {
    for (const controller of controllers)
      expect(
        (await fetch(base + "/api/price/stream", { signal: controller.signal }))
          .status,
      ).toBe(200);
    const rejected = await fetch(base + "/api/price/stream");
    expect(rejected.status).toBe(429);
    expect((await rejected.json()).message).toContain("connections");
    controllers[0].abort();
    await vi.waitFor(async () => {
      const c = new AbortController();
      const response = await fetch(base + "/api/price/stream", {
        signal: c.signal,
      });
      c.abort();
      expect(response.status).toBe(200);
    });
  } finally {
    controllers.forEach((c) => c.abort());
  }
});
