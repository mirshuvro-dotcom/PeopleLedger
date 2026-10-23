import { DbRuleError } from "@peopleledger/platform";

/** Stable API error codes (Section 19 item 4). Messages never echo other tenants' data. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = () => new ApiError(404, "NOT_FOUND", "Not found.");
export const unauthenticated = (message = "Sign-in required.") => new ApiError(401, "UNAUTHENTICATED", message);

const STATUS: Record<string, [number, string?]> = {
  PERMISSION_DENIED: [403, "You do not have permission for this action."],
  SELF_APPROVAL_DENIED: [403],
  STALE_VERSION: [409],
  INVALID_TRANSITION: [409],
  DUPLICATE: [409, "A record with the same unique value already exists."],
  EFFECTIVE_RANGE_OVERLAP: [409, "The date range overlaps an existing one."],
  IMMUTABLE_RECORD: [409],
  REFERENCE_NOT_FOUND: [422, "A referenced record was not found."],
  CONSTRAINT_VIOLATION: [422, "The values break a data rule."],
  TENANT_CONTEXT: [400],
};

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly correlationId: string };
}

/** Map any thrown error to an HTTP status and safe body. Unknown errors become 500 without details. */
export function toHttpError(error: unknown, correlationId: string): { status: number; body: ErrorBody } {
  if (error instanceof ApiError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, correlationId } } };
  }
  if (error instanceof DbRuleError && error.code in STATUS) {
    const [status, safeMessage] = STATUS[error.code]!;
    return { status, body: { error: { code: error.code, message: safeMessage ?? error.message, correlationId } } };
  }
  const validation = (error as { validation?: unknown; message?: string } | null)?.validation;
  if (validation) {
    return { status: 400, body: { error: { code: "VALIDATION_FAILED", message: (error as Error).message, correlationId } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL", message: "Unexpected error. Quote the correlation id when reporting it.", correlationId } } };
}
