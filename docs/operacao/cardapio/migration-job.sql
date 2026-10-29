BEGIN;
SET LOCAL ROLE longbeach_migrator;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SELECT pg_advisory_xact_lock(724031905);
DO $menu_guard$
DECLARE actual text[];
BEGIN
  SELECT array_agg("MigrationId"::text ORDER BY "MigrationId" COLLATE "C") INTO actual FROM "__EFMigrationsHistory";
  IF actual IS DISTINCT FROM ARRAY[
    '20261001000100_InitialCreate',
    '20261001000200_OperationalRecords',
    '20261003151414_BarCatalog',
    '20261003152010_BarStock',
    '20261003152654_BarCash',
    '20261003152902_BarSales',
    '20261003153154_BarPurchases',
    '20261003153405_BarPixReconciliation',
    '20261003153919_BarPaymentTendered',
    '20261003154316_BarCatalogMetadataDiscounts',
    '20261003160000_BarLedgerIntegrity',
    '20261003160100_BarPermissions',
    '20261003163701_BarPurchasesDetails',
    '20261004100000_ImportStaging',
    '20261004110000_BarTabs',
    '20261004120000_BarRecipes',
    '20261006010000_FinancialHistory',
    '20261006021750_IndividualFirstAccess',
    '20261006194848_UnifiedBilling',
    '20261006195814_BillingProviderOrders',
    '20261013164058_TabObservations',
    '20261013190000_SubscriptionCreationRecovery',
    '20261014113613_ReceivedInvoices',
    '20261020010000_C6Banking',
    '20261020011757_BarTerminalManual',
    '20261020020000_C6PaymentProviders',
    '20261021154910_ExpenseAttachments',
    '20261027135728_MaterialStockLedger',
    '20261029121159_UnifiedCustomers'
  ]::text[] THEN RAISE EXCEPTION 'Cardápio: schema anterior divergente; execução recusada'; END IF;
  IF to_regclass('public.bar_menu') IS NOT NULL THEN RAISE EXCEPTION 'Cardápio: tabela já existe; execução recusada'; END IF;
END $menu_guard$;
CREATE TABLE bar_menu (
    "Id" uuid NOT NULL,
    "DraftJson" jsonb NOT NULL,
    "PublishedJson" jsonb,
    "Version" integer NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "UpdatedAtUtc" timestamp with time zone,
    CONSTRAINT "PK_bar_menu" PRIMARY KEY ("Id")
);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261029210216_DigitalMenu', '10.0.0');
GRANT SELECT, INSERT, UPDATE ON TABLE bar_menu TO longbeach_runtime;
REVOKE DELETE ON TABLE bar_menu FROM longbeach_runtime;
COMMIT;
