# Workflow contract: role assignment (GOV-02)

Enforced by: exclusion constraint, `role_assignment_no_self()`, `app_enforce_version()`, column grants,
`role_assignment_audit_required` (db/migrations/0002). Tests: `workflow-authz.db.test.ts` ("role assignment contract").

| Item | Contract |
|---|---|
| Actors | Tenant user with `role_assignment:create` / `:edit` (API-layer check, not yet built) |
| States | Derived from dates: future (`effective_from` > as-of), in force, ended (`effective_to` < as-of) |
| Preconditions | Membership, role and (for entity scope) legal entity exist in the same tenant |
| Checks | Scope type matches scope columns; `effective_to ≥ effective_from`; no overlapping interval for the same membership, role and scope; assignee ≠ acting user; version advances by 1 |
| Approvals | Sensitive-role approval (RBAC-07) not yet built; self-assignment is always refused |
| Timeouts | Assignment ends automatically at `effective_to` (authorization checks the as-of date) |
| Delegation | Not yet; RBAC-08 |
| Cancellation | Set `effective_to` (only `effective_to` and `version` are updatable) |
| Reopening | Not by update of a past interval; add a new assignment for a new interval |
| External uncertainty | None |
| Audit events | `role_assignment.created`, `role_assignment.ended` (security); dates and scope recorded as restricted markers |

Denials: `SELF_APPROVAL_DENIED`, `EFFECTIVE_RANGE_OVERLAP`, `CONSTRAINT_VIOLATION`, `STALE_VERSION`, `PERMISSION_DENIED`
(attempt to write `recorded_*`, `is_system` or other non-granted columns).
