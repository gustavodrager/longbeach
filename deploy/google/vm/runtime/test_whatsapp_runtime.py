"""Runtime admission tests with synthetic JSON, roles and immutable image identities."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import preflight
import test_preflight


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


runtime = module("runtime_compose", "runtime-compose.py")
secrets = module("whatsapp_secrets", "whatsapp-secrets.py")


def environment():
    values = test_preflight.environment()
    values.update(WHATSAPP_ENABLED="true", WHATSAPP_BRIDGE_IMAGE="southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/whatsapp@sha256:" + "e" * 64)
    return values


def bridge():
    return {"enabled": True, "address": "0.0.0.0:8091", "secret": "synthetic-private-shared-key-32-characters", "databaseUrl": "postgres://longbeach_whatsapp_runtime:synthetic-only-password@postgres:5432/longbeach?sslmode=disable", "schema": "whatsapp_transport", "runtimeRole": "longbeach_whatsapp_bridge", "accountId": "arena", "backendUrl": "http://api:8080/api/v1/messaging/bridge/events", "backendHost": preflight.API_HOST}


def application(worker=False):
    result = test_preflight.config()
    result["Messaging"] = {"Enabled": worker, "BridgeUrl": "http://whatsapp-bridge:8091", "BridgeSecret": bridge()["secret"], "Ai": {"Enabled": False}}
    return result


def manifest():
    return {"schemaVersion": 1, "projectId": "parsero-prod-20261022", "secretId": "longbeach-whatsapp-config", "version": "1", "messagingEnabled": False, "aiEnabled": False}


class ConfigurationTests(unittest.TestCase):
    def test_transport_can_pair_with_worker_off_without_enabling_any_bank(self):
        values = environment()
        preflight.check_settings(values)
        preflight.check_application_config(application())
        preflight.check_whatsapp_config(values, application(), bridge())
        preflight.check_whatsapp_config(test_preflight.environment(), test_preflight.config())

    def test_dispatch_requires_transport_and_background_gate(self):
        with self.assertRaisesRegex(preflight.Refused, "messaging_worker_without_transport"):
            preflight.check_whatsapp_config(test_preflight.environment(), application(True))
        with self.assertRaisesRegex(preflight.Refused, "background_jobs_disabled"):
            preflight.check_whatsapp_config(environment(), application(True), bridge())
        values = environment()
        values.update(WORKERS_ENABLED="true", VM_PRODUCTION_CUTOVER_CONFIRMED="true", SOURCE_WORKERS_STOPPED_CONFIRMED="true")
        preflight.check_settings(values)
        preflight.check_whatsapp_config(values, application(True), bridge())

    def test_shared_secret_target_identity_and_database_are_checked(self):
        mutations = [("secret", "wrong"), ("address", "0.0.0.0:80"), ("schema", "public"), ("runtimeRole", "longbeach_runtime"), ("accountId", "another"), ("backendHost", "evil.invalid"), ("backendUrl", "https://evil.invalid"), ("enabled", False), ("databaseUrl", bridge()["databaseUrl"].replace("@postgres", "@public.invalid")), ("databaseUrl", bridge()["databaseUrl"].replace("longbeach_whatsapp_runtime:", "postgres:")), ("databaseUrl", bridge()["databaseUrl"] + "&options=unsafe")]
        for key, value in mutations:
            data = bridge()
            data[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(preflight.Refused):
                preflight.check_whatsapp_config(environment(), application(), data)

    def test_only_immutable_local_bridge_image_can_be_enabled(self):
        for image in ("whatsapp:latest", "ghcr.io/a/whatsapp@sha256:" + "a" * 64, environment()["API_IMAGE"]):
            values = environment()
            values["WHATSAPP_BRIDGE_IMAGE"] = image
            with self.assertRaises(preflight.Refused):
                preflight.check_settings(values)

    def test_runtime_public_file_rejects_secret_variables(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.env"
            for name in ("WHATSAPP_BRIDGE_SECRET", "WHATSAPP_BRIDGE_DATABASE_URL", "MESSAGING_AI_API_KEY"):
                path.write_text(name + "=synthetic-only\n")
                with self.assertRaises(preflight.Refused):
                    preflight.read_environment(path)

    def test_public_manifest_requires_numbered_secret_and_ai_remains_off(self):
        self.assertEqual(secrets.checked_manifest(manifest()), manifest())
        for key, value in (("version", "latest"), ("projectId", "other"), ("secretId", "unrelated-secret"), ("aiEnabled", True), ("messagingEnabled", "true")):
            data = manifest()
            data[key] = value
            with self.assertRaises(preflight.Refused):
                secrets.checked_manifest(data)

    def test_merging_only_changes_messaging_and_preserves_other_configuration(self):
        original = test_preflight.config()
        original["Unrelated"] = {"setting": "preserved"}
        result = secrets.merged_application(original, bridge(), manifest())
        self.assertEqual({k: v for k, v in result.items() if k != "Messaging"}, original)
        self.assertNotIn("Messaging", original)
        self.assertFalse(result["Messaging"]["Enabled"])
        self.assertFalse(result["Messaging"]["Ai"]["Enabled"])
        self.assertEqual(result["Messaging"]["BridgeSecret"], bridge()["secret"])
        self.assertNotIn("databaseUrl", result["Messaging"])

    def test_secret_redirect_is_refused_and_urls_never_accept_user_input(self):
        with self.assertRaises(preflight.Refused):
            secrets.NoRedirect().redirect_request(None, None, 302, "moved", {}, "https://evil.invalid")
        source = (HERE / "whatsapp-secrets.py").read_text()
        self.assertIn('version', source)
        self.assertIn('https://secretmanager.googleapis.com/v1/projects/', source)
        self.assertNotIn('verify=False', source)

    def test_private_writer_uses_atomic_replace_and_exact_mode_without_reprinting_content(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(preflight, "SECRET_ROOT", Path(directory)), patch.object(secrets.os, "fchown") as owner:
            path = Path(directory) / "whatsapp-bridge.json"
            secrets.atomic_json(path, bridge(), 65532)
            owner.assert_called_once()
            self.assertEqual(owner.call_args.args[1:], (0, 65532))
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)
            self.assertEqual(json.loads(path.read_text()), bridge())
            self.assertEqual([p.name for p in Path(directory).iterdir()], ["whatsapp-bridge.json"])

    def test_secret_fetch_is_numbered_and_rejects_an_unexpected_returned_version(self):
        class Response:
            headers = {"Metadata-Flavor": "Google"}
            def __init__(self, body):
                self.body = body
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, size):
                return json.dumps(self.body).encode()[:size]
        class Opener:
            def __init__(self, version):
                self.version = version
                self.calls = []
            def open(self, request, **kwargs):
                self.calls.append(request.full_url)
                if len(self.calls) == 1:
                    return Response({"access_token": "synthetic-identity-token"})
                import base64
                return Response({"name": "projects/123/secrets/longbeach-whatsapp-config/versions/" + self.version,
                                 "payload": {"data": base64.b64encode(json.dumps(bridge()).encode()).decode()}})
        opener = Opener("1")
        with patch.object(secrets, "build_opener", return_value=opener):
            self.assertEqual(secrets.fetch_configuration(manifest()), bridge())
        self.assertEqual(opener.calls[1], "https://secretmanager.googleapis.com/v1/projects/parsero-prod-20261022/secrets/longbeach-whatsapp-config/versions/1:access")
        with patch.object(secrets, "build_opener", return_value=Opener("2")), self.assertRaisesRegex(preflight.Refused, "version_changed"):
            secrets.fetch_configuration(manifest())


class RuntimeCommandsTests(unittest.TestCase):
    def test_start_and_stop_survive_opt_in_profile_and_postgres_stays_base_only(self):
        base = runtime.command("start", test_preflight.environment())
        enabled = runtime.command("start", environment())
        postgres = runtime.command("postgres", environment())
        self.assertNotIn("--profile", base)
        self.assertIn("--profile", enabled)
        self.assertIn(str(HERE / "compose.whatsapp.yaml").replace(str(HERE), str(preflight.RUNTIME_ROOT)), enabled)
        self.assertNotIn("--profile", postgres)
        self.assertEqual(postgres[-2:], ["--no-deps", "postgres"])
        self.assertEqual(enabled[-3:], ["--no-build", "--pull", "never"])
        self.assertIn("never", enabled)
        self.assertEqual(runtime.command("stop", environment()), preflight.DOCKER + ["stop", "--time", "90"])

    def test_stop_selects_only_known_services_and_rejects_duplicates(self):
        rows = "aabbccddeeff api\n112233445566 whatsapp-bridge\n998877665544 unrelated\n"
        self.assertEqual(runtime.selected_containers(rows, {"api", "whatsapp-bridge"}), ["aabbccddeeff", "112233445566"])
        with self.assertRaises(preflight.Refused):
            runtime.selected_containers(rows + "abcdefabcdef api\n", {"api"})

    def test_unit_requires_private_config_before_host_gate_and_uses_same_compose_helper(self):
        unit = (HERE / "longbeach-runtime.service").read_text()
        private = (HERE / "longbeach-whatsapp-secrets.service").read_text()
        self.assertIn("Requires=longbeach-whatsapp-secrets.service", unit)
        self.assertIn("After=longbeach-whatsapp-secrets.service", unit)
        for action in ("postgres", "start", "stop"):
            self.assertIn("runtime-compose.py " + action, unit)
        self.assertIn("After=network-online.target longbeach-secrets.service", private)
        self.assertIn("ReadWritePaths=/run/longbeach", private)


class BridgeSchemaTests(unittest.TestCase):
    def fake(self):
        image = {"Id": "sha256:" + "f" * 64, "Os": "linux", "Architecture": "amd64", "RepoDigests": [environment()["WHATSAPP_BRIDGE_IMAGE"]], "Config": {"User": "65532:65532", "Labels": {"com.longbeach.whatsapp.transport": "v1", "com.longbeach.whatsapp.schema": "whatsapp_transport", "com.longbeach.whatsapp.schema.version": "1", "com.longbeach.whatsapp.sqlstore.version": "16"}}}
        proof = {"database": "longbeach", "read_only": "on", "bridge_version": 1, "sqlstore_version": 16}
        proof.update({key: True for key in ("required_tables", "login_safe", "role_safe", "membership", "no_other_membership", "schema_owner_safe", "schema_usage", "no_schema_ddl", "no_public_ddl", "no_business_access", "transport_dml", "no_table_ownership")})
        calls = []
        def run(args, *, input=None):
            calls.append((args, input))
            if args[:2] == ["image", "inspect"]:
                return json.dumps([image])
            if args[0] == "ps":
                return ""
            if args[0] == "exec":
                self.assertEqual(input, preflight.BRIDGE_SCHEMA_QUERY)
                return json.dumps(proof)
            raise AssertionError(args)
        return image, proof, calls, run

    def test_verified_digest_schema_and_restricted_runtime_are_admitted_read_only(self):
        image, proof, calls, run = self.fake()
        result = preflight.check_whatsapp_schema(environment(), "c" * 64, run)
        self.assertTrue(result["runtime_isolation_verified"])
        self.assertEqual([args[0] for args, _ in calls], ["image", "ps", "exec"])
        self.assertIn("BEGIN READ ONLY", preflight.BRIDGE_SCHEMA_QUERY)
        self.assertNotRegex(preflight.BRIDGE_SCHEMA_QUERY.upper(), r"\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\s+(TABLE|ROLE|SCHEMA|INTO|FROM)\b")

    def test_wrong_bridge_labels_role_version_or_business_access_are_refused(self):
        for key in ("login_safe", "role_safe", "membership", "schema_owner_safe", "no_other_membership", "no_schema_ddl", "no_public_ddl", "no_business_access", "transport_dml", "required_tables", "no_table_ownership"):
            image, proof, calls, run = self.fake()
            proof[key] = False
            with self.subTest(key=key), self.assertRaises(preflight.Refused):
                preflight.check_whatsapp_schema(environment(), "c" * 64, run)
        for key, value in (("bridge_version", 2), ("sqlstore_version", 17), ("database", "foreign"), ("read_only", "off")):
            image, proof, calls, run = self.fake()
            proof[key] = value
            with self.assertRaises(preflight.Refused):
                preflight.check_whatsapp_schema(environment(), "c" * 64, run)
        image, proof, calls, run = self.fake()
        image["Config"]["Labels"]["com.longbeach.whatsapp.sqlstore.version"] = "999"
        with self.assertRaises(preflight.Refused):
            preflight.check_whatsapp_schema(environment(), "c" * 64, run)

    def test_duplicate_running_transports_are_refused(self):
        image, proof, calls, run = self.fake()
        def duplicate(args, **kwargs):
            return "a" * 64 + "\n" + "b" * 64 if args[0] == "ps" else run(args, **kwargs)
        with self.assertRaisesRegex(preflight.Refused, "multiple_active_services"):
            preflight.check_whatsapp_schema(environment(), "c" * 64, duplicate)


class ComposeTests(unittest.TestCase):
    def test_optional_overlay_has_private_file_and_no_credentials_in_environment(self):
        values = environment()
        values["CADDY_CONFIG"] = str(HERE / "Caddyfile.certificate")
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "runtime.env"
            path.write_text("\n".join(k + "=" + v for k, v in values.items()))
            result = subprocess.run(["docker", "compose", "--env-file", str(path), "-f", str(HERE / "compose.yaml"), "-f", str(HERE / "compose.whatsapp.yaml"), "--profile", "whatsapp", "config", "--format", "json"], check=True, capture_output=True, text=True, timeout=30)
        services = json.loads(result.stdout)["services"]
        transport = services["whatsapp-bridge"]
        self.assertEqual(transport["user"], "65532:65532")
        self.assertFalse(transport.get("ports"))
        self.assertEqual(set(transport["environment"]), {"WABRIDGE_CONFIG_FILE", "GOMEMLIMIT"})
        self.assertFalse(any("Messaging" in name for name in services["api"]["environment"]))
        mount = transport["volumes"][0]
        self.assertEqual(mount["source"], "/run/longbeach/whatsapp-bridge.json")
        self.assertTrue(mount["read_only"])
        self.assertEqual(mount["bind"], {"create_host_path": False})
        self.assertNotIn("archive", transport["networks"])


@unittest.skipUnless(os.environ.get("LONG_BEACH_WHATSAPP_RUNTIME_TEST_CONTAINER"), "Synthetic PostgreSQL container not supplied")
class PostgresAdmissionTests(unittest.TestCase):
    def sql(self, value):
        container = os.environ["LONG_BEACH_WHATSAPP_RUNTIME_TEST_CONTAINER"]
        self.assertTrue(container.startswith("longbeach-whatsapp-runtime-admission-test"))
        return subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "longbeach", "-v", "ON_ERROR_STOP=1", "-qAt"], input=value, text=True, capture_output=True, check=True, timeout=20).stdout

    def test_real_pinned_sqlstore_accepts_isolated_login_and_refuses_business_or_ddl_grants(self):
        positive = json.loads(self.sql(preflight.BRIDGE_SCHEMA_QUERY))
        self.assertEqual(positive["bridge_version"], 1)
        self.assertEqual(positive["sqlstore_version"], 16)
        for key, value in positive.items():
            if isinstance(value, bool):
                self.assertTrue(value, key)
        try:
            self.sql("GRANT SELECT ON public.synthetic_business_guard TO longbeach_whatsapp_runtime;")
            self.assertFalse(json.loads(self.sql(preflight.BRIDGE_SCHEMA_QUERY))["no_business_access"])
        finally:
            self.sql("REVOKE SELECT ON public.synthetic_business_guard FROM longbeach_whatsapp_runtime;")
        try:
            self.sql("GRANT CREATE ON SCHEMA whatsapp_transport TO longbeach_whatsapp_runtime;")
            self.assertFalse(json.loads(self.sql(preflight.BRIDGE_SCHEMA_QUERY))["no_schema_ddl"])
        finally:
            self.sql("REVOKE CREATE ON SCHEMA whatsapp_transport FROM longbeach_whatsapp_runtime;")
