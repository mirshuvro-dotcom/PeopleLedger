-- Cluster-level runtime roles for PeopleLedger (ARCH-06, RBAC-15).
-- Run once per PostgreSQL cluster by a cluster administrator, before migrations.
-- Roles are global to the cluster, so they are not created or dropped by
-- per-database migrations. Login users are environment configuration and are
-- created separately (test setup creates synthetic ones).
--
--   pl_app      request handling; subject to row-level security
--   pl_worker   background jobs; member of pl_app plus outbox claim rights
--   pl_platform platform operations (tenant provisioning); no tenant data access
--   pl_auth     authentication service (credentials, sessions); no tenant data access
--
-- None of these roles may own tables or hold BYPASSRLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_app') THEN
    CREATE ROLE pl_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_worker') THEN
    CREATE ROLE pl_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_platform') THEN
    CREATE ROLE pl_platform NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pl_auth') THEN
    CREATE ROLE pl_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid AND r.rolname = 'pl_app'
    JOIN pg_roles w ON w.oid = m.member AND w.rolname = 'pl_worker'
  ) THEN
    GRANT pl_app TO pl_worker;
  END IF;
END
$$;
