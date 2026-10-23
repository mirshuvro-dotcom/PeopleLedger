-- Reverses 0002_identity_org. Destructive.
DROP FUNCTION IF EXISTS app_has_permission(uuid, text, uuid, date);
DROP TABLE IF EXISTS role_assignment;
DROP FUNCTION IF EXISTS role_assignment_no_self();
DROP TABLE IF EXISTS role_permission;
DROP TABLE IF EXISTS role;
DROP TABLE IF EXISTS permission;
DROP FUNCTION IF EXISTS membership_invite(text);
DROP POLICY IF EXISTS user_account_member_read ON user_account;
DROP TABLE IF EXISTS membership;
DROP FUNCTION IF EXISTS membership_transition();
DROP TABLE IF EXISTS user_account;
DROP TABLE IF EXISTS legal_entity;
