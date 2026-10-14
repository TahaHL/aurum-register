import session, { Store, type SessionData } from "express-session";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { SqlPool } from "./sql.js";
import type { DealerUser } from "../shared/types.js";
import { DEMO_DEALER_ID } from "./migrate.js";
import { HttpError } from "./errors.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    authenticatedUntil?: number;
  }
}

const SESSION_MS = 8 * 60 * 60 * 1000;
const cookieName = "quoteledger.sid";
const sessionKey = (sid: string) =>
  createHash("sha256").update(sid).digest("hex");

// The maintained middleware handles signed cookies, regeneration and lifecycle;
// this adapter persists its server-side data in either PostgreSQL implementation.
export class DatabaseSessionStore extends Store {
  constructor(private pool: SqlPool) {
    super();
  }
  get(
    sid: string,
    callback: (error: unknown, data?: SessionData | null) => void,
  ) {
    void this.pool
      .query(
        "SELECT data FROM dealer_sessions WHERE sid=$1 AND expires_at>now()",
        [sessionKey(sid)],
      )
      .then(({ rows }) => callback(null, rows[0]?.data || null), callback);
  }
  set(sid: string, data: SessionData, callback?: (error?: unknown) => void) {
    const expires = new Date(
      data.authenticatedUntil || Date.now() + SESSION_MS,
    );
    void this.pool
      .query(
        "INSERT INTO dealer_sessions(sid,data,expires_at) VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET data=EXCLUDED.data,expires_at=EXCLUDED.expires_at",
        [sessionKey(sid), data, expires],
      )
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }
  destroy(sid: string, callback?: (error?: unknown) => void) {
    void this.pool
      .query("DELETE FROM dealer_sessions WHERE sid=$1", [sessionKey(sid)])
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }
  // Absolute expiry is intentional: requests do not extend an eight-hour session.
  touch(_sid: string, _data: SessionData, callback?: () => void) {
    callback?.();
  }
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, digest] = encoded.split(":");
  if (
    algorithm !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(digest || "")
  )
    return false;
  return timingSafeEqual(
    await derive(password, salt),
    Buffer.from(digest, "hex"),
  );
}

export interface AuthOptions {
  secret: string;
  demoAccounts: boolean;
  secureCookies: boolean;
  proxyHops?: number;
}
export function authOptions(origin: string): AuthOptions {
  const production = process.env.NODE_ENV === "production";
  const url = new URL(origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (production && !local && url.protocol !== "https:")
    throw Error("Hosted production requires an HTTPS APP_ORIGIN.");
  const secret =
    process.env.SESSION_SECRET ||
    (production ? "" : randomBytes(48).toString("hex"));
  if (secret.length < 32)
    throw Error("SESSION_SECRET must be at least 32 characters in production.");
  const proxyHops = process.env.TRUST_PROXY_HOPS
    ? Number(process.env.TRUST_PROXY_HOPS)
    : 0;
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 3)
    throw Error("TRUST_PROXY_HOPS must be between 0 and 3.");
  return {
    secret,
    demoAccounts:
      process.env.DEMO_ACCOUNTS === "true" ||
      (!production && process.env.DEMO_ACCOUNTS !== "false"),
    secureCookies: url.protocol === "https:",
    proxyHops,
  };
}

export async function seedDemoUsers(pool: SqlPool) {
  for (const account of [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "owner@quoteledger.demo",
      name: "Taha",
      role: "owner",
      password: "Demo-owner-2026!",
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "staff@quoteledger.demo",
      name: "Alex",
      role: "staff",
      password: "Demo-staff-2026!",
    },
  ]) {
    const exists = await pool.query("SELECT id FROM users WHERE email=$1", [
      account.email,
    ]);
    if (exists.rowCount) continue;
    await pool.query(
      "INSERT INTO users(id,dealer_id,email,password_hash,name,role,is_demo) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING",
      [
        account.id,
        DEMO_DEALER_ID,
        account.email,
        await hashPassword(account.password),
        account.name,
        account.role,
      ],
    );
  }
}

function userFromRow(row: Record<string, any>): DealerUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    dealerId: row.dealer_id,
    dealerName: row.dealer_name,
  };
}
const userQuery =
  "SELECT u.*,d.name AS dealer_name FROM users u JOIN dealers d ON d.id=u.dealer_id WHERE u.active=true";

export function installAuth(app: Express, pool: SqlPool, options: AuthOptions) {
  const allowedUserQuery =
    userQuery + (options.demoAccounts ? "" : " AND u.is_demo=false");
  if (options.proxyHops) app.set("trust proxy", options.proxyHops);
  app.use(
    "/api",
    session({
      name: cookieName,
      secret: options.secret,
      store: new DatabaseSessionStore(pool),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: options.secureCookies,
        maxAge: SESSION_MS,
        path: "/",
      },
    }),
  );
  async function currentUser(req: Request): Promise<DealerUser | null> {
    if (
      !req.session.userId ||
      !req.session.authenticatedUntil ||
      req.session.authenticatedUntil <= Date.now()
    )
      return null;
    const result = await pool.query(allowedUserQuery + " AND u.id=$1", [
      req.session.userId,
    ]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }
  const requireDealer: RequestHandler = async (req, res, next) => {
    try {
      const user = await currentUser(req);
      if (!user)
        throw new HttpError(401, "Sign in to open your dealer workspace.");
      res.locals.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
  app.get("/api/auth/session", async (req, res) =>
    res.json({
      user: await currentUser(req),
      demoAccounts: options.demoAccounts,
    }),
  );
  const loginLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  // A nonexistent email still incurs the same password KDF work.
  const dummyHash = `scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`;
  app.post("/api/auth/login", loginLimit, async (req, res) => {
    const body = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((x) => x.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(req.body);
    const result = await pool.query(allowedUserQuery + " AND u.email=$1", [
      body.email,
    ]);
    const row = result.rows[0];
    const matches = await verifyPassword(
      body.password,
      row?.password_hash || dummyHash,
    );
    if (!row || !matches)
      throw new HttpError(401, "Email or password is incorrect.");
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    req.session.userId = row.id;
    req.session.authenticatedUntil = Date.now() + SESSION_MS;
    await new Promise<void>((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    res.json({ user: userFromRow(row) });
  });
  app.post("/api/auth/logout", async (req, res) => {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: options.secureCookies,
      path: "/",
    });
    res.sendStatus(204);
  });
  return { requireDealer };
}
