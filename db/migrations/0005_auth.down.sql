-- Reverses 0005_auth. Destructive: removes all credentials, MFA secrets and sessions.
DROP FUNCTION IF EXISTS auth_user_is_privileged(uuid, uuid, date);
DROP FUNCTION IF EXISTS auth_revoke_member_sessions(uuid, text);
DROP FUNCTION IF EXISTS auth_issue_setup_token(uuid, text, text, integer);
DROP FUNCTION IF EXISTS auth_user_tenants(uuid);
DROP TABLE IF EXISTS auth_event;
DROP FUNCTION IF EXISTS auth_event_immutable();
DROP TABLE IF EXISTS auth_setup_token;
DROP TABLE IF EXISTS auth_session;
DROP TABLE IF EXISTS auth_challenge;
DROP TABLE IF EXISTS user_recovery_code;
DROP TABLE IF EXISTS user_totp;
DROP TABLE IF EXISTS user_credential;
DROP POLICY IF EXISTS tenant_auth_read ON tenant;
REVOKE ALL ON tenant FROM pl_auth;
DROP POLICY IF EXISTS user_account_auth_read ON user_account;
REVOKE ALL ON user_account FROM pl_auth;
