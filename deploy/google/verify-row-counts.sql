-- Counts only, no business records or credentials. Run source and restored target
-- in a write-free window; save outputs outside the repository and compare.
\set ON_ERROR_STOP on
SELECT format('SELECT %L AS tabela, count(*) AS registros FROM %I.%I;',
              schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec
