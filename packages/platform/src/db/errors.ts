/**
 * Typed errors for database rules. SQLSTATE codes `PL001`..`PL006` are raised by
 * triggers in db/migrations; mapping them keeps reason codes stable for callers
 * (Section 19 item 4).
 */
export class DbRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly sqlState?: string,
  ) {
    super(message);
    this.name = "DbRuleError";
  }
}

const BY_SQLSTATE: Record<string, string> = {
  PL001: "STALE_VERSION",
  PL002: "AUDIT_REQUIRED",
  PL003: "INVALID_TRANSITION",
  PL004: "SELF_APPROVAL_DENIED",
  PL005: "IMMUTABLE_RECORD",
  PL006: "ACTOR_CONTEXT_REQUIRED",
  "42501": "PERMISSION_DENIED",
  "23503": "REFERENCE_NOT_FOUND",
  "23505": "DUPLICATE",
  "23514": "CONSTRAINT_VIOLATION",
  "23P01": "EFFECTIVE_RANGE_OVERLAP",
};

/** Convert a pg error into a `DbRuleError` with a stable code; other errors pass through. */
export function mapDbError(error: unknown): unknown {
  if (error instanceof DbRuleError) return error;
  const sqlState = (error as { code?: unknown } | null)?.code;
  if (typeof sqlState === "string" && sqlState in BY_SQLSTATE) {
    return new DbRuleError(BY_SQLSTATE[sqlState]!, (error as Error).message, sqlState);
  }
  return error;
}

export class StaleVersionError extends DbRuleError {
  constructor(resource: string, id: string) {
    super("STALE_VERSION", `${resource} ${id} was changed by someone else or does not exist; reload and retry.`);
  }
}

export class TenantContextError extends DbRuleError {
  constructor(message: string) {
    super("TENANT_CONTEXT", message);
  }
}

export class DbConfigError extends DbRuleError {
  constructor(message: string) {
    super("DB_CONFIG", message);
  }
}
