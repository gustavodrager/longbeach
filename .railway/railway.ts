import { defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 5000 });
  const api = service("api", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/api.Dockerfile" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    preDeploy: "dotnet LongBeach.Api.dll --migrate-only",
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { preDeployTimeoutSeconds: 300 },
    domains: ["api.longbeach.quebranunca.com.br"],
    env: {
      ASPNETCORE_ENVIRONMENT: "Production",
      ASPNETCORE_URLS: "http://+:8080",
      AllowedHosts: "api.longbeach.quebranunca.com.br;api-production-d77d.up.railway.app;healthcheck.railway.app",
      Authentication__CookieDomain: "longbeach.quebranunca.com.br",
      Authentication__Jwt__AccessTokenMinutes: preserve(),
      Authentication__Jwt__Audience: preserve(),
      Authentication__Jwt__Issuer: "https://api.longbeach.quebranunca.com.br",
      Authentication__Jwt__RefreshTokenDays: preserve(),
      Authentication__Jwt__SigningKey: preserve(),
      Authentication__MobileAllowedOrigins__0: preserve(),
      Authentication__MobileAllowedOrigins__1: preserve(),
      Authentication__MobileAllowedOrigins__2: preserve(),
      Authorization__SeedOnStartup: "false",
      Bootstrap__InitialOwner__Enabled: "false",
      ConnectionStrings__LongBeach: preserve(),
      Cors__AllowedOrigins__0: "https://preview.longbeach.quebranunca.com.br",
      Cors__AllowedOrigins__1: "https://longbeach.quebranunca.com.br",
      Database__MigrateOnStartup: "false",
      DemoMode__PublicOperationalData: "true",
      HealthChecks__DatabaseEnabled: "true",
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      ReverseProxy__TrustAllForwarders: "false",
    },
  });
  const web = service("web", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "deploy/web.Dockerfile" },
    healthcheck: "/healthz",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    domains: ["preview.longbeach.quebranunca.com.br"],
    env: {
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      VITE_API_URL: "https://api.longbeach.quebranunca.com.br",
      VITE_DEMO_MODE: "true",
      VITE_OPERATIONAL_STORAGE: "postgres",
    },
  });

  return project("longbeach-os", {
    resources: [Postgres, api, web, postgresVolume],
  });
});
