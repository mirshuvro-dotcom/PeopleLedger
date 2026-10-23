# Workflow contract: membership (GOV-02)

Enforced by: `membership_transition()` trigger, `app_enforce_version()`, `membership_audit_required` (db/migrations/0002).
Tests: `packages/platform/test/db/workflow-authz.db.test.ts` ("membership state contract").

| Item | Contract |
|---|---|
| Actors | Tenant user with `membership:create` / `membership:edit` (API-layer check, not yet built); the invited user for acceptance only |
| Creation | `membership_invite(email)` in tenant context → status `invited`; links or creates the global `user_account` by normalized email |
| Preconditions | Tenant context and actor context set; expected `version` supplied |
| Checks | Allowed transition; version advances by exactly 1; no self change except accepting own invitation |
| Approvals | None at the data layer; RBAC-07 approval for sensitive roles is separate |
| Timeouts | None yet (invitation expiry is IAM-02, later) |
| Delegation | Not supported yet; delegated actors would carry `acting_as_user_id` in audit |
| Cancellation | `invited → revoked` |
| Reopening | Not allowed: `revoked` is terminal; re-invitation of a revoked user is an open question |
| External uncertainty | None (no external system involved) |
| Audit events | `membership.invited` (security), `membership.status_changed` (security, with reason and before/after status); commit refused without them |

## Transitions

| From \ To | invited | active | suspended | revoked |
|---|---|---|---|---|
| invited | — | ✓ (self allowed: accept) | ✗ | ✓ |
| active | ✗ | — | ✓ | ✓ |
| suspended | ✗ | ✓ | — | ✓ |
| revoked | ✗ | ✗ | ✗ | — |

Denials raise `INVALID_TRANSITION` (PL003), `SELF_APPROVAL_DENIED` (PL004) or `STALE_VERSION` (PL001).
