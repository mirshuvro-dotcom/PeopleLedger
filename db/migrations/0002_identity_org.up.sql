-- phase: expand
-- owner: platform
-- requirements: ARCH-05, ARCH-06, SEC-01, GOV-02, GOV-03
--
-- Legal entities, global user accounts, tenant memberships, permission
-- catalogue, tenant roles and scoped, effective-dated role assignments.

-- Legal entity -----------------------------------------------------------------

CREATE TABLE legal_entity (
  tenant_id     uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  legal_name_en text NOT NULL CHECK (length(btrim(legal_name_en)) BETWEEN 1 AND 300),
  legal_name_bn text CHECK (legal_name_bn IS NULL OR length(btrim(legal_name_bn)) BETWEEN 1 AND 300),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  -- ORG-08: production payroll stays off until a reviewed migration lifts this check.
  production_payroll_enabled boolean NOT NULL DEFAULT false CHECK (production_payroll_enabled = false),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by    text NOT NULL,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, id)
);
CREATE TRIGGER legal_entity_stamp BEFORE INSERT ON legal_entity FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('created');
CREATE TRIGGER legal_entity_version BEFORE UPDATE ON legal_entity FOR EACH ROW EXECUTE FUNCTION app_enforce_version();
CREATE CONSTRAINT TRIGGER legal_entity_audit_required AFTER INSERT OR UPDATE ON legal_entity
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'tenant_id');
SELECT app_enable_tenant_rls('legal_entity');
GRANT SELECT ON legal_entity TO pl_app;
GRANT INSERT (tenant_id, id, legal_name_en, legal_name_bn) ON legal_entity TO pl_app;
GRANT UPDATE (legal_name_en, legal_name_bn, status, version) ON legal_entity TO pl_app;

-- User account (global identity, IAM-04) --------------------------------------
-- Not tenant scoped: one person may belong to several tenants. A tenant sees an
-- account only through its own membership. Holds no profile data so linking an
-- existing account discloses nothing beyond the email the inviter supplied.

CREATE TABLE user_account (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND length(email) <= 320),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX user_account_email_key ON user_account (email);

-- Membership (user ↔ tenant) ---------------------------------------------------

CREATE TABLE membership (
  tenant_id  uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_account (id),
  status     text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, user_id)
);
CREATE TRIGGER membership_stamp BEFORE INSERT ON membership FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('created');
CREATE TRIGGER membership_version BEFORE UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION app_enforce_version();
CREATE CONSTRAINT TRIGGER membership_audit_required AFTER INSERT OR UPDATE ON membership
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'tenant_id');

-- GOV-02 state contract: docs/architecture/workflows/membership.md
CREATE FUNCTION membership_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) NOT IN (
    ('invited', 'active'), ('invited', 'revoked'),
    ('active', 'suspended'), ('suspended', 'active'),
    ('active', 'revoked'), ('suspended', 'revoked')
  ) THEN
    RAISE EXCEPTION 'membership transition % -> % is not allowed', OLD.status, NEW.status USING ERRCODE = 'PL003';
  END IF;
  -- Only accepting one's own invitation is a self-service transition.
  IF NEW.user_id = app_current_actor_user_id() AND NOT (OLD.status = 'invited' AND NEW.status = 'active') THEN
    RAISE EXCEPTION 'users cannot change their own membership status' USING ERRCODE = 'PL004';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER membership_transition BEFORE UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_transition();

SELECT app_enable_tenant_rls('membership');
GRANT SELECT ON membership TO pl_app;
GRANT UPDATE (status, version) ON membership TO pl_app;

ALTER TABLE user_account ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_account_member_read ON user_account FOR SELECT TO pl_app
  USING (EXISTS (SELECT 1 FROM membership m WHERE m.user_id = user_account.id));
GRANT SELECT ON user_account TO pl_app;

-- Invitation is the only way to create a membership. It links or creates the
-- global account by normalized email inside the current tenant context.
CREATE FUNCTION membership_invite(p_email text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t uuid := app_current_tenant();
  e text := lower(btrim(p_email));
  uid uuid;
  mid uuid;
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO user_account (email) VALUES (e) ON CONFLICT (email) DO NOTHING;
  SELECT id INTO uid FROM user_account WHERE email = e;
  INSERT INTO membership (tenant_id, user_id) VALUES (t, uid) RETURNING id INTO mid;
  RETURN mid;
END
$$;
REVOKE ALL ON FUNCTION membership_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION membership_invite(text) TO pl_app;

-- Permission catalogue (product-versioned, global, read-only at runtime) -------

CREATE TABLE permission (
  code              text PRIMARY KEY,
  resource          text NOT NULL CHECK (resource ~ '^[a-z][a-z_]{1,62}$'),
  action            text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'delete', 'approve', 'release', 'export', 'impersonate', 'configure')),
  description       text NOT NULL CHECK (length(btrim(description)) > 0),
  owner_module      text NOT NULL CHECK (owner_module IN ('platform', 'people', 'time', 'pay', 'insight')),
  sensitivity       text NOT NULL CHECK (sensitivity IN ('standard', 'sensitive', 'critical')),
  catalogue_version integer NOT NULL CHECK (catalogue_version >= 1),
  CHECK (code = resource || ':' || action)
);
GRANT SELECT ON permission TO pl_app, pl_platform;

INSERT INTO permission (code, resource, action, description, owner_module, sensitivity, catalogue_version) VALUES
  ('tenant:view',            'tenant',          'view',      'View the current tenant record',               'platform', 'standard',  1),
  ('legal_entity:view',      'legal_entity',    'view',      'View legal entities',                          'platform', 'standard',  1),
  ('legal_entity:create',    'legal_entity',    'create',    'Create legal entities',                        'platform', 'sensitive', 1),
  ('legal_entity:edit',      'legal_entity',    'edit',      'Edit legal entity names and status',           'platform', 'sensitive', 1),
  ('membership:view',        'membership',      'view',      'View tenant members',                          'platform', 'sensitive', 1),
  ('membership:create',      'membership',      'create',    'Invite users to the tenant',                   'platform', 'sensitive', 1),
  ('membership:edit',        'membership',      'edit',      'Activate, suspend or revoke memberships',      'platform', 'critical',  1),
  ('role:view',              'role',            'view',      'View roles and their permissions',             'platform', 'standard',  1),
  ('role:create',            'role',            'create',    'Create custom roles',                          'platform', 'critical',  1),
  ('role:edit',              'role',            'edit',      'Change role names and permissions',            'platform', 'critical',  1),
  ('role_assignment:view',   'role_assignment', 'view',      'View who holds which role',                    'platform', 'sensitive', 1),
  ('role_assignment:create', 'role_assignment', 'create',    'Assign roles to members',                      'platform', 'critical',  1),
  ('role_assignment:edit',   'role_assignment', 'edit',      'End role assignments',                         'platform', 'critical',  1),
  ('person:view',            'person',          'view',      'View person records',                          'people',   'sensitive', 1),
  ('person:create',          'person',          'create',    'Create person records',                        'people',   'sensitive', 1),
  ('person:edit',            'person',          'edit',      'Add person record versions',                   'people',   'sensitive', 1),
  ('employment:view',        'employment',      'view',      'View employment records',                      'people',   'sensitive', 1),
  ('employment:create',      'employment',      'create',    'Create employment records',                    'people',   'sensitive', 1),
  ('employment:edit',        'employment',      'edit',      'Add employment versions and end employment',   'people',   'sensitive', 1),
  ('audit_event:view',       'audit_event',     'view',      'Search the audit trail and verify integrity',  'platform', 'sensitive', 1),
  ('audit_event:export',     'audit_event',     'export',    'Export audit results',                         'platform', 'critical',  1);

-- Role -------------------------------------------------------------------------

CREATE TABLE role (
  tenant_id      uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description    text CHECK (description IS NULL OR length(description) <= 1000),
  is_system      boolean NOT NULL DEFAULT false,
  parent_role_id uuid,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by     text NOT NULL,
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, parent_role_id) REFERENCES role (tenant_id, id),
  CHECK (parent_role_id IS NULL OR parent_role_id <> id)
);
CREATE UNIQUE INDEX role_name_key ON role (tenant_id, lower(name));
CREATE TRIGGER role_stamp BEFORE INSERT ON role FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('created');
CREATE TRIGGER role_version BEFORE UPDATE ON role FOR EACH ROW EXECUTE FUNCTION app_enforce_version();
CREATE CONSTRAINT TRIGGER role_audit_required AFTER INSERT OR UPDATE ON role
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'tenant_id');
SELECT app_enable_tenant_rls('role');
GRANT SELECT ON role TO pl_app;
GRANT INSERT (tenant_id, id, name, description, parent_role_id) ON role TO pl_app;
GRANT UPDATE (name, description, version) ON role TO pl_app;

CREATE TABLE role_permission (
  tenant_id       uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  role_id         uuid NOT NULL,
  permission_code text NOT NULL REFERENCES permission (code),
  granted_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  granted_by      text NOT NULL,
  PRIMARY KEY (tenant_id, role_id, permission_code),
  FOREIGN KEY (tenant_id, role_id) REFERENCES role (tenant_id, id)
);
CREATE TRIGGER role_permission_stamp BEFORE INSERT ON role_permission FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('granted');
CREATE CONSTRAINT TRIGGER role_permission_audit_required AFTER INSERT OR DELETE ON role_permission
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('role_id', 'tenant_id');
SELECT app_enable_tenant_rls('role_permission');
GRANT SELECT, DELETE ON role_permission TO pl_app;
GRANT INSERT (tenant_id, role_id, permission_code) ON role_permission TO pl_app;

-- Role assignment (scoped, effective dated) ------------------------------------

CREATE TABLE role_assignment (
  tenant_id             uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  membership_id         uuid NOT NULL,
  role_id               uuid NOT NULL,
  scope_type            text NOT NULL CHECK (scope_type IN ('tenant', 'legal_entity')),
  scope_legal_entity_id uuid,
  effective_from        date NOT NULL,
  effective_to          date,
  reason                text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  recorded_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by           text NOT NULL,
  version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES membership (tenant_id, id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES role (tenant_id, id),
  FOREIGN KEY (tenant_id, scope_legal_entity_id) REFERENCES legal_entity (tenant_id, id),
  CHECK ((scope_type = 'tenant') = (scope_legal_entity_id IS NULL)),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (
    tenant_id WITH =, membership_id WITH =, role_id WITH =,
    (coalesce(scope_legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  )
);
CREATE TRIGGER role_assignment_stamp BEFORE INSERT ON role_assignment FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('recorded');
CREATE TRIGGER role_assignment_version BEFORE UPDATE ON role_assignment FOR EACH ROW EXECUTE FUNCTION app_enforce_version();
CREATE CONSTRAINT TRIGGER role_assignment_audit_required AFTER INSERT OR UPDATE ON role_assignment
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'tenant_id');

-- GOV-02 / SEC-02: nobody creates or alters their own role assignment.
CREATE FUNCTION role_assignment_no_self() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM membership m
    WHERE m.tenant_id = NEW.tenant_id AND m.id = NEW.membership_id AND m.user_id = app_current_actor_user_id()
  ) THEN
    RAISE EXCEPTION 'users cannot assign or change their own roles' USING ERRCODE = 'PL004';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER role_assignment_no_self BEFORE INSERT OR UPDATE ON role_assignment FOR EACH ROW EXECUTE FUNCTION role_assignment_no_self();

SELECT app_enable_tenant_rls('role_assignment');
GRANT SELECT ON role_assignment TO pl_app;
GRANT INSERT (tenant_id, id, membership_id, role_id, scope_type, scope_legal_entity_id, effective_from, effective_to, reason) ON role_assignment TO pl_app;
GRANT UPDATE (effective_to, version) ON role_assignment TO pl_app;

-- SEC-01 deny-by-default decision for the current tenant. Scope dimensions
-- implemented: tenant and legal entity. Others (location, department, reporting
-- line, self) are later RBAC-03 work.
CREATE FUNCTION app_has_permission(p_user uuid, p_permission text, p_legal_entity uuid, p_as_of date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(p_as_of IS NOT NULL AND EXISTS (
    SELECT 1
    FROM membership m
    JOIN user_account u ON u.id = m.user_id AND u.status = 'active'
    JOIN role_assignment ra ON ra.tenant_id = m.tenant_id AND ra.membership_id = m.id
    JOIN role_permission rp ON rp.tenant_id = ra.tenant_id AND rp.role_id = ra.role_id
    WHERE m.tenant_id = app_current_tenant()
      AND m.user_id = p_user
      AND m.status = 'active'
      AND rp.permission_code = p_permission
      AND ra.effective_from <= p_as_of
      AND (ra.effective_to IS NULL OR p_as_of <= ra.effective_to)
      AND (ra.scope_type = 'tenant' OR (ra.scope_type = 'legal_entity' AND ra.scope_legal_entity_id = p_legal_entity))
  ), false)
$$;
