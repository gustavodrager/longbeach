import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const apiSource = github("gustavodrager/longbeach", { branch: "codex/ux-identidade-global-20261005", commitSha: "b779492defc0611fbb4ccb4e7b135c0c763deb84" });
  const webSource = github("gustavodrager/longbeach", { branch: "codex/ux-identidade-global-20261005", commitSha: "b31701a6190d7ba71db191914d9a33b152e95d91" });
  const longbeach2 = github("gustavodrager/longbeach");

  const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 5000 });
  const api = service("api", {
    source: apiSource,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/api.Dockerfile" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    preDeploy: "dotnet LongBeach.Api.dll --migrate-only",
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { preDeployTimeoutSeconds: 300 },
    domains: ["api.longbeach.quebranunca.com.br"],
    env: { ASPNETCORE_ENVIRONMENT: "Production", ASPNETCORE_URLS: "http://+:8080", AllowedHosts: preserve(), Authentication__CookieDomain: "longbeach.quebranunca.com.br", Authentication__Google__AllowedEmail: preserve(), Authentication__Google__ClientId: preserve(), Authentication__Google__Enabled: "true", Authentication__Google__ProvisionAllowedEmailsAsOwners: "false", Authentication__Jwt__AccessTokenMinutes: preserve(), Authentication__Jwt__Audience: "LongBeach.OS.Client", Authentication__Jwt__Issuer: "https://api.longbeach.quebranunca.com.br", Authentication__Jwt__RefreshTokenDays: preserve(), Authentication__Jwt__SigningKey: preserve(), Authentication__MobileAllowedOrigins__0: preserve(), Authentication__MobileAllowedOrigins__1: preserve(), Authentication__MobileAllowedOrigins__2: preserve(), Authorization__SeedOnStartup: "false", Bootstrap__InitialOwner__Enabled: "false", ConnectionStrings__LongBeach: preserve(), Cors__AllowedOrigins__0: "https://longbeach.quebranunca.com.br", Cors__AllowedOrigins__1: "https://longbeach.quebranunca.com.br", Database__MigrateOnStartup: "false", DemoMode__PublicOperationalData: "false", HealthChecks__DatabaseEnabled: preserve(), PORT: preserve(), RAILWAY_DOCKERFILE_PATH: preserve(), ReverseProxy__TrustAllForwarders: "false" },
  });
  const web = service("web", {
    source: webSource,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/web.Dockerfile" },
    healthcheck: "/healthz",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    domains: ["longbeach.quebranunca.com.br"],
    env: { PORT: preserve(), RAILWAY_DOCKERFILE_PATH: preserve(), VITE_API_URL: "https://api.longbeach.quebranunca.com.br", VITE_DEMO_MODE: "false", VITE_GOOGLE_CLIENT_ID: preserve(), VITE_OPERATIONAL_STORAGE: "postgres" },
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
