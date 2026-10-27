#!/usr/bin/env python3
"""Read-only host gates. Never prints secret values or creates a data directory."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ENV_FILE = Path("/etc/longbeach/runtime.env")
DATA_ROOT = Path("/var/lib/longbeach")
SECRET_ROOT = Path("/run/longbeach")
RUNTIME_ROOT = Path("/opt/longbeach/runtime")
API_HOST = "api.longbeach.quebranunca.com.br"
WEB_ORIGIN = "https://longbeach.quebranunca.com.br"
ALLOWED_SETTINGS = {
    "API_IMAGE", "POSTGRES_BACKUP_IMAGE", "API_DOMAIN", "WEB_ORIGIN", "DATA_DISK_UUID",
    "CADDY_CONFIG", "WORKERS_ENABLED", "VM_PRODUCTION_CUTOVER_CONFIRMED",
    "SOURCE_WORKERS_STOPPED_CONFIRMED",
}


class Refused(RuntimeError):
    pass


def require(condition: bool, code: str) -> None:
    if not condition:
        raise Refused(code)


def secure_file(path: Path, gid: int, mode: int) -> None:
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), "file_not_regular:" + path.name)
    require(info.st_uid == 0 and info.st_gid == gid, "file_owner:" + path.name)
    require(stat.S_IMODE(info.st_mode) == mode, "file_mode:" + path.name)
    require(info.st_nlink == 1, "file_hardlink:" + path.name)


def json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    seen: set[str] = set()
    for key, value in pairs:
        require(key.lower() not in seen, "duplicate_json_configuration_key")
        seen.add(key.lower())
        result[key] = value
    return result


def read_environment(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, separator, value = line.partition("=")
        require(bool(separator) and name in ALLOWED_SETTINGS and name not in values,
                "invalid_or_duplicate_runtime_setting")
        require(bool(value) and value == value.strip() and not any(c in value for c in "$`\x00\r\n\"'"),
                "invalid_runtime_setting_value")
        values[name] = value
    return values


def pinned(image: str) -> bool:
    return bool(re.fullmatch(
        r"southamerica-east1-docker\.pkg\.dev/parsero-prod-20261022/longbeach/"
        r"[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}", image))


def check_settings(values: dict[str, str]) -> None:
    require(pinned(values.get("API_IMAGE", "")), "api_image_not_pinned")
    require(pinned(values.get("POSTGRES_BACKUP_IMAGE", "")), "postgres_image_not_pinned")
    require(values.get("API_DOMAIN") == API_HOST, "api_domain_changed")
    require(values.get("WEB_ORIGIN") == WEB_ORIGIN, "web_origin_changed")
    require(bool(re.fullmatch(r"[a-fA-F0-9-]{16,64}", values.get("DATA_DISK_UUID", ""))),
            "invalid_data_disk_uuid")
    for name in ("WORKERS_ENABLED", "VM_PRODUCTION_CUTOVER_CONFIRMED", "SOURCE_WORKERS_STOPPED_CONFIRMED"):
        require(values.get(name, "false") in ("true", "false"), "invalid_gate:" + name)
    if values.get("WORKERS_ENABLED", "false") == "true":
        require(values.get("VM_PRODUCTION_CUTOVER_CONFIRMED") == "true" and
                values.get("SOURCE_WORKERS_STOPPED_CONFIRMED") == "true", "worker_cutover_gate_missing")
    require(values.get("CADDY_CONFIG") in {
        str(RUNTIME_ROOT / "Caddyfile.certificate"), str(RUNTIME_ROOT / "Caddyfile.automatic")
    }, "unreviewed_caddy_configuration")


def flattened(value: object, prefix: str = "") -> dict[str, object]:
    result: dict[str, object] = {}
    if isinstance(value, dict):
        children = value.items()
    elif isinstance(value, list):
        children = enumerate(value)
    else:
        return {prefix.lower(): value}
    for name, child in children:
        require("__" not in str(name), "ambiguous_json_configuration_key")
        key = str(name) if not prefix else prefix + ":" + str(name)
        for nested, leaf in flattened(child, key).items():
            require(nested not in result, "duplicate_configuration_key")
            result[nested] = leaf
    return result


def connection_fields(value: str) -> dict[str, str]:
    # ADO-style quoted values may contain semicolons or doubled quote characters.
    fields: dict[str, str] = {}
    index = 0
    while index < len(value):
        while index < len(value) and value[index] in " ;\t":
            index += 1
        if index == len(value):
            break
        equals = value.find("=", index)
        require(equals > index, "invalid_connection_string")
        key = value[index:equals].strip().lower()
        aliases = {"server": "host", "user id": "username", "userid": "username", "uid": "username",
                   "user name": "username", "initial catalog": "database", "pwd": "password",
                   "sslmode": "ssl mode", "maximum poolsize": "maximum pool size",
                   "maxpoolsize": "maximum pool size", "max pool size": "maximum pool size"}
        key = aliases.get(key, key)
        index = equals + 1
        while index < len(value) and value[index].isspace():
            index += 1
        part = ""
        if index < len(value) and value[index] in "\"'":
            quote = value[index]
            index += 1
            closed = False
            while index < len(value):
                char = value[index]
                index += 1
                if char == quote:
                    if index < len(value) and value[index] == quote:
                        part += quote
                        index += 1
                    else:
                        closed = True
                        break
                else:
                    part += char
            require(closed, "invalid_connection_quoting")
            while index < len(value) and value[index].isspace():
                index += 1
            require(index == len(value) or value[index] == ";", "invalid_connection_suffix")
        else:
            end = value.find(";", index)
            if end < 0:
                end = len(value)
            part = value[index:end].strip()
            index = end
        require(bool(key) and key not in fields, "duplicate_connection_setting")
        fields[key] = part
    return fields


def check_application_config(value: object) -> None:
    require(isinstance(value, dict), "configuration_not_object")
    config = flattened(value)
    for key in ("database:migrateonstartup", "authorization:seedonstartup",
                "bootstrap:initialowner:enabled", "authentication:google:provisionallowedemailsasowners"):
        require(boolean(config.get(key, False), False), "startup_mutation_flag:" + key)
    require(boolean(config.get("integrations:banking:importonly"), True), "bank_import_mode_not_preserved")
    for key in ("integrations:c6:enabled", "integrations:c6:bankingenabled", "integrations:c6:pixenabled",
                "integrations:pagbankedi:enabled", "payments:billing:enabled", "payments:pagbank:enabled",
                "payments:pagbank:pixenabled", "payments:pagbank:cardenabled",
                "payments:pagbanksubscriptions:enabled"):
        require(boolean(config.get(key, False), False), "bank_api_flag:" + key)
    origins = {v for k, v in config.items() if k.startswith("cors:allowedorigins:")}
    require(origins == {WEB_ORIGIN}, "cors_origin_changed")
    require(config.get("authentication:cookiedomain") == "longbeach.quebranunca.com.br", "cookie_domain_changed")
    signing = config.get("authentication:jwt:signingkey")
    require(isinstance(signing, str) and len(signing) >= 32, "jwt_key_missing")
    connection = config.get("connectionstrings:longbeach")
    require(isinstance(connection, str), "runtime_connection_missing")
    fields = connection_fields(connection)
    require(fields.get("host") == "postgres" and fields.get("port", "5432") == "5432", "database_host_not_private")
    require(fields.get("database") == "longbeach", "wrong_application_database")
    require(fields.get("username") == "longbeach_runtime", "database_role_not_runtime")
    require(bool(fields.get("password")), "runtime_password_missing")
    require(fields.get("ssl mode", "").lower() == "disable", "private_database_transport_not_explicit")
    try:
        pool = int(fields.get("maximum pool size", "100"))
    except ValueError:
        raise Refused("runtime_pool_size_invalid") from None
    require(1 <= pool <= 30, "runtime_pool_above_connection_budget")


def boolean(value: object, expected: bool) -> bool:
    return value is expected or (isinstance(value, str) and value.lower() == str(expected).lower())


def main() -> None:
    require(os.geteuid() == 0, "root_required")
    secure_file(ENV_FILE, 0, 0o600)
    settings = read_environment(ENV_FILE)
    check_settings(settings)
    for subnet in ("172.29.10.0/24", "172.29.11.0/24"):
        rule = subprocess.run(["iptables", "--check", "DOCKER-USER", "--source", subnet,
                               "--destination", "169.254.169.254/32", "--protocol", "tcp", "--match", "multiport",
                               "--dports", "80,443", "--jump", "DROP"],
                              capture_output=True, timeout=10)
        require(rule.returncode == 0, "metadata_firewall_rule_missing")
    require(DATA_ROOT.is_mount(), "data_disk_not_mounted")
    mounted = subprocess.run(["findmnt", "--json", "--target", str(DATA_ROOT), "--output", "TARGET,UUID"],
                             check=True, capture_output=True, text=True, timeout=10)
    filesystems = json.loads(mounted.stdout).get("filesystems", [])
    require(len(filesystems) == 1 and filesystems[0].get("target") == str(DATA_ROOT) and
            filesystems[0].get("uuid") == settings["DATA_DISK_UUID"], "data_disk_uuid_mismatch")
    for relative, uid, gid in (
        ("postgres", 999, 999), ("pgbackrest/spool", 999, 999), ("pgbackrest/log", 999, 999),
        ("pgbackrest/lock", 999, 999), ("caddy/data", 1000, 1000), ("caddy/config", 1000, 1000),
    ):
        path = DATA_ROOT / relative
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid and info.st_gid == gid and
                stat.S_IMODE(info.st_mode) & 0o007 == 0, "data_directory_permissions:" + relative)
        require(path.resolve().is_relative_to(DATA_ROOT), "data_directory_outside_disk")
    version = DATA_ROOT / "postgres/18/docker/PG_VERSION"
    require(version.is_file() and version.read_text().strip() == "18", "postgres18_not_initialized")
    secure_file(SECRET_ROOT / "appsettings.Production.json", 1654, 0o640)
    secure_file(SECRET_ROOT / "postgres-admin-password", 999, 0o640)
    secure_file(Path("/etc/longbeach/backup/pgbackrest.conf"), 999, 0o640)
    config = json.loads((SECRET_ROOT / "appsettings.Production.json").read_text(encoding="utf-8"), object_pairs_hook=json_object)
    check_application_config(config)
    require(len((SECRET_ROOT / "postgres-admin-password").read_text().strip()) >= 32, "admin_password_too_short")
    tls = SECRET_ROOT / "tls"
    info = tls.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_gid == 1000 and
            stat.S_IMODE(info.st_mode) == 0o750, "tls_directory_permissions")
    if settings["CADDY_CONFIG"].endswith("Caddyfile.certificate"):
        for name in ("fullchain.pem", "privkey.pem"):
            secure_file(tls / name, 1000, 0o640)
        cert = subprocess.run(["openssl", "x509", "-in", str(tls / "fullchain.pem"), "-noout",
                               "-checkhost", API_HOST, "-checkend", "3600"],
                              capture_output=True, timeout=10)
        require(cert.returncode == 0, "certificate_host_or_expiration_invalid")
        cert_key = subprocess.run(["openssl", "x509", "-in", str(tls / "fullchain.pem"), "-pubkey", "-noout"],
                                  check=True, capture_output=True, timeout=10).stdout
        key_public = subprocess.run(["openssl", "pkey", "-in", str(tls / "privkey.pem"), "-pubout"],
                                    check=True, capture_output=True, timeout=10).stdout
        require(cert_key == key_public, "certificate_private_key_mismatch")
    print(json.dumps({"status": "ready", "mode": "runtime_only", "workers_enabled": settings.get("WORKERS_ENABLED", "false") == "true"}))


if __name__ == "__main__":
    try:
        main()
    except (Refused, OSError, ValueError, subprocess.SubprocessError) as error:
        # Do not print exception messages from JSON/config/parser/system command output.
        code = str(error) if isinstance(error, Refused) else type(error).__name__
        print(json.dumps({"status": "refused", "code": code}), file=sys.stderr)
        sys.exit(1)
