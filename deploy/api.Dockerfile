# syntax=docker/dockerfile:1.7

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

COPY global.json Directory.Build.props LongBeach.sln ./
COPY src/LongBeach.Api/LongBeach.Api.csproj src/LongBeach.Api/
COPY src/LongBeach.Application/LongBeach.Application.csproj src/LongBeach.Application/
COPY src/LongBeach.Contracts/LongBeach.Contracts.csproj src/LongBeach.Contracts/
COPY src/LongBeach.Domain/LongBeach.Domain.csproj src/LongBeach.Domain/
COPY src/LongBeach.Infrastructure/LongBeach.Infrastructure.csproj src/LongBeach.Infrastructure/
RUN dotnet restore src/LongBeach.Api/LongBeach.Api.csproj

COPY src/ src/
RUN dotnet publish src/LongBeach.Api/LongBeach.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
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
