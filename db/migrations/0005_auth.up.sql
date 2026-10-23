-- phase: expand
-- owner: platform
-- requirements: IAM-01, IAM-02, IAM-04, IAM-05, NFR-02, SEC-05, RBAC-17, AUD-01
--
-- Authentication: password credentials, TOTP MFA, recovery codes, login
-- challenges, sessions, one-time setup links and an append-only authentication
-- event log. These tables are user-level (not tenant scoped) and are reachable
-- only by the pl_auth role; the tenant data role pl_app gets narrow
-- SECURITY DEFINER functions instead of table grants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_auth') THEN
    RAISE EXCEPTION 'Runtime role pl_auth missing: run db/roles.sql as a cluster administrator first';
  END IF;
END
$$;

-- The authentication service looks accounts up by email before any tenant is known.
CREATE POLICY user_account_auth_read ON user_account FOR SELECT TO pl_auth USING (true);
GRANT SELECT ON user_account TO pl_auth;
GRANT SELECT ON tenant TO pl_auth;
CREATE POLICY tenant_auth_read ON tenant FOR SELECT TO pl_auth USING (true);

CREATE TABLE user_credential (
  user_id             uuid PRIMARY KEY REFERENCES user_account (id),
  password_hash       text NOT NULL CHECK (password_hash ~ '^scrypt\$'),
  password_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  failed_attempts     integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- TOTP secret encrypted by the application (AES-256-GCM, NFR-01); last_used_step blocks replay.
CREATE TABLE user_totp (
  user_id           uuid PRIMARY KEY REFERENCES user_account (id),
  secret_ciphertext text NOT NULL CHECK (secret_ciphertext ~ '^v1:'),
  confirmed_at      timestamptz,
  last_used_step    bigint,
  created_at        timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE user_recovery_code (
  user_id    uuid NOT NULL REFERENCES user_account (id),
  code_hash  text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  used_at    timestamptz,
  PRIMARY KEY (user_id, code_hash)
);

-- A password-verified login waiting for MFA and/or tenant choice.
CREATE TABLE auth_challenge (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id         uuid NOT NULL REFERENCES user_account (id),
  mfa_required    boolean NOT NULL,
  mfa_verified_at timestamptz,
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  CHECK (expires_at > created_at)
);

-- One session per user per tenant (IAM-04). Only the token hash is stored.
CREATE TABLE auth_session (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash              text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id                 uuid NOT NULL,
  tenant_id               uuid NOT NULL,
  mfa_verified            boolean NOT NULL,
  mfa_enrollment_required boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  idle_expires_at         timestamptz NOT NULL,
  absolute_expires_at     timestamptz NOT NULL,
  revoked_at              timestamptz,
  revoked_reason          text CHECK (revoked_reason IS NULL OR length(revoked_reason) <= 200),
  ip_address              inet,
  user_agent              text CHECK (user_agent IS NULL OR length(user_agent) <= 1000),
  -- A session can only exist for an actual member of the tenant.
  FOREIGN KEY (tenant_id, user_id) REFERENCES membership (tenant_id, user_id),
  CHECK (absolute_expires_at > created_at),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE INDEX auth_session_user ON auth_session (user_id) WHERE revoked_at IS NULL;

-- One-time link an administrator issues so an invited member can set a password,
-- or a member can reset one (account recovery, IAM-01). Delivered by email later (COM-01).
CREATE TABLE auth_setup_token (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  tenant_id     uuid NOT NULL,
  membership_id uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES user_account (id),
  purpose       text NOT NULL CHECK (purpose IN ('initial-password', 'password-reset')),
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES membership (tenant_id, id),
  CHECK (expires_at > created_at)
);

-- Authentication events (AUD-01). User-level and append-only; tenant-relevant events
-- (session created/revoked) are also written to that tenant's hash-chained audit_event.
CREATE TABLE auth_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  event          text NOT NULL CHECK (event IN (
                   'login.password_accepted', 'login.failed', 'login.locked', 'mfa.verified', 'mfa.failed',
                   'mfa.recovery_code_used', 'mfa.enrolled', 'session.created', 'session.revoked',
                   'password.set', 'password.changed', 'setup_link.used')),
  result         text NOT NULL CHECK (result IN ('success', 'failed', 'denied')),
  user_id        uuid REFERENCES user_account (id),
  tenant_id      uuid REFERENCES tenant (id),
  session_id     uuid,
  reason         text CHECK (reason IS NULL OR length(reason) <= 200),
  ip_address     inet,
  user_agent     text CHECK (user_agent IS NULL OR length(user_agent) <= 1000),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 200)
);
CREATE INDEX auth_event_user ON auth_event (user_id, occurred_at DESC);

CREATE FUNCTION auth_event_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth_event is append-only (% refused)', TG_OP USING ERRCODE = 'PL005';
END
$$;
CREATE TRIGGER auth_event_no_change BEFORE UPDATE OR DELETE ON auth_event FOR EACH ROW EXECUTE FUNCTION auth_event_immutable();
CREATE TRIGGER auth_event_no_truncate BEFORE TRUNCATE ON auth_event FOR EACH STATEMENT EXECUTE FUNCTION auth_event_immutable();

GRANT SELECT, INSERT, UPDATE ON user_credential, user_totp, auth_challenge, auth_session, auth_setup_token TO pl_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_recovery_code TO pl_auth;
GRANT SELECT, INSERT ON auth_event TO pl_auth;

-- Tenants where the user holds a membership, for the tenant chooser after login.
CREATE FUNCTION auth_user_tenants(p_user uuid)
RETURNS TABLE (tenant_id uuid, tenant_name text, membership_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.id, t.name, m.status FROM membership m JOIN tenant t ON t.id = m.tenant_id
  WHERE m.user_id = p_user AND t.status = 'active'
  ORDER BY t.name
$$;
REVOKE ALL ON FUNCTION auth_user_tenants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_tenants(uuid) TO pl_auth;

-- Issued by a tenant administrator inside tenant context (pl_app); the API checks membership:create first.
CREATE FUNCTION auth_issue_setup_token(p_membership uuid, p_token_hash text, p_purpose text, p_ttl_hours integer)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t uuid := app_current_tenant();
  uid uuid;
  expires timestamptz := clock_timestamp() + make_interval(hours => p_ttl_hours);
BEGIN
  IF t IS NULL OR app_current_actor_id() IS NULL THEN
    RAISE EXCEPTION 'tenant and actor context required' USING ERRCODE = '42501';
  END IF;
  IF p_ttl_hours NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'setup link lifetime must be 1..168 hours' USING ERRCODE = '22023';
  END IF;
  SELECT m.user_id INTO uid FROM membership m WHERE m.tenant_id = t AND m.id = p_membership AND m.status IN ('invited', 'active');
  IF uid IS NULL THEN
    RAISE EXCEPTION 'membership not found' USING ERRCODE = '23503';
  END IF;
  IF uid = app_current_actor_user_id() THEN
    RAISE EXCEPTION 'users cannot issue access links for themselves' USING ERRCODE = 'PL004';
  END IF;
  -- Only the newest link stays usable.
  UPDATE auth_setup_token SET used_at = clock_timestamp() WHERE user_id = uid AND tenant_id = t AND used_at IS NULL;
  INSERT INTO auth_setup_token (token_hash, tenant_id, membership_id, user_id, purpose, created_by, expires_at)
  VALUES (p_token_hash, t, p_membership, uid, p_purpose, app_current_actor_id(), expires);
  RETURN expires;
END
$$;
REVOKE ALL ON FUNCTION auth_issue_setup_token(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_issue_setup_token(uuid, text, text, integer) TO pl_app;

-- RBAC-17: removing someone's access ends their sessions in this tenant immediately.
CREATE FUNCTION auth_revoke_member_sessions(p_user uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t uuid := app_current_tenant();
  n integer;
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = '42501';
  END IF;
  UPDATE auth_session SET revoked_at = clock_timestamp(), revoked_reason = left(p_reason, 200)
  WHERE user_id = p_user AND tenant_id = t AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
REVOKE ALL ON FUNCTION auth_revoke_member_sessions(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_revoke_member_sessions(uuid, text) TO pl_app;

-- Critical permissions held now (SEC-05: MFA required for privileged users). Read by pl_auth at login.
CREATE FUNCTION auth_user_is_privileged(p_user uuid, p_tenant uuid, p_as_of date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership m
    JOIN role_assignment ra ON ra.tenant_id = m.tenant_id AND ra.membership_id = m.id
    JOIN role_permission rp ON rp.tenant_id = ra.tenant_id AND rp.role_id = ra.role_id
    JOIN permission p ON p.code = rp.permission_code AND p.sensitivity = 'critical'
    WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.status = 'active'
      AND ra.effective_from <= p_as_of AND (ra.effective_to IS NULL OR p_as_of <= ra.effective_to)
  )
$$;
REVOKE ALL ON FUNCTION auth_user_is_privileged(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_is_privileged(uuid, uuid, date) TO pl_auth;
