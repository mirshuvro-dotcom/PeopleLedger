-- phase: expand
-- owner: platform
-- requirements: ARCH-05, ARCH-06, NFR-03, AUD-01..AUD-09, RBAC-15
--
-- Tenant root, request-context helpers, append-only hash-chained audit trail,
-- and platform tenant provisioning.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_app')
     OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_worker')
     OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_platform') THEN
    RAISE EXCEPTION 'Runtime roles missing: run db/roles.sql as a cluster administrator first';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Request context ------------------------------------------------------------
-- Values are set per transaction with set_config(name, value, true) (SET LOCAL
-- semantics) and vanish at COMMIT/ROLLBACK. An unset or reset value yields
-- NULL, so tenant predicates match nothing: missing context fails closed.

CREATE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app_current_actor_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor_id', true), '') $$;

CREATE FUNCTION app_current_actor_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor_user_id', true), '')::uuid $$;

-- Stamps <prefix>_at / <prefix>_by from the database clock and actor context.
-- Clients cannot supply these values (EMP-08 recorded time, AUD-09).
CREATE FUNCTION app_stamp_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor text := app_current_actor_id();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'actor context required to write %', TG_TABLE_NAME USING ERRCODE = 'PL006';
  END IF;
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0] || '_at', clock_timestamp(), TG_ARGV[0] || '_by', actor));
  RETURN NEW;
END
$$;

-- Optimistic versioning (ARCH-05): every update must move version forward by one.
CREATE FUNCTION app_enforce_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'version must advance from % to %, got %', OLD.version, OLD.version + 1, NEW.version USING ERRCODE = 'PL001';
  END IF;
  RETURN NEW;
END
$$;

-- AUD-08: a sensitive change commits only if the same transaction wrote an audit
-- event for the same tenant and resource. Deferred to commit time, so callers may
-- write the audit row before or after the change. SECURITY DEFINER because the
-- check must run even for roles without audit read rights (platform provisioning).
CREATE FUNCTION app_audit_required() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM audit_event a
    WHERE a.tenant_id = (r ->> TG_ARGV[1])::uuid
      AND a.txid = txid_current()
      AND a.resource_id = r ->> TG_ARGV[0]
  ) THEN
    RAISE EXCEPTION 'audit event required for % % in the same transaction', TG_TABLE_NAME, r ->> TG_ARGV[0]
      USING ERRCODE = 'PL002';
  END IF;
  RETURN NULL;
END
$$;

-- Migration helper: standard tenant isolation policy for pl_app (and members).
CREATE FUNCTION app_enable_tenant_rls(p_table regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s FOR ALL TO pl_app '
    'USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
    p_table);
END
$$;
REVOKE ALL ON FUNCTION app_enable_tenant_rls(regclass) FROM PUBLIC;

-- Tenant -----------------------------------------------------------------------

CREATE TABLE tenant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  environment text NOT NULL CHECK (environment IN ('production', 'sandbox')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by  text NOT NULL,
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE TRIGGER tenant_stamp BEFORE INSERT ON tenant FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('created');
CREATE TRIGGER tenant_version BEFORE UPDATE ON tenant FOR EACH ROW EXECUTE FUNCTION app_enforce_version();

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenant FOR SELECT TO pl_app USING (id = app_current_tenant());
CREATE POLICY tenant_platform_read ON tenant FOR SELECT TO pl_platform USING (true);
GRANT SELECT ON tenant TO pl_app, pl_platform;

-- Audit trail (AUD-01..AUD-09, NFR-03) -----------------------------------------

CREATE TABLE audit_event (
  tenant_id         uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  seq               bigint NOT NULL,
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at       timestamptz NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  txid              bigint NOT NULL DEFAULT txid_current(),
  category          text NOT NULL CHECK (category IN ('security', 'data-change', 'financial', 'privacy', 'configuration', 'communication', 'integration', 'system')),
  action            text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.:-]{2,99}$'),
  actor_type        text NOT NULL CHECK (actor_type IN ('user', 'service-account', 'system-job', 'support-staff', 'platform-operator')),
  actor_id          text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 200),
  acting_as_user_id uuid,
  legal_entity_id   uuid,
  resource_type     text NOT NULL CHECK (resource_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  resource_id       text CHECK (resource_id IS NULL OR length(resource_id) BETWEEN 1 AND 200),
  result            text NOT NULL CHECK (result IN ('success', 'denied', 'failed')),
  reason            text CHECK (reason IS NULL OR length(reason) <= 2000),
  source            text NOT NULL CHECK (source IN ('web', 'api', 'mobile', 'integration', 'job', 'platform')),
  ip_address        inet,
  user_agent        text CHECK (user_agent IS NULL OR length(user_agent) <= 1000),
  request_id        text CHECK (request_id IS NULL OR length(request_id) <= 200),
  correlation_id    text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 200),
  before_ref        jsonb,
  after_ref         jsonb,
  prev_hash         text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  hash              text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, seq),
  UNIQUE (tenant_id, id)
);
CREATE INDEX audit_event_tx ON audit_event (tenant_id, txid, resource_id);
CREATE INDEX audit_event_resource ON audit_event (tenant_id, resource_type, resource_id);
CREATE INDEX audit_event_correlation ON audit_event (tenant_id, correlation_id);

-- Chain head per tenant; never granted to runtime roles.
CREATE TABLE audit_chain_head (
  tenant_id uuid PRIMARY KEY REFERENCES tenant (id),
  last_seq  bigint NOT NULL CHECK (last_seq >= 0),
  last_hash text NOT NULL CHECK (last_hash ~ '^[0-9a-f]{64}$')
);

-- Canonical hash of one audit row. Timestamps are rendered in UTC with fixed
-- precision so the result does not depend on session TimeZone.
CREATE FUNCTION audit_event_hash(e audit_event) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(e.prev_hash || '|' || jsonb_build_object(
    'tenant_id', e.tenant_id, 'seq', e.seq, 'id', e.id,
    'occurred_at', to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recorded_at', to_char(e.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'txid', e.txid, 'category', e.category, 'action', e.action,
    'actor_type', e.actor_type, 'actor_id', e.actor_id, 'acting_as_user_id', e.acting_as_user_id,
    'legal_entity_id', e.legal_entity_id, 'resource_type', e.resource_type, 'resource_id', e.resource_id,
    'result', e.result, 'reason', e.reason, 'source', e.source,
    'ip_address', host(e.ip_address), 'user_agent', e.user_agent,
    'request_id', e.request_id, 'correlation_id', e.correlation_id,
    'before_ref', e.before_ref, 'after_ref', e.after_ref
  )::text, 'UTF8')), 'hex')
$$;

-- Assigns seq, prev_hash, hash and DB-clock recorded_at. The head row lock
-- serializes audit writes per tenant until commit, so the chain stays gapless
-- under concurrency; a rolled-back transaction rolls back its head update too.
CREATE FUNCTION audit_event_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  h audit_chain_head%ROWTYPE;
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM app_current_tenant() THEN
    RAISE EXCEPTION 'audit tenant must equal the current tenant context' USING ERRCODE = '42501';
  END IF;
  INSERT INTO audit_chain_head (tenant_id, last_seq, last_hash)
  VALUES (NEW.tenant_id, 0, repeat('0', 64)) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO h FROM audit_chain_head WHERE tenant_id = NEW.tenant_id FOR UPDATE;
  NEW.seq := h.last_seq + 1;
  NEW.prev_hash := h.last_hash;
  NEW.recorded_at := clock_timestamp();
  NEW.txid := txid_current();
  NEW.hash := audit_event_hash(NEW);
  UPDATE audit_chain_head SET last_seq = NEW.seq, last_hash = NEW.hash WHERE tenant_id = NEW.tenant_id;
  RETURN NEW;
END
$$;
CREATE TRIGGER audit_event_chain BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION audit_event_chain();

CREATE FUNCTION audit_event_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only (% refused)', TG_OP USING ERRCODE = 'PL005';
END
$$;
CREATE TRIGGER audit_event_no_change BEFORE UPDATE OR DELETE ON audit_event FOR EACH ROW EXECUTE FUNCTION audit_event_immutable();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON audit_event FOR EACH STATEMENT EXECUTE FUNCTION audit_event_immutable();

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_read ON audit_event FOR SELECT TO pl_app USING (tenant_id = app_current_tenant());
CREATE POLICY audit_tenant_insert ON audit_event FOR INSERT TO pl_app WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT ON audit_event TO pl_app;

-- Integrity verification for the current tenant (AUD-06). Detects edited rows,
-- broken links, sequence gaps and a truncated tail (via the chain head).
CREATE FUNCTION audit_verify_chain(p_tenant uuid)
RETURNS TABLE (ok boolean, checked bigint, first_bad_seq bigint, problem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  e audit_event;
  h audit_chain_head%ROWTYPE;
  expected_prev text := repeat('0', 64);
  expected_seq bigint := 1;
  n bigint := 0;
BEGIN
  IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM app_current_tenant() THEN
    RAISE EXCEPTION 'only the current tenant chain can be verified' USING ERRCODE = '42501';
  END IF;
  FOR e IN SELECT * FROM audit_event a WHERE a.tenant_id = p_tenant ORDER BY a.seq LOOP
    n := n + 1;
    IF e.seq <> expected_seq THEN
      RETURN QUERY SELECT false, n, expected_seq, 'sequence gap'::text; RETURN;
    END IF;
    IF e.prev_hash <> expected_prev THEN
      RETURN QUERY SELECT false, n, e.seq, 'broken link to previous event'::text; RETURN;
    END IF;
    IF e.hash <> audit_event_hash(e) THEN
      RETURN QUERY SELECT false, n, e.seq, 'content does not match hash'::text; RETURN;
    END IF;
    expected_prev := e.hash;
    expected_seq := expected_seq + 1;
  END LOOP;
  SELECT * INTO h FROM audit_chain_head WHERE tenant_id = p_tenant;
  IF coalesce(h.last_seq, 0) <> n OR coalesce(h.last_hash, repeat('0', 64)) <> expected_prev THEN
    RETURN QUERY SELECT false, n, n + 1, 'chain head mismatch (missing tail events)'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, n, NULL::bigint, NULL::text;
END
$$;
REVOKE ALL ON FUNCTION audit_verify_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_verify_chain(uuid) TO pl_app;

CREATE CONSTRAINT TRIGGER tenant_audit_required AFTER INSERT OR UPDATE ON tenant
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'id');

-- Platform provisioning (RBAC-15) ---------------------------------------------
-- The only write path into tenant. Runs with platform actor context; writes the
-- tenant's first audit event; leaves no tenant context behind.
CREATE FUNCTION provision_tenant(p_name text, p_environment text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t uuid := gen_random_uuid();
  correlation text := nullif(current_setting('app.correlation_id', true), '');
BEGIN
  IF app_current_actor_id() IS NULL OR correlation IS NULL THEN
    RAISE EXCEPTION 'platform actor and correlation context required' USING ERRCODE = 'PL006';
  END IF;
  INSERT INTO tenant (id, name, environment) VALUES (t, p_name, p_environment);
  PERFORM set_config('app.tenant_id', t::text, true);
  INSERT INTO audit_event (tenant_id, occurred_at, category, action, actor_type, actor_id, resource_type, resource_id, result, source, correlation_id, after_ref)
  VALUES (t, clock_timestamp(), 'configuration', 'tenant.provisioned', 'platform-operator', app_current_actor_id(), 'tenant', t::text, 'success', 'platform', correlation,
          jsonb_build_object('environment', p_environment));
  PERFORM set_config('app.tenant_id', '', true);
  RETURN t;
END
$$;
REVOKE ALL ON FUNCTION provision_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_tenant(text, text) TO pl_platform;
