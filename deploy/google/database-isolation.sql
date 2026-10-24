-- Run once as the instance administrator after Terraform creates an empty database.
-- No passwords are embedded. Set each password with psql \password interactively.
-- Usage: psql service=longbeach-admin -v ON_ERROR_STOP=1 -f deploy/google/database-isolation.sql
\set ON_ERROR_STOP on
\connect longbeach
BEGIN;

-- Stop on existing product roles instead of changing their permissions silently.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('longbeach_migrator', 'longbeach_runtime')) THEN
    RAISE EXCEPTION 'LongBeach roles already exist. Review live privileges; do not rerun bootstrap.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'longbeach') THEN
    RAISE EXCEPTION 'Create the empty longbeach database through Terraform first.';
  END IF;
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ) THEN
    RAISE EXCEPTION 'Target database is not empty. Review restore/ownership before proceeding.';
  END IF;
END $$;

CREATE ROLE longbeach_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE longbeach_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Cloud SQL admin may need membership to create a database owned by this role.
GRANT longbeach_migrator TO CURRENT_USER;
ALTER DATABASE longbeach OWNER TO longbeach_migrator;
REVOKE ALL ON DATABASE longbeach FROM PUBLIC;
GRANT CONNECT ON DATABASE longbeach TO longbeach_migrator, longbeach_runtime;
-- This is a new shared instance: application identities never need these DBs.
-- Preserve the instance administrator's access explicitly.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres, template1 TO CURRENT_USER;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO longbeach_migrator;
GRANT USAGE ON SCHEMA public TO longbeach_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE longbeach_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO longbeach_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE longbeach_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO longbeach_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE longbeach_migrator
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE longbeach_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO longbeach_runtime;
COMMIT;

-- After restore/migration, run as administrator to cover objects already present:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO longbeach_runtime;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO longbeach_runtime;
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
-- REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
-- REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO longbeach_runtime;
-- Each later client database must also REVOKE CONNECT FROM PUBLIC, grant only its
-- own roles, and own its schemas. Isolation is not achieved by a username alone.
