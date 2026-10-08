import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const longbeach = github("gustavodrager/longbeach", { branch: "codex/pagbank-homologacao-20261007", commitSha: "99f81448b83a4d54e725d456b00d128db92c61cc" });
  const longbeach2 = github("gustavodrager/longbeach");

  const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 5000 });
  const api = service("api", {
    source: longbeach,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/api.Dockerfile" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    preDeploy: "dotnet LongBeach.Api.dll --migrate-only",
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { preDeployTimeoutSeconds: 300 },
    domains: ["api.longbeach.quebranunca.com.br"],
    env: { ASPNETCORE_ENVIRONMENT: preserve(), ASPNETCORE_URLS: preserve(), AllowedHosts: preserve(), Authentication__CookieDomain: preserve(), Authentication__Google__AllowedEmail: preserve(), Authentication__Google__ClientId: preserve(), Authentication__Google__Enabled: preserve(), Authentication__Google__ProvisionAllowedEmailsAsOwners: preserve(), Authentication__Jwt__AccessTokenMinutes: preserve(), Authentication__Jwt__Audience: preserve(), Authentication__Jwt__Issuer: preserve(), Authentication__Jwt__RefreshTokenDays: preserve(), Authentication__Jwt__SigningKey: preserve(), Authentication__MobileAllowedOrigins__0: preserve(), Authentication__MobileAllowedOrigins__1: preserve(), Authentication__MobileAllowedOrigins__2: preserve(), Authorization__SeedOnStartup: preserve(), Bootstrap__InitialOwner__Enabled: preserve(), ConnectionStrings__LongBeach: preserve(), Cors__AllowedOrigins__0: preserve(), Cors__AllowedOrigins__1: preserve(), Database__MigrateOnStartup: preserve(), DemoMode__PublicOperationalData: preserve(), HealthChecks__DatabaseEnabled: preserve(), Integrations__PagBankEdi__Enabled: preserve(), Integrations__PagBankEdi__Token: preserve(), Integrations__PagBankEdi__User: preserve(), PORT: preserve(), RAILWAY_DOCKERFILE_PATH: preserve(), ReverseProxy__TrustAllForwarders: preserve() },
  });
  const web = service("web", {
    source: longbeach,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/web.Dockerfile" },
    healthcheck: "/healthz",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    domains: ["longbeach.quebranunca.com.br"],
    env: { PORT: preserve(), RAILWAY_DOCKERFILE_PATH: preserve(), VITE_API_URL: preserve(), VITE_DEMO_MODE: preserve(), VITE_GOOGLE_CLIENT_ID: preserve(), VITE_OPERATIONAL_STORAGE: preserve() },
  });
  const webOperationsWCjo = service("web-operations-WCjo", {
    source: longbeach2,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/web.Dockerfile" },
    healthcheck: "/healthz",
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "web-operations-wcjo" },
    env: { VITE_API_URL: preserve(), VITE_DEMO_MODE: preserve(), VITE_GOOGLE_CLIENT_ID: preserve(), VITE_OPERATIONAL_STORAGE: preserve() },
  });
  const webOperations = service("web-operations", {
    source: longbeach2,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/web.Dockerfile" },
    healthcheck: "/healthz",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    env: { RAILWAY_DOCKERFILE_PATH: preserve(), VITE_API_URL: preserve(), VITE_DEMO_MODE: preserve(), VITE_OPERATIONAL_STORAGE: preserve() },
  });
  const apiOperations = service("api-operations", {
    source: longbeach2,
    build: { buildCommand: "dotnet publish src/LongBeach.Api/LongBeach.Api.csproj --configuration Release --output /app/publish /p:UseAppHost=false", buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/api.Dockerfile" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    preDeploy: "dotnet LongBeach.Api.dll --migrate-only",
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { preDeployTimeoutSeconds: 300 },
    env: { ASPNETCORE_ENVIRONMENT: preserve(), ASPNETCORE_URLS: preserve(), AllowedHosts: preserve(), Authentication__CookieDomain: preserve(), Authentication__Google__AllowedEmail: preserve(), Authentication__Google__ClientId: preserve(), Authentication__Google__Enabled: preserve(), Authentication__Google__ProvisionAllowedEmailsAsOwners: preserve(), Authentication__Jwt__AccessTokenMinutes: preserve(), Authentication__Jwt__Audience: preserve(), Authentication__Jwt__Issuer: preserve(), Authentication__Jwt__RefreshTokenDays: preserve(), Authentication__Jwt__SigningKey: preserve(), Authorization__SeedOnStartup: preserve(), Bootstrap__InitialOwner__Enabled: preserve(), ConnectionStrings__LongBeach: preserve(), Cors__AllowedOrigins__0: preserve(), Cors__AllowedOrigins__1: preserve(), Cors__AllowedOrigins__2: preserve(), Cors__AllowedOrigins__3: preserve(), Cors__AllowedOrigins__4: preserve(), Cors__AllowedOrigins__5: preserve(), Database__MigrateOnStartup: preserve(), DemoMode__PublicOperationalData: preserve(), HealthChecks__DatabaseEnabled: preserve(), ReverseProxy__TrustAllForwarders: preserve() },
  });

  return project("longbeach-os", {
    resources: [Postgres, api, web, webOperationsWCjo, webOperations, apiOperations, postgresVolume],
  });
});
