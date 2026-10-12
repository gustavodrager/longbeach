-- Somente leitura. psql -X -v ON_ERROR_STOP=1 -v month=2026-10 -f scripts/auditar-operacao.sql
-- Sem nomes, documentos, contatos, tokens ou payloads no resultado.
\set ON_ERROR_STOP on
\if :{?month}
\else
\echo 'Informe -v month=AAAA-MM explicitamente.'
\quit 2
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
WITH params AS (
  SELECT (:'month' || '-01')::date AS first_day,
         ((:'month' || '-01')::date + interval '1 month')::date AS next_month
), records AS (
  SELECT "Id"::text AS id, "Kind" AS kind, "Payload" AS p FROM operational_records
  WHERE "Kind" IN ('courts','reservations','classes','rentalGroups','rentalMonths','financeEntries')
), months AS (
  SELECT * FROM records WHERE kind='rentalMonths' AND p->>'month'=:'month'
), reservations AS (
  SELECT r.* FROM records r, params d WHERE kind='reservations'
  AND p->>'date'>=d.first_day::text AND p->>'date'<d.next_month::text
), charges AS (
  SELECT * FROM records WHERE kind='financeEntries' AND p->>'status'<>'Cancelado'
), intervals AS (
  SELECT id, p->>'courtId' AS court, p->>'date' AS day,
         p->>'startTime' AS begins, p->>'endTime' AS ends
  FROM reservations WHERE p->>'status'<>'Cancelada'
  UNION ALL
  SELECT r.id, r.p->>'courtId', d.day::date::text, r.p->>'startTime', r.p->>'endTime'
  FROM records r CROSS JOIN params t
  CROSS JOIN LATERAL generate_series(t.first_day::timestamp, (t.next_month-1)::timestamp, interval '1 day') d(day)
  WHERE r.kind='classes' AND r.p->>'status'='Ativa'
    AND extract(dow FROM d.day)::int::text=r.p->>'weekDay'
    AND (coalesce(r.p->>'startDate','')='' OR r.p->>'startDate'<=d.day::date::text)
), checks AS (
  SELECT 'integridade' AS category, 'conflitos_agenda' AS code, count(*) AS total
  FROM intervals a JOIN intervals b ON a.id<b.id AND a.court=b.court AND a.day=b.day AND a.begins<b.ends AND b.begins<a.ends
  UNION ALL
  SELECT 'integridade','cobrancas_duplicadas_competencia',count(*) FROM (
    SELECT p->>'sourceId',p->>'month' FROM charges
    WHERE p->>'sourceKind' IN ('rentalMonths','enrollments') AND p->>'month'=:'month'
    GROUP BY p->>'sourceId',p->>'month' HAVING count(*)>1
  ) duplicates
  UNION ALL
  SELECT 'integridade','cobrancas_individuais_de_mensalista',count(*) FROM charges c
  JOIN reservations r ON c.p->>'sourceKind'='reservations' AND c.p->>'sourceId'=r.id
  WHERE nullif(r.p->>'rentalGroupId','') IS NOT NULL
  UNION ALL
  SELECT 'integridade','encontros_sem_competencia',count(*) FROM reservations r
  WHERE nullif(r.p->>'rentalGroupId','') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM records m WHERE m.kind='rentalMonths'
    AND m.p->>'rentalGroupId'=r.p->>'rentalGroupId' AND m.p->>'month'=r.p->>'rentalMonth'
  )
  UNION ALL
  SELECT 'integridade','competencias_sem_grupo',count(*) FROM months m
  WHERE NOT EXISTS (SELECT 1 FROM records g WHERE g.kind='rentalGroups' AND g.id=m.p->>'rentalGroupId')
  UNION ALL
  SELECT 'integridade','competencias_com_encontros_ausentes',count(*) FROM months m
  WHERE jsonb_array_length(m.p->'dates')>(
    SELECT count(*) FROM records r WHERE r.kind='reservations'
    AND r.p->>'rentalGroupId'=m.p->>'rentalGroupId' AND r.p->>'rentalMonth'=m.p->>'month'
  )
  UNION ALL
  SELECT 'pendencia','grupos_ativos_sem_competencia',count(*) FROM records g,params d
  WHERE g.kind='rentalGroups' AND g.p->>'status'='Ativo'
  AND g.p->>'startDate'<d.next_month::text
  AND (coalesce(g.p->>'endDate','')='' OR g.p->>'endDate'>=d.first_day::text)
  AND NOT EXISTS (SELECT 1 FROM months m WHERE m.p->>'rentalGroupId'=g.id)
  UNION ALL
  SELECT 'pendencia','competencias_sem_cobranca_ativa',count(*) FROM months m
  WHERE NOT EXISTS (SELECT 1 FROM charges c WHERE c.p->>'sourceKind'='rentalMonths' AND c.p->>'sourceId'=m.id)
  UNION ALL
  SELECT 'pendencia','competencias_com_valor_ou_vencimento_pendente',count(*) FROM months
  WHERE p->>'amount' IS NULL OR nullif(p->>'dueDate','') IS NULL
)
SELECT jsonb_build_object(
  'schemaVersion',1,'month',:'month','observedAt',transaction_timestamp(),
  'readOnly',current_setting('transaction_read_only'),
  'postgresVersion',current_setting('server_version'),
  'counts',jsonb_build_object('rentalMonths',(SELECT count(*) FROM months),'reservations',(SELECT count(*) FROM reservations)),
  'checks',(SELECT jsonb_agg(jsonb_build_object('category',category,'code',code,'count',total) ORDER BY category,code) FROM checks),
  'edi',(SELECT jsonb_agg(jsonb_build_object('lastSuccess',last_success_utc,'completeThrough',complete_through,'failureCode',failure_code,'failureCount',failure_count)) FROM provider_sync_state WHERE provider='pagbank-edi')
);
ROLLBACK;
