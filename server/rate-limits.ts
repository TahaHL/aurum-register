import type { RequestHandler } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

function configuredLimit(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${name} must be a positive integer`);
  return Number(value);
}
export function createApiLimits() {
  const make = (
    limit: number,
    skip: (req: import("express").Request) => boolean,
  ) =>
    rateLimit({
      windowMs: 60000,
      limit,
      skip,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        console.warn({ event: "api.rate_limit", status: 429 });
        res
          .status(429)
          .json({
            message: "Too many requests. Please wait before trying again.",
          });
      },
    });
  const reads = make(
    configuredLimit("RATE_LIMIT_READS_PER_MIN", 1200),
    (req) =>
      req.method !== "GET" || ["/health", "/price/stream"].includes(req.path),
  );
  const writes = make(
    configuredLimit("RATE_LIMIT_WRITES_PER_MIN", 120),
    (req) => !["POST", "PUT", "PATCH", "DELETE"].includes(req.method),
  );
  const connections = new Map<string, number>();
  const stream: RequestHandler = (req, res, next) => {
    const key = ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown");
    const count = connections.get(key) || 0;
    if (count >= 6) {
      console.warn({ event: "api.sse_limit", status: 429 });
      res.setHeader("Retry-After", "5");
      res
        .status(429)
        .json({
          message:
            "Too many live connections. Close another tab and try again.",
        });
      return;
    }
    connections.set(key, count + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const remaining = (connections.get(key) || 1) - 1;
      if (remaining) connections.set(key, remaining);
      else connections.delete(key);
    };
    res.once("close", release);
    next();
  };
  return { reads, writes, stream };
}
