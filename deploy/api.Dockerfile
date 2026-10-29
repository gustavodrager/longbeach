# syntax=docker/dockerfile:1.7

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source/backend

COPY backend/global.json backend/Directory.Build.props backend/LongBeach.sln ./
COPY backend/src/LongBeach.Api/LongBeach.Api.csproj src/LongBeach.Api/
COPY backend/src/LongBeach.Application/LongBeach.Application.csproj src/LongBeach.Application/
COPY backend/src/LongBeach.Contracts/LongBeach.Contracts.csproj src/LongBeach.Contracts/
COPY backend/src/LongBeach.Domain/LongBeach.Domain.csproj src/LongBeach.Domain/
COPY backend/src/LongBeach.Infrastructure/LongBeach.Infrastructure.csproj src/LongBeach.Infrastructure/
RUN dotnet restore src/LongBeach.Api/LongBeach.Api.csproj

COPY backend/src/ src/
# Hash the real migration attributes, including handwritten migrations without Designer files.
# A new schema requires a reviewed compatibility label update; build args cannot override it.
RUN migrations="$(sed -n 's/^[[:space:]]*\[Migration("\([^"]*\)")\].*/\1/p' src/LongBeach.Infrastructure/Persistence/Migrations/*.cs | LC_ALL=C sort)" \
    && migration_sha256="$(printf '%s\n' "$migrations" | sha256sum | cut -d ' ' -f 1)" \
    && test "$migration_sha256" = "c9f2d161a72410894b9b9f4af1ad243e305f61e1548f94393deac32aeeb6cf11"
RUN dotnet publish src/LongBeach.Api/LongBeach.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
LABEL com.longbeach.api.customer-registry="v1" \
    com.longbeach.api.schema.migration-count="29" \
    com.longbeach.api.schema.latest="20261029121159_UnifiedCustomers" \
    com.longbeach.api.schema.migrations-sha256="c9f2d161a72410894b9b9f4af1ad243e305f61e1548f94393deac32aeeb6cf11"
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "LongBeach.Api.dll"]
