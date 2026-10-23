-- phase: expand
-- owner: people
-- requirements: ARCH-05, ARCH-06, GOV-03 (EMP-01 / EMP-08 storage pattern)
--
-- Person and Employment anchors with append-only, effective-dated versions.
-- Anchors hold identity and the optimistic version of the aggregate; version
-- rows hold attributes with business-effective dates and DB-recorded time.

CREATE TABLE person (
  tenant_id  uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, id)
);
CREATE TRIGGER person_stamp BEFORE INSERT ON person FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('created');
CREATE TRIGGER person_version_bump BEFORE UPDATE ON person FOR EACH ROW EXECUTE FUNCTION app_enforce_version();
CREATE CONSTRAINT TRIGGER person_audit_required AFTER INSERT OR UPDATE ON person
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'tenant_id');
SELECT app_enable_tenant_rls('person');
GRANT SELECT ON person TO pl_app;
GRANT INSERT (tenant_id, id) ON person TO pl_app;
GRANT UPDATE (version) ON person TO pl_app;

-- Closing an open version is the only permitted change to a version row.
-- Rewriting a closed interval is a correction workflow, not an update.
CREATE FUNCTION app_version_row_close_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'only an open version may be closed; history is immutable' USING ERRCODE = 'PL005';
  END IF;
  RETURN NEW;
END
$$;

CREATE TABLE person_version (
  tenant_id      uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  person_id      uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,
  legal_name_en  text NOT NULL CHECK (length(btrim(legal_name_en)) BETWEEN 1 AND 300),
  legal_name_bn  text CHECK (legal_name_bn IS NULL OR length(btrim(legal_name_bn)) BETWEEN 1 AND 300),
  preferred_name text CHECK (preferred_name IS NULL OR length(btrim(preferred_name)) BETWEEN 1 AND 300),
  birth_date     date CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01'),
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by    text NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, person_id) REFERENCES person (tenant_id, id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (tenant_id WITH =, person_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);
CREATE TRIGGER person_version_stamp BEFORE INSERT ON person_version FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('recorded');
CREATE TRIGGER person_version_close_only BEFORE UPDATE ON person_version FOR EACH ROW EXECUTE FUNCTION app_version_row_close_only();
CREATE CONSTRAINT TRIGGER person_version_audit_required AFTER INSERT OR UPDATE ON person_version
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('person_id', 'tenant_id');
SELECT app_enable_tenant_rls('person_version');
GRANT SELECT ON person_version TO pl_app;
GRANT INSERT (tenant_id, id, person_id, effective_from, effective_to, legal_name_en, legal_name_bn, preferred_name, birth_date) ON person_version TO pl_app;
GRANT UPDATE (effective_to) ON person_version TO pl_app;

CREATE TABLE employment (
  tenant_id       uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  person_id       uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  employee_code   text NOT NULL CHECK (employee_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  hire_date       date NOT NULL,
  end_date        date,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by      text NOT NULL,
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, person_id) REFERENCES person (tenant_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entity (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, employee_code),
  CHECK (end_date IS NULL OR end_date >= hire_date)
);
CREATE TRIGGER employment_stamp BEFORE INSERT ON employment FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('created');
CREATE TRIGGER employment_version_bump BEFORE UPDATE ON employment FOR EACH ROW EXECUTE FUNCTION app_enforce_version();
CREATE CONSTRAINT TRIGGER employment_audit_required AFTER INSERT OR UPDATE ON employment
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('id', 'tenant_id');
SELECT app_enable_tenant_rls('employment');
GRANT SELECT ON employment TO pl_app;
GRANT INSERT (tenant_id, id, person_id, legal_entity_id, employee_code, hire_date, end_date) ON employment TO pl_app;
GRANT UPDATE (end_date, version) ON employment TO pl_app;

CREATE TABLE employment_version (
  tenant_id      uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  employment_id  uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,
  job_title      text NOT NULL CHECK (length(btrim(job_title)) BETWEEN 1 AND 200),
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by    text NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, employment_id) REFERENCES employment (tenant_id, id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (tenant_id WITH =, employment_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);
CREATE TRIGGER employment_version_stamp BEFORE INSERT ON employment_version FOR EACH ROW EXECUTE FUNCTION app_stamp_insert('recorded');
CREATE TRIGGER employment_version_close_only BEFORE UPDATE ON employment_version FOR EACH ROW EXECUTE FUNCTION app_version_row_close_only();
CREATE CONSTRAINT TRIGGER employment_version_audit_required AFTER INSERT OR UPDATE ON employment_version
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_audit_required('employment_id', 'tenant_id');
SELECT app_enable_tenant_rls('employment_version');
GRANT SELECT ON employment_version TO pl_app;
GRANT INSERT (tenant_id, id, employment_id, effective_from, effective_to, job_title) ON employment_version TO pl_app;
GRANT UPDATE (effective_to) ON employment_version TO pl_app;
