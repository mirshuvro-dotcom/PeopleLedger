import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";

/** Minimal cookie handling (no dependency). Values here are opaque tokens, never personal data. */
export function readCookie(req: FastifyRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export interface CookieOptions {
  readonly maxAgeSeconds?: number;
  readonly sameSite: "Strict" | "Lax";
  readonly secure: boolean;
}

export function setCookie(reply: FastifyReply, name: string, value: string, o: CookieOptions): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", `SameSite=${o.sameSite}`];
  if (o.maxAgeSeconds !== undefined) parts.push(`Max-Age=${o.maxAgeSeconds}`);
  if (o.secure) parts.push("Secure");
  const existing = reply.getHeader("set-cookie");
  const list = existing === undefined ? [] : Array.isArray(existing) ? existing.map(String) : [String(existing)];
  reply.header("set-cookie", [...list, parts.join("; ")]);
}

export function clearCookie(reply: FastifyReply, name: string, secure: boolean): void {
  setCookie(reply, name, "", { maxAgeSeconds: 0, sameSite: "Lax", secure });
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests (NFR-02):
 * a custom header (which a cross-site form cannot send without a CORS
 * preflight the API never grants) plus an Origin check when the browser sends one.
 */
export function assertCsrf(req: FastifyRequest, webOrigin: string): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.headers["x-pl-csrf"] !== "1") throw new ApiError(403, "CSRF_REJECTED", "Missing request protection header.");
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== webOrigin) throw new ApiError(403, "CSRF_REJECTED", "Cross-origin request refused.");
}

/** In-memory sliding-window limiter per key (single API instance; a shared store comes with horizontal scaling). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): void {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.clear();
  }
}
