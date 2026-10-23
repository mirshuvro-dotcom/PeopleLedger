-- Reverses 0003_people. Destructive.
DROP TABLE IF EXISTS employment_version;
DROP TABLE IF EXISTS employment;
DROP TABLE IF EXISTS person_version;
DROP TABLE IF EXISTS person;
DROP FUNCTION IF EXISTS app_version_row_close_only();
