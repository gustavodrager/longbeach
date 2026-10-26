#!/usr/bin/env python3
"""Isolated Docker rehearsal: fictitious DB/keys, loopback ports, owned cleanup only.

This does not use cloud credentials, production SQL, public DNS or real users.
It deliberately does not exercise backup/PITR; that has a separate rehearsal.
"""
from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import tempfile
import time
import uuid

HERE = Path(__file__).resolve().parent
API_HOST = "api.longbeach.quebranunca.com.br"
WEB_ORIGIN = "https://longbeach.quebranunca.com.br"
API_IMAGE = ("southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:"
             "b8e6fdc254cc1226ea25881e046a6e627a8eefa2b4c354bc98059aa6a79ab548")
DIAGNOSTIC = None


def execute(args, *, stdin=None, timeout=180):
    value = subprocess.run(args, input=stdin, text=True, capture_output=True, timeout=timeout)
    if value.returncode:
        if DIAGNOSTIC:
            with DIAGNOSTIC.open("a", encoding="utf-8") as output:
                output.write(json.dumps({"program": Path(args[0]).name, "exit_code": value.returncode,
                                         "stderr": value.stderr, "stdout": value.stdout}) + "\n")
        # Fixtures contain only fictitious data; still don't include SQL/config/body logs.
        raise RuntimeError("command_failed:" + Path(args[0]).name + ":" + str(value.returncode))
    return value.stdout.strip()


def write_json(path, value):
    path.write_text(json.dumps(value), encoding="utf-8")
    path.chmod(0o600)


def token(key, role):
    def part(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")
    now = int(time.time())
    payload = {"iss": "LongBeach.Smoke", "aud": "LongBeach.Smoke.Client", "iat": now, "nbf": now - 5,
               "exp": now + 600, "sub": "11111111-1111-1111-1111-111111111111",
               "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier": "11111111-1111-1111-1111-111111111111",
               "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": role}
    body = part({"alg": "HS256", "typ": "JWT"}) + b"." + part(payload)
    return (body + b"." + base64.urlsafe_b64encode(hmac.new(key.encode(), body, hashlib.sha256).digest()).rstrip(b"=")).decode()


def main():
    global DIAGNOSTIC
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-image", default=API_IMAGE)
    parser.add_argument("--postgres-image", default="longbeach-postgres-backrest:18-vm-20261026")
    parser.add_argument("--https-client", choices=("curl", "python"), default="python")
    options = parser.parse_args()
    if "@sha256:" not in options.api_image or len(options.api_image.rsplit(":", 1)[-1]) != 64:
        parser.error("API image must be an immutable digest")
    if options.https_client == "python" and not ssl.OPENSSL_VERSION.startswith("OpenSSL 3."):
        parser.error("Use Python linked to OpenSSL3 for the validated TLS client; macOS LibreSSL is not supported by this rehearsal")
    run_id = "lbvm-smoke-" + uuid.uuid4().hex[:12]
    DIAGNOSTIC = Path(tempfile.gettempdir()) / (run_id + ".failure.jsonl")
    with DIAGNOSTIC.open("x", encoding="utf-8"):
        DIAGNOSTIC.chmod(0o600)
    report = {"run_id": run_id, "production_mutations": False, "fixtures_only": True, "checks": []}
    temporary = tempfile.TemporaryDirectory(prefix=run_id + "-")
    work = Path(temporary.name)
    work.chmod(0o700)
    compose = None
    pg_image_id = None
    helper_prepared = False
    owned_volumes = []

    def passed(name, condition):
        if not condition:
            raise RuntimeError("check_failed:" + name)
        report["checks"].append(name)

    def helper(command):
        return execute(["docker", "run", "--rm", "--pull", "never", "--network", "none", "--user", "0:0",
                        "--read-only", "--mount", "type=bind,source=" + str(work) + ",target=/fixture",
                        "--entrypoint", "/bin/sh", pg_image_id, "-ec", command])

    try:
        pg_image_id = execute(["docker", "image", "inspect", "--format", "{{.Id}}", options.postgres_image])
        api_inspect = json.loads(execute(["docker", "image", "inspect", options.api_image]))[0]
        passed("published_image_uid_1654", api_inspect["Config"]["User"] == "1654")
        report["api_image"] = options.api_image
        report["postgres_local_image_id"] = pg_image_id
        admin_password = secrets.token_urlsafe(40)
        runtime_password = secrets.token_urlsafe(40)
        jwt_key = secrets.token_urlsafe(64)
        settings = {
            "ConnectionStrings": {"LongBeach": "Host=postgres;Port=5432;Database=longbeach;Username=longbeach_runtime;Password=" + runtime_password + ";SSL Mode=Disable;Maximum Pool Size=20"},
            "Authentication": {"Jwt": {"Issuer": "LongBeach.Smoke", "Audience": "LongBeach.Smoke.Client",
                                       "SigningKey": jwt_key, "AccessTokenMinutes": 15, "RefreshTokenDays": 30},
                               "Google": {"Enabled": False}, "CookieDomain": "longbeach.quebranunca.com.br"},
            "Cors": {"AllowedOrigins": [WEB_ORIGIN]}, "Integrations": {"Banking": {"ImportOnly": True}},
            "Database": {"MigrateOnStartup": False}, "Authorization": {"SeedOnStartup": False},
            "BackgroundJobs": {"Enabled": False}, "HealthChecks": {"DatabaseEnabled": True},
            "Bootstrap": {"InitialOwner": {"Enabled": False}},
        }
        write_json(work / "runtime.json", settings)
        migration = copy.deepcopy(settings)
        migration["ConnectionStrings"]["LongBeach"] = "Host=postgres;Port=5432;Database=longbeach;Username=postgres;Password=" + admin_password + ";SSL Mode=Disable"
        write_json(work / "migration.json", migration)
        (work / "admin.pass").write_text(admin_password)
        (work / "pgbackrest.conf").write_text("[global]\nrepo1-type=posix\nrepo1-path=/tmp/fixture-backup-not-exercised\nlog-level-console=error\n[longbeach]\npg1-path=/var/lib/postgresql/18/docker\npg1-user=postgres\n")
        for path in ("postgres", "pgbackrest/spool", "pgbackrest/log", "pgbackrest/lock", "caddy/data", "caddy/config", "tls"):
            (work / path).mkdir(parents=True, exist_ok=True)
        (work / "tls.cnf").write_text("[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=" + API_HOST + "\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + API_HOST + "\n")
        execute(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(work / "ca.key"),
                 "-out", str(work / "ca.pem"), "-days", "2", "-subj", "/CN=LongBeach fictitious local CA"])
        execute(["openssl", "req", "-newkey", "rsa:2048", "-nodes", "-keyout", str(work / "tls/privkey.pem"),
                 "-out", str(work / "leaf.csr"), "-config", str(work / "tls.cnf")])
        execute(["openssl", "x509", "-req", "-in", str(work / "leaf.csr"), "-CA", str(work / "ca.pem"),
                 "-CAkey", str(work / "ca.key"), "-CAcreateserial", "-out", str(work / "tls/fullchain.pem"),
                 "-days", "2", "-extfile", str(work / "tls.cnf"), "-extensions", "leaf"])
        helper_prepared = True
        helper("chown 0:1654 /fixture/runtime.json /fixture/migration.json; chmod 640 /fixture/runtime.json /fixture/migration.json; "
               "chown 0:999 /fixture/admin.pass /fixture/pgbackrest.conf; chmod 640 /fixture/admin.pass /fixture/pgbackrest.conf; "
               "chown 999:999 /fixture/postgres /fixture/pgbackrest/spool /fixture/pgbackrest/log /fixture/pgbackrest/lock; "
               "chmod 700 /fixture/postgres /fixture/pgbackrest/spool /fixture/pgbackrest/log /fixture/pgbackrest/lock; "
               "chown 1000:1000 /fixture/caddy/data /fixture/caddy/config; chmod 700 /fixture/caddy/data /fixture/caddy/config; "
               "chown 0:1000 /fixture/tls /fixture/tls/fullchain.pem /fixture/tls/privkey.pem; "
               "chmod 750 /fixture/tls; chmod 640 /fixture/tls/fullchain.pem /fixture/tls/privkey.pem")
        env = work / "fixture.env"
        env.write_text("API_IMAGE=" + options.api_image + "\nPOSTGRES_BACKUP_IMAGE=" + pg_image_id +
                       "\nAPI_DOMAIN=" + API_HOST + "\nWEB_ORIGIN=" + WEB_ORIGIN + "\nCADDY_CONFIG=" + str(HERE / "Caddyfile.certificate") + "\nWORKERS_ENABLED=false\n")
        model = json.loads(execute(["docker", "compose", "--env-file", str(env), "-f", str(HERE / "compose.yaml"), "config", "--format", "json"]))
        model["name"] = run_id
        model["volumes"] = {}
        for key, network in model["networks"].items():
            network["name"] = run_id + "_" + key
        replacements = {
            "/run/longbeach/appsettings.Production.json": str(work / "runtime.json"),
            "/run/longbeach/postgres-admin-password": str(work / "admin.pass"),
            "/run/longbeach/tls": str(work / "tls"),
            "/etc/longbeach/backup/pgbackrest.conf": str(work / "pgbackrest.conf"),
        }
        for service in model["services"].values():
            service["labels"] = {**service.get("labels", {}), "longbeach.fixture.run": run_id}
            for volume in service.get("volumes", []):
                source = volume["source"]
                if source.startswith("/var/lib/longbeach/"):
                    relative = source.removeprefix("/var/lib/longbeach/")
                    key = relative.replace("/", "_")
                    name = run_id + "_" + key
                    execute(["docker", "volume", "create", "--label", "longbeach.fixture.run=" + run_id, name])
                    owned_volumes.append(name)
                    uid = "1000" if relative.startswith("caddy/") else "999"
                    execute(["docker", "run", "--rm", "--pull", "never", "--network", "none", "--user", "0:0",
                             "--read-only", "--mount", "type=volume,source=" + name + ",target=/fixture",
                             "--entrypoint", "/bin/sh", pg_image_id, "-ec", "chown " + uid + ":" + uid + " /fixture; chmod 700 /fixture"])
                    model["volumes"][key] = {"external": True, "name": name}
                    volume.clear()
                    volume.update({"type": "volume", "source": key, "target": "/var/lib/postgresql" if relative == "postgres" else {
                        "pgbackrest/spool": "/var/spool/pgbackrest", "pgbackrest/log": "/var/log/pgbackrest",
                        "pgbackrest/lock": "/var/run/pgbackrest", "caddy/data": "/data", "caddy/config": "/config"}[relative]})
                elif source in replacements:
                    volume["source"] = replacements[source]
        for port in model["services"]["caddy"]["ports"]:
            port["host_ip"] = "127.0.0.1"
            port["published"] = "0"
        compose_file = work / "compose.fixture.json"
        write_json(compose_file, model)
        compose = ["docker", "compose", "-p", run_id, "-f", str(compose_file)]
        execute(compose + ["up", "-d", "--wait", "--wait-timeout", "120", "--pull", "never", "postgres"])

        def sql(text, database="postgres"):
            return execute(compose + ["exec", "-T", "postgres", "psql", "-X", "-qAt", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], stdin=text)

        sql("CREATE DATABASE longbeach; CREATE ROLE longbeach_runtime LOGIN PASSWORD '" + runtime_password + "';")
        execute(compose + ["run", "--rm", "--no-deps", "--name", run_id + "-migrate", "-v",
                           str(work / "migration.json") + ":/app/appsettings.Production.json:ro", "api", "--migrate-only"], timeout=240)
        sql("GRANT CONNECT ON DATABASE longbeach TO longbeach_runtime; GRANT USAGE ON SCHEMA public TO longbeach_runtime; "
            "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO longbeach_runtime; "
            "GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO longbeach_runtime;", "longbeach")
        migrations_before = int(sql('SELECT count(*) FROM "__EFMigrationsHistory";', "longbeach"))
        users_before = int(sql("SELECT count(*) FROM users;", "longbeach"))
        execute(compose + ["up", "-d", "--wait", "--wait-timeout", "180", "--pull", "never", "api", "caddy"], timeout=240)
        tls_port = int(execute(compose + ["port", "caddy", "8443"]).rsplit(":", 1)[1])
        http_port = int(execute(compose + ["port", "caddy", "8080"]).rsplit(":", 1)[1])

        def request(path, *, method="GET", headers=None, data=None, tls=True):
            ident = uuid.uuid4().hex
            header_path, body_path = work / (ident + ".headers"), work / (ident + ".body")
            port = tls_port if tls else http_port
            if tls and options.https_client == "python":
                context = ssl.create_default_context(cafile=str(work / "ca.pem"))
                class LoopbackHttps(http.client.HTTPSConnection):
                    def connect(self):
                        raw = socket.create_connection(("127.0.0.1", self.port), self.timeout)
                        self.sock = context.wrap_socket(raw, server_hostname=self.host)
                connection = LoopbackHttps(API_HOST, port, timeout=20, context=context)
                request_headers = dict(header.split(": ", 1) for header in (headers or []))
                if data is not None:
                    request_headers["Content-Type"] = "application/json"
                try:
                    connection.request(method, path, body=data, headers=request_headers)
                    response = connection.getresponse()
                    response_headers = "\n".join(key + ": " + value for key, value in response.getheaders())
                    body = response.read().decode()
                    report["tls_client"] = ssl.OPENSSL_VERSION
                    report["tls_protocol"] = connection.sock.version() if connection.sock else "connection_closed"
                    return response.status, response_headers, body
                finally:
                    connection.close()
            args = ["curl", "--noproxy", "*", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "20",
                    "--resolve", API_HOST + ":" + str(port) + ":127.0.0.1", "--request", method,
                    "--dump-header", str(header_path), "--output", str(body_path), "--write-out", "%{http_code}"]
            if tls:
                # macOS LibreSSL curl is exercised at TLS1.2; canonical name/CA checks stay mandatory.
                args += ["--cacert", str(work / "ca.pem"), "--tlsv1.2", "--tls-max", "1.2"]
            if headers:
                private_headers = work / (ident + ".request-headers")
                private_headers.write_text("\n".join(headers) + "\n")
                private_headers.chmod(0o600)
                args += ["--header", "@" + str(private_headers)]
            if data is not None:
                args += ["--header", "Content-Type: application/json", "--data-binary", data]
            args += [("https" if tls else "http") + "://" + API_HOST + ":" + str(port) + path]
            code = int(execute(args, timeout=30))
            return code, header_path.read_text(), body_path.read_text()

        passed("tls_chain_and_canonical_hostname", request("/health/ready")[0] == 200)
        passed("anonymous_session_rejected", request("/api/v1/auth/me")[0] == 401)
        passed("anonymous_finance_rejected", request("/api/v1/billing/accounts")[0] == 401)
        good = request("/api/v1/auth/refresh", method="OPTIONS", headers=["Origin: " + WEB_ORIGIN,
                       "Access-Control-Request-Method: POST", "Access-Control-Request-Headers: content-type,x-csrf-token"])
        passed("credentialed_cors_preserved", good[0] in (200, 204) and
               ("access-control-allow-origin: " + WEB_ORIGIN).lower() in good[1].lower() and
               "access-control-allow-credentials: true" in good[1].lower())
        bad = request("/api/v1/auth/refresh", method="OPTIONS", headers=["Origin: https://other.invalid", "Access-Control-Request-Method: POST"])
        passed("foreign_cors_origin_rejected", "access-control-allow-origin" not in bad[1].lower())
        passed("foreign_refresh_origin_forbidden", request("/api/v1/auth/refresh", method="POST", headers=["Origin: https://other.invalid"], data="{}")[0] == 403)
        owner = ["Authorization: Bearer " + token(jwt_key, "Owner")]
        billing = request("/api/v1/me/billing/config", headers=owner)
        billing_data = json.loads(billing[2])
        passed("import_only_billing_preserved", billing[0] == 200 and billing_data.get("importOnly") is True and
               all(billing_data.get(key) is False for key in ("pixEnabled", "cardEnabled", "subscriptionsEnabled")))
        passed("online_bar_payments_disabled", request("/api/v1/bar/payments/config", headers=owner)[0] == 200 and
               json.loads(request("/api/v1/bar/payments/config", headers=owner)[2]).get("pixEnabled") is False)
        student = ["Authorization: Bearer " + token(jwt_key, "Student")]
        passed("finance_permission_enforced", request("/api/v1/billing/accounts", headers=student)[0] == 403)
        logout = request("/api/v1/auth/logout", method="POST", headers=["Origin: " + WEB_ORIGIN], data="{}")
        cookies = [line.lower() for line in logout[1].splitlines() if line.lower().startswith("set-cookie:")]
        refresh = next((line for line in cookies if line.startswith("set-cookie: lb_refresh=")), "")
        csrf = next((line for line in cookies if line.startswith("set-cookie: lb_csrf=")), "")
        passed("refresh_cookie_survives_proxy", logout[0] == 204 and "secure" in refresh and "httponly" in refresh and "path=/api/v1/auth" in refresh and "domain=" not in refresh)
        passed("csrf_cookie_boundary_preserved", "domain=longbeach.quebranunca.com.br" in csrf and "secure" in csrf and "httponly" not in csrf)
        redirect = request("/api/v1/auth/options", tls=False)
        passed("http_redirect_uses_public_https_port", redirect[0] in (301, 302, 307, 308) and
               "location: https://" + API_HOST + "/" in redirect[1].lower() and ":8443/" not in redirect[1])
        started = time.monotonic()
        with ThreadPoolExecutor(max_workers=40) as pool:
            statuses = list(pool.map(lambda _: request("/health/ready")[0], range(80)))
        passed("read_load_80_requests_all_200", statuses == [200] * 80)
        report["read_load_seconds"] = round(time.monotonic() - started, 3)
        report["read_load_concurrency"] = 40
        passed("startup_did_not_seed_or_migrate", users_before == 0 and int(sql("SELECT count(*) FROM users;", "longbeach")) == 0 and
               int(sql('SELECT count(*) FROM "__EFMigrationsHistory";', "longbeach")) == migrations_before)
        report["migrations"] = migrations_before
        report["postgres_version"] = sql("SELECT current_setting('server_version');")
        report["container_limits"] = {}
        for service, limit in (("postgres", 1536 * 1024 * 1024), ("api", 1024 * 1024 * 1024), ("caddy", 256 * 1024 * 1024)):
            identifier = execute(compose + ["ps", "-q", service])
            state = json.loads(execute(["docker", "inspect", "--format", '{"memory":{{.HostConfig.Memory}},"oom":{{.State.OOMKilled}},"restarts":{{.RestartCount}},"health":{{json .State.Health.Status}}}', identifier]))
            passed(service + "_resource_limit_and_health", state["memory"] == limit and state["oom"] is False and state["restarts"] == 0 and state["health"] == "healthy")
            report["container_limits"][service] = state
            try:
                report["container_limits"][service]["cgroup_memory_peak_bytes"] = int(execute(
                    compose + ["exec", "-T", service, "/bin/sh", "-c", "cat /sys/fs/cgroup/memory.peak"], timeout=10))
            except (RuntimeError, ValueError):
                report["container_limits"][service]["cgroup_memory_peak_bytes"] = None
        report["status"] = "passed"
        report["limitations"] = ["Fictitious empty database/read load only; no production capacity approval", "No Google login or real session refresh", "No backup/PITR or VM metadata/firewall test", "Forwarded header policy is checked by Caddy config; client IP audit not exercised", "Linux VM file ownership and DNS/metadata isolation still require destination validation"]
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        report["private_diagnostic_file"] = str(DIAGNOSTIC)
        if compose:
            logs = subprocess.run(compose + ["logs", "--no-color", "--tail", "30"], capture_output=True, text=True, timeout=20)
            with DIAGNOSTIC.open("a", encoding="utf-8") as output:
                output.write(json.dumps({"container_logs_fictitious_data_only": logs.stdout}) + "\n")
        raise
    finally:
        cleanup = []
        if compose:
            try:
                execute(compose + ["down", "--remove-orphans", "--volumes", "--timeout", "20"], timeout=90)
                cleanup.append("owned_compose_containers_networks_removed")
            except Exception:
                cleanup.append("owned_compose_cleanup_failed")
        if helper_prepared:
            try:
                helper("rm -rf /fixture/postgres /fixture/caddy/data /fixture/caddy/config /fixture/pgbackrest/spool /fixture/pgbackrest/log /fixture/pgbackrest/lock; "
                       "chown -R " + str(os.getuid()) + ":" + str(os.getgid()) + " /fixture; chmod -R u+rwX /fixture")
                cleanup.append("fictitious_data_removed")
            except Exception:
                cleanup.append("fixture_cleanup_failed")
        for name in owned_volumes:
            try:
                execute(["docker", "volume", "rm", name], timeout=30)
            except Exception:
                cleanup.append("owned_volume_cleanup_failed")
        if owned_volumes and "owned_volume_cleanup_failed" not in cleanup:
            cleanup.append("owned_linux_volumes_removed")
        try:
            temporary.cleanup()
            cleanup.append("temporary_directory_removed")
        except OSError:
            cleanup.append("temporary_directory_cleanup_failed")
        report["cleanup"] = cleanup
        if report.get("status") == "passed":
            DIAGNOSTIC.unlink(missing_ok=True)
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
