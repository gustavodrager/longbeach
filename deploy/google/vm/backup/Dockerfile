# PostgreSQL and backup tooling run as the same postgres UID inside one container.
# Build once, smoke-test, then promote the resulting image by digest.
ARG POSTGRES_BASE=postgres:18.6-bookworm@sha256:bbf83594798e144bff365a9c191c5d779f181fb3135902064ab8ff11918020fc
FROM ${POSTGRES_BASE}

# PGDG's signed Bookworm repository is already configured by the official image.
# Debian Bookworm's pgbackrest 2.45 does not support PostgreSQL 18.
ARG PGBACKREST_VERSION=2.59.3-1.pgdg12+1
RUN set -eux; \
    test "${PG_MAJOR}" = 18; \
    test "$(id -u postgres)" = 999; \
    test "$(id -g postgres)" = 999; \
    apt-get update; \
    apt-get install -y --no-install-recommends "pgbackrest=${PGBACKREST_VERSION}" ca-certificates; \
    test "$(pgbackrest version)" = 'pgBackRest 2.59.3'; \
    test "$(dpkg-query -W -f='${Version}' pgbackrest)" = "${PGBACKREST_VERSION}"; \
    install -d -o root -g postgres -m 0750 /etc/pgbackrest /etc/pgbackrest/empty; \
    install -d -o postgres -g postgres -m 0750 /var/spool/pgbackrest /var/log/pgbackrest /var/run/pgbackrest; \
    rm -rf /var/lib/apt/lists/*

# Preserve the upstream entrypoint, PGDATA layout and privilege drop. The host
# mounts writable directories owned by 999:999 and a read-only generated config.
