-- Reverses 0001_foundation. Destructive: removes every tenant and audit row.
DROP FUNCTION IF EXISTS provision_tenant(text, text);
DROP FUNCTION IF EXISTS audit_verify_chain(uuid);
DROP TRIGGER IF EXISTS audit_event_chain ON audit_event;
DROP FUNCTION IF EXISTS audit_event_hash(audit_event);
DROP TABLE IF EXISTS audit_event;
DROP TABLE IF EXISTS audit_chain_head;
DROP FUNCTION IF EXISTS audit_event_chain();
DROP FUNCTION IF EXISTS audit_event_immutable();
DROP TABLE IF EXISTS tenant;
DROP FUNCTION IF EXISTS app_enable_tenant_rls(regclass);
DROP FUNCTION IF EXISTS app_audit_required();
DROP FUNCTION IF EXISTS app_enforce_version();
DROP FUNCTION IF EXISTS app_stamp_insert();
DROP FUNCTION IF EXISTS app_current_actor_user_id();
DROP FUNCTION IF EXISTS app_current_actor_id();
DROP FUNCTION IF EXISTS app_current_tenant();
DROP EXTENSION IF EXISTS btree_gist;
