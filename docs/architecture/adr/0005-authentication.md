# ADR-0005: Authentication, MFA and sessions

- Status: Accepted
- Requirements: IAM-01 (partial), IAM-02 (partial), IAM-04 (partial), IAM-05 (partial), NFR-02 (partial), SEC-05 (partial),
  RBAC-17 (partial), AUD-01

## Decisions

**Separate role and pool.** Authentication tables (`user_credential`, `user_totp`, `user_recovery_code`,
`auth_challenge`, `auth_session`, `auth_setup_token`, `auth_event`) are reachable only by the `pl_auth` role through
its own connection pool. The tenant data role `pl_app` has no grants on them; it gets three narrow SECURITY DEFINER
functions (issue a setup link, revoke a member's sessions, nothing else). `pl_auth` cannot read tenant data.

**Passwords.** scrypt N=2^17, r=8, p=1 (OWASP minimum), parameters stored in the hash. Policy per NIST SP 800-63B:
12–128 characters, no composition rules, refusal of common and account-derived passwords from an offline list. A
breach-corpus (k-anonymity) check is a later adapter; it needs an outbound-network decision.

**Login flow.** Password → short-lived challenge (HttpOnly, SameSite=Strict cookie) → TOTP or single-use recovery code
when enrolled → choose a tenant where the user is an *active* member → session bound to that tenant (IAM-04).
One generic failure message and equal hashing work for unknown accounts prevent enumeration. 5 consecutive failures
lock the account for 15 minutes. Rate limits: 10 attempts per address+account and 100 per address per 5 minutes
(offices commonly share one public IP).

**TOTP.** RFC 6238 (SHA-1, 30 s, 6 digits), ±1 step drift, last used step stored so a code is never accepted twice.
Secrets encrypted with AES-256-GCM under `PEOPLELEDGER_DATA_KEY`, bound to the user id as associated data.
Enrolment returns 10 recovery codes once; only their sha256 is stored.

**SEC-05.** At session creation, a user holding any `critical` permission in that tenant without MFA gets a session
flagged `mfa_enrollment_required`: every tenant endpoint except `/v1/me` returns `MFA_ENROLLMENT_REQUIRED` until an
authenticator is confirmed.

**Sessions.** 256-bit random token in an HttpOnly, SameSite=Lax cookie (`Secure` in production); only sha256 stored.
30-minute idle and 12-hour absolute expiry. Password change ends other sessions; password reset ends all; suspending
or revoking a membership ends that tenant's sessions immediately (RBAC-17). A session can only exist for a member
(composite foreign key to `membership`).

**CSRF.** Cookie-authenticated POSTs need `x-pl-csrf: 1` and, when the browser sends one, an `Origin` equal to the
web origin. Login is protected the same way (login CSRF).

**Invitations and recovery.** No public sign-up. An administrator issues a one-time link (`initial-password` for an
invited member, `password-reset` for an active one; 72 h; newest only; never for oneself). Redeeming it sets the
password and accepts the invitation as the user. Email delivery replaces copy-and-send when COM-01 exists.

**Audit.** Every authentication event goes to the append-only `auth_event` log (no emails or passwords stored).
Session creation and revocation also go to the tenant's hash-chained `audit_event`, written before the session exists.

**Developer identity** remains as a dev-only shortcut for switching synthetic users quickly. A session cookie always
takes precedence, and the config still refuses developer identity in production.

## Not yet

WebAuthn passkeys (rest of IAM-01), trusted-device policy, breach-corpus check, per-tenant security policy settings
(IAM-02), unusual-login alerts (IAM-05, AUD-15), linking user accounts to person records (IAM-04), SSO/SCIM (IAM-03).
