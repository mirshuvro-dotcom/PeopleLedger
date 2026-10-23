import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiConfig } from "./config.js";
import { toHttpError } from "./errors.js";
import { accessRoutes } from "./routes/access.js";
import { auditRoutes } from "./routes/audit.js";
import { devRoutes } from "./routes/dev.js";
import { organizationRoutes } from "./routes/organization.js";
import { peopleRoutes } from "./routes/people.js";
import { correlationIdOf, type RegisteredRoute } from "./tenant-route.js";

export interface ServerDeps {
  readonly config: Pick<ApiConfig, "devAuth" | "repoRoot" | "environment">;
  readonly appPool: pg.Pool;
  readonly logger?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

/** Build the HTTP API (ARCH-01 deployment unit "API"). Exposes the registered tenant routes for authorization tests. */
export function buildServer(deps: ServerDeps): FastifyInstance & { tenantRoutes: RegisteredRoute[] } {
  const app = Fastify({
    logger: deps.logger === false ? false : { level: deps.config.environment === "production" ? "info" : "warn", redact: ["req.headers.authorization", "req.headers.cookie"] },
    genReqId: () => randomUUID(),
    bodyLimit: 1_000_000,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: "array", useDefaults: true } },
  });
  const routes: RegisteredRoute[] = [];

  app.addHook("onRequest", async (req, reply) => {
    req.correlationId = correlationIdOf(req);
    reply.header("x-correlation-id", req.correlationId);
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
  });

  app.setErrorHandler((error, req, reply) => {
    const { status, body } = toHttpError(error, req.correlationId);
    if (status >= 500) {
      // Diagnostic log (AUD-17): error class, code and bounded message only; never request bodies.
      const e = error as Error & { code?: string };
      req.log.error({ correlationId: req.correlationId, url: req.routeOptions.url, errorName: e.name, errorCode: e.code, message: String(e.message).slice(0, 300) }, "request failed");
    }
    void reply.code(status).send(body);
  });
  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found.", correlationId: req.correlationId } });
  });

  app.get("/health", async () => {
    const r = await deps.appPool.query<{ ok: number }>("SELECT 1 AS ok");
    return { status: "ok", database: r.rows[0]?.ok === 1 ? "ok" : "unknown", environment: deps.config.environment, devAuth: deps.config.devAuth };
  });

  const routeDeps = { appPool: deps.appPool, devAuth: deps.config.devAuth, routes };
  organizationRoutes(app, routeDeps);
  accessRoutes(app, routeDeps);
  peopleRoutes(app, routeDeps);
  auditRoutes(app, routeDeps);
  if (deps.config.devAuth) devRoutes(app, deps.config.repoRoot);

  return Object.assign(app, { tenantRoutes: routes });
}
