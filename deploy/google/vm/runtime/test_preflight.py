"""Local safety tests; all credentials and images are fictitious."""
import copy
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import shutil
import subprocess
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("longbeach_vm_preflight", HERE / "preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


def config():
    return {
        "ConnectionStrings": {"LongBeach": "Host=postgres;Database=longbeach;Username=longbeach_runtime;Password=\"fictional;pass\";SSL Mode=Disable;Maximum Pool Size=20"},
        "Authentication": {"Jwt": {"SigningKey": "fictional-only-signing-key-32-characters"},
                           "CookieDomain": "longbeach.quebranunca.com.br"},
        "Cors": {"AllowedOrigins": [preflight.WEB_ORIGIN]},
        "Integrations": {"Banking": {"ImportOnly": True}},
    }


def environment():
    image = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/"
    return {
        "API_IMAGE": image + "api@sha256:" + "a" * 64,
        "POSTGRES_BACKUP_IMAGE": image + "postgres-backup@sha256:" + "b" * 64,
        "API_DOMAIN": preflight.API_HOST,
        "WEB_ORIGIN": preflight.WEB_ORIGIN,
        "DATA_DISK_UUID": "00000000-0000-0000-0000-000000000000",
        "CADDY_CONFIG": "/opt/longbeach/runtime/Caddyfile.certificate",
        "WORKERS_ENABLED": "false",
    }


class ConfigurationTests(unittest.TestCase):
    def test_valid_configuration_with_quoted_password(self):
        preflight.check_application_config(config())
        fields = preflight.connection_fields("Host=postgres;Password='a;''b';Database=longbeach")
        self.assertEqual(fields["password"], "a;'b")
        with self.assertRaises(preflight.Refused):
            preflight.connection_fields("Username=longbeach_runtime;User ID=postgres")
        with self.assertRaises(preflight.Refused):
            preflight.connection_fields("Host=postgres;Server=other.example")

    def test_secret_file_permissions_are_exact(self):
        info = SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_uid=0, st_gid=1654, st_nlink=1)
        path = SimpleNamespace(name="fictitious.json", lstat=lambda: info)
        preflight.secure_file(path, 1654, 0o640)
        for name, value in (("st_mode", stat.S_IFREG | 0o644), ("st_gid", 0),
                            ("st_uid", 1654), ("st_nlink", 2), ("st_mode", stat.S_IFLNK | 0o640)):
            original = getattr(info, name)
            setattr(info, name, value)
            with self.assertRaises(preflight.Refused):
                preflight.secure_file(path, 1654, 0o640)
            setattr(info, name, original)

    def test_import_only_is_required_and_bank_api_activation_is_rejected(self):
        for value in (None, False, "false"):
            data = config()
            data["Integrations"]["Banking"]["ImportOnly"] = value
            with self.assertRaises(preflight.Refused):
                preflight.check_application_config(data)
        data = config()
        data["Payments"] = {"PagBank": {"Enabled": True}}
        with self.assertRaises(preflight.Refused):
            preflight.check_application_config(data)

    def test_startup_mutations_rejected(self):
        for name in ("Database:MigrateOnStartup", "Authorization:SeedOnStartup",
                     "Bootstrap:InitialOwner:Enabled", "Authentication:Google:ProvisionAllowedEmailsAsOwners"):
            data = config()
            data[name] = "true"
            with self.assertRaises(preflight.Refused):
                preflight.check_application_config(data)

    def test_foreign_database_superuser_and_large_pool_rejected(self):
        original = config()["ConnectionStrings"]["LongBeach"]
        for connection in (original.replace("Host=postgres", "Host=public.example"),
                           original.replace("Database=longbeach", "Database=other"),
                           original.replace("Username=longbeach_runtime", "Username=postgres"),
                           original.replace("Pool Size=20", "Pool Size=100")):
            data = config()
            data["ConnectionStrings"]["LongBeach"] = connection
            with self.assertRaises(preflight.Refused):
                preflight.check_application_config(data)

    def test_cors_and_cookie_boundaries_rejected(self):
        data = config()
        data["Cors"]["AllowedOrigins"].append("https://other.example")
        with self.assertRaises(preflight.Refused):
            preflight.check_application_config(data)
        data = config()
        data["Authentication"]["CookieDomain"] = "quebranunca.com.br"
        with self.assertRaises(preflight.Refused):
            preflight.check_application_config(data)

    def test_ambiguous_configuration_is_rejected(self):
        data = config()
        data["authentication:JWT:signingKey"] = "another-fictional-key"
        with self.assertRaises(preflight.Refused):
            preflight.check_application_config(data)
        with self.assertRaises(preflight.Refused):
            json.loads('{"ImportOnly":true,"ImportOnly":false}', object_pairs_hook=preflight.json_object)

    def test_worker_start_requires_both_cutover_gates(self):
        values = environment()
        preflight.check_settings(values)
        values["WORKERS_ENABLED"] = "true"
        with self.assertRaises(preflight.Refused):
            preflight.check_settings(values)
        values["SOURCE_WORKERS_STOPPED_CONFIRMED"] = "true"
        values["VM_PRODUCTION_CUTOVER_CONFIRMED"] = "true"
        preflight.check_settings(values)

    def test_mutable_or_foreign_images_rejected(self):
        values = environment()
        for image in ("api:latest", values["API_IMAGE"].replace("parsero-prod-20261022", "other-project")):
            values["API_IMAGE"] = image
            with self.assertRaises(preflight.Refused):
                preflight.check_settings(values)

    def test_environment_duplicates_and_shell_expansion_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "settings.env"
            for body in ("API_IMAGE=one\nAPI_IMAGE=two\n", "API_IMAGE=$(not-executed)\n", "UNKNOWN=bad\n"):
                path.write_text(body)
                with self.assertRaises(preflight.Refused):
                    preflight.read_environment(path)



REPO = HERE.parents[3]


def source_migrations():
    directory = REPO / "backend/src/LongBeach.Infrastructure/Persistence/Migrations"
    values = []
    for path in directory.glob("*.cs"):
        values.extend(re.findall(r'\[Migration\("([^"]+)"\)\]', path.read_text(encoding="utf-8-sig")))
    return sorted(values)


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.container = "c" * 64
        self.running_id = self.container
        self.image = {"Id": "sha256:" + "d" * 64, "Os": "linux", "Architecture": "amd64",
                      "RepoDigests": [environment()["API_IMAGE"]], "Config": {"Labels": {
                          preflight.LABEL_CAPABILITY: "v1", preflight.LABEL_SCHEMA_HASH: preflight.API_SCHEMA_SHA256,
                          preflight.LABEL_SCHEMA_COUNT: "29", preflight.LABEL_SCHEMA_LATEST: preflight.API_SCHEMA_LATEST}}}
        self.postgres = {"Id": self.container, "State": {"Running": True},
                         "Config": {"Image": environment()["POSTGRES_BACKUP_IMAGE"], "User": "999:999", "Labels": {
                             "com.docker.compose.project": "longbeach", "com.docker.compose.service": "postgres",
                             "com.docker.compose.oneoff": "False"}},
                         "HostConfig": {"ReadonlyRootfs": True, "Privileged": False},
                         "NetworkSettings": {"Ports": {"5432/tcp": None}},
                         "Mounts": [{"Type": "bind", "Source": "/var/lib/longbeach/postgres", "Destination": "/var/lib/postgresql", "RW": True}]}
        self.database = {"database": "longbeach", "server_version_num": 180006, "read_only": "on", "migrations": source_migrations()}

    def __call__(self, args, *, input=None):
        self.calls.append((list(args), input))
        if args[:2] == ["image", "inspect"]:
            return json.dumps([self.image])
        if args[0] == "compose":
            assert args[-5:] == ["ps", "--status", "running", "-q", "postgres"]
            return self.running_id
        if args == ["inspect", self.container]:
            return json.dumps([self.postgres])
        if args[0] == "exec":
            assert args == ["exec", "--user", "999:999", "-i", self.container, "psql", "--no-psqlrc", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "longbeach"]
            assert input == preflight.SCHEMA_QUERY
            return json.dumps(self.database)
        raise AssertionError("Unexpected Docker command")


class ApiSchemaGateTests(unittest.TestCase):
    def test_current_immutable_image_matches_actual_schema_without_pulls_starts_or_credentials(self):
        fake = FakeDocker()
        proof = preflight.check_api_schema(environment(), fake)
        self.assertEqual(proof["migration_count"], 29)
        self.assertTrue(proof["image_digest_verified"])
        # Config ID and index digest are different legitimate OCI objects.
        self.assertNotEqual(fake.image["Id"], environment()["API_IMAGE"].split('@')[1])
        self.assertEqual([args[0] for args, _ in fake.calls], ["image", "compose", "inspect", "exec"])
        for args, _ in fake.calls:
            self.assertFalse(any(item in args for item in ("pull", "run", "create", "start", "up", "password", "PGPASSWORD")))
        self.assertIn("BEGIN READ ONLY", preflight.SCHEMA_QUERY)
        self.assertNotRegex(preflight.SCHEMA_QUERY.upper(), r"\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b")

    def test_old_image_without_capability_is_refused_even_when_runtime_claims_current_digest(self):
        fake = FakeDocker()
        fake.image["Config"]["Labels"] = {}
        with self.assertRaisesRegex(preflight.Refused, "api_schema_image_compatibility_unproven"):
            preflight.check_api_schema(environment(), fake)
        self.assertEqual(len(fake.calls), 1)

    def test_classic_docker_26_inspects_without_new_platform_option(self):
        fake = FakeDocker()
        def classic(args, **kwargs):
            if "--platform" in args:
                raise AssertionError("Docker 26 rejects image inspect --platform")
            return fake(args, **kwargs)
        self.assertTrue(preflight.check_api_schema(environment(), classic)["image_digest_verified"])
        self.assertEqual(fake.calls[0][0], ["image", "inspect", environment()["API_IMAGE"]])

    def test_containerd_index_without_platform_metadata_uses_explicit_child_inspection(self):
        fake = FakeDocker()
        def containerd(args, **kwargs):
            if args == ["image", "inspect", environment()["API_IMAGE"]]:
                fake.calls.append((args, None))
                return json.dumps([{"Id": "sha256:" + "e" * 64, "RepoDigests": [environment()["API_IMAGE"]]}])
            return fake(args, **kwargs)
        self.assertTrue(preflight.check_api_schema(environment(), containerd)["image_digest_verified"])
        self.assertEqual(fake.calls[1][0], ["image", "inspect", "--platform", "linux/amd64", environment()["API_IMAGE"]])

    def test_present_wrong_platform_never_triggers_a_fallback_that_could_hide_it(self):
        for value in ({"Os": "windows", "Architecture": "amd64"}, {"Os": "linux", "Architecture": "arm64"},
                      {"Os": None, "Architecture": "arm64"}):
            fake = FakeDocker()
            fake.image.update(value)
            with self.subTest(value=value), self.assertRaisesRegex(preflight.Refused, "api_schema_image_platform_invalid"):
                preflight.check_api_schema(environment(), fake)
            self.assertEqual(len(fake.calls), 1)

    def test_containerd_fallback_still_rejects_absent_or_wrong_metadata_and_digest(self):
        for mutation in (lambda x: x.pop("Os"), lambda x: x.update(Architecture="arm64"),
                         lambda x: x.update(RepoDigests=["wrong@sha256:" + "f" * 64])):
            fake = FakeDocker()
            mutation(fake.image)
            def containerd(args, **kwargs):
                if args == ["image", "inspect", environment()["API_IMAGE"]]:
                    return json.dumps([{}])
                return fake(args, **kwargs)
            with self.subTest(mutation=mutation), self.assertRaises(preflight.Refused):
                preflight.check_api_schema(environment(), containerd)

    def test_unrecognized_or_self_declared_capability_never_authorizes_an_arbitrary_schema(self):
        for name, value in ((preflight.LABEL_CAPABILITY, "v99"), (preflight.LABEL_SCHEMA_HASH, "f" * 64),
                            (preflight.LABEL_SCHEMA_COUNT, "999"), (preflight.LABEL_SCHEMA_LATEST, "20990101000000_Anything")):
            fake = FakeDocker()
            fake.image["Config"]["Labels"][name] = value
            with self.assertRaisesRegex(preflight.Refused, "api_schema_image_compatibility_unproven"):
                preflight.check_api_schema(environment(), fake)

    def test_labels_from_an_unproven_image_digest_or_wrong_platform_do_not_suffice(self):
        fake = FakeDocker()
        fake.image["RepoDigests"] = [environment()["API_IMAGE"].replace("a" * 64, "f" * 64)]
        with self.assertRaisesRegex(preflight.Refused, "api_schema_image_digest_unproven"):
            preflight.check_api_schema(environment(), fake)
        fake = FakeDocker()
        fake.image["Architecture"] = "arm64"
        with self.assertRaisesRegex(preflight.Refused, "api_schema_image_platform_invalid"):
            preflight.check_api_schema(environment(), fake)

    def test_real_schema_missing_extra_or_rewritten_migration_is_refused(self):
        for change in (lambda ids: ids[:-1], lambda ids: ids + ["20261101000000_Future"],
                       lambda ids: ["20261001000100_Changed" if i == ids[0] else i for i in ids]):
            fake = FakeDocker()
            fake.database["migrations"] = change(fake.database["migrations"])
            with self.assertRaises(preflight.Refused):
                preflight.check_api_schema(environment(), fake)

    def test_wrong_database_or_non_readonly_response_is_refused(self):
        for key, value in (("database", "other"), ("server_version_num", 170000), ("read_only", "off")):
            fake = FakeDocker()
            fake.database[key] = value
            with self.assertRaisesRegex(preflight.Refused, "api_schema_database_identity_invalid"):
                preflight.check_api_schema(environment(), fake)

    def test_schema_cannot_be_read_from_a_foreign_container_mount_or_published_postgres(self):
        mutations = [lambda pg: pg["Config"]["Labels"].update({"com.docker.compose.project": "other"}),
                     lambda pg: pg["Config"].update({"Image": "postgres:latest"}),
                     lambda pg: pg["Config"].update({"User": "root"}),
                     lambda pg: pg["Mounts"][0].update({"Source": "/tmp/unrelated"}),
                     lambda pg: pg["NetworkSettings"]["Ports"].update({"5432/tcp": [{"HostIp": "0.0.0.0"}]})]
        for mutate in mutations:
            fake = FakeDocker()
            mutate(fake.postgres)
            with self.assertRaises(preflight.Refused):
                preflight.check_api_schema(environment(), fake)
            self.assertFalse(any(args[0] == "exec" for args, _ in fake.calls))

    def test_unavailable_or_ambiguous_postgres_never_falls_back_to_a_configured_schema_flag(self):
        for value in ("", "c" * 64 + "\n" + "d" * 64):
            fake = FakeDocker()
            fake.running_id = value
            with self.assertRaisesRegex(preflight.Refused, "api_schema_postgres_not_running_or_ambiguous"):
                preflight.check_api_schema(environment(), fake)

    def test_docker_error_does_not_expose_stderr_or_secret_like_output(self):
        response = SimpleNamespace(returncode=1, stdout="fictional-private-data", stderr="fictional-secret")
        with patch.object(preflight.subprocess, "run", return_value=response):
            with self.assertRaisesRegex(preflight.Refused, "^api_schema_docker_command_failed$"):
                preflight.docker_read(["image", "inspect", "unused"])

    def test_host_only_is_not_reported_as_api_ready_and_full_mode_always_checks_schema(self):
        with patch.object(preflight, "check_host", return_value=environment()), patch.object(preflight, "check_api_schema") as gate:
            with patch.object(preflight.sys, "argv", ["preflight.py", "--host-only"]), patch("builtins.print") as output:
                preflight.main()
                self.assertFalse(json.loads(output.call_args.args[0])["api_start_permitted"])
                gate.assert_not_called()
            gate.return_value = {"migration_count": 29}
            with patch.object(preflight.sys, "argv", ["preflight.py"]), patch("builtins.print") as output:
                preflight.main()
                self.assertTrue(json.loads(output.call_args.args[0])["api_start_permitted"])
                gate.assert_called_once()

    def test_build_labels_and_gate_hash_the_actual_migration_attributes_including_handwritten_files(self):
        ids = source_migrations()
        self.assertEqual(len(ids), 29)
        self.assertEqual(len(set(ids)), 29)
        self.assertIn("20261001000100_InitialCreate", ids)
        expected = hashlib.sha256(("\n".join(ids) + "\n").encode()).hexdigest()
        self.assertEqual(expected, preflight.API_SCHEMA_SHA256)
        dockerfile = (REPO / "deploy/api.Dockerfile").read_text()
        self.assertIn('com.longbeach.api.customer-registry="v1"', dockerfile)
        self.assertIn('com.longbeach.api.schema.migration-count="29"', dockerfile)
        self.assertIn('com.longbeach.api.schema.latest="' + ids[-1] + '"', dockerfile)
        self.assertIn('com.longbeach.api.schema.migrations-sha256="' + expected + '"', dockerfile)
        self.assertIn('test "$migration_sha256" = "' + expected + '"', dockerfile)
        self.assertIn('Migrations/*.cs | LC_ALL=C sort', dockerfile)
        self.assertNotIn("ARG API_SCHEMA", dockerfile)

    def test_actual_dockerfile_shell_guard_rejects_unreviewed_migration_without_dotnet_or_docker(self):
        dockerfile = (REPO / "deploy/api.Dockerfile").read_text()
        block = re.search(r"^RUN migrations=.*?(?=^RUN dotnet publish)", dockerfile, re.MULTILINE | re.DOTALL)
        self.assertIsNotNone(block)
        command = block.group(0)[4:].strip()
        self.assertNotIn("dotnet", command)
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "src/LongBeach.Infrastructure/Persistence/Migrations"
            directory.mkdir(parents=True)
            for index, migration in enumerate(source_migrations()):
                (directory / (str(index) + ".cs")).write_text('[Migration("' + migration + '")]\n')
            result = subprocess.run(["/bin/sh", "-c", command], cwd=temporary, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0)
            (directory / "future.cs").write_text('[Migration("20261101000000_Unreviewed")]\n')
            refused = subprocess.run(["/bin/sh", "-c", command], cwd=temporary, capture_output=True, timeout=10)
            self.assertNotEqual(refused.returncode, 0)

    def test_service_orders_host_guard_postgres_only_live_gate_then_api_start(self):
        lines = (HERE / "longbeach-runtime.service").read_text().splitlines()
        before = [line for line in lines if line.startswith("ExecStartPre=")]
        self.assertEqual(len(before), 3)
        self.assertTrue(before[0].endswith("preflight.py --host-only"))
        self.assertIn("--no-deps postgres", before[1])
        self.assertNotIn(" api", before[1])
        self.assertNotIn(" caddy", before[1])
        self.assertTrue(before[2].endswith("preflight.py"))
        start = next(line for line in lines if line.startswith("ExecStart="))
        self.assertIn("--pull never", start)
        self.assertGreater(lines.index(start), lines.index(before[2]))
        self.assertIn("PartOf=docker.service", lines)
        for line in lines:
            if line.startswith(("ExecStartPre=", "ExecStart=", "ExecStop=")) and "/usr/bin/docker " in line:
                self.assertIn("/usr/bin/docker --host unix:///var/run/docker.sock compose", line)
                self.assertIn("--env-file /etc/longbeach/runtime.env -f /opt/longbeach/runtime/compose.yaml", line)
        workflow = (REPO / ".github/workflows/release-images.yml").read_text()
        self.assertIn("Verify API schema compatibility contract", workflow)
        self.assertLess(workflow.index("Verify API schema compatibility contract"), workflow.index("Build and publish API image"))

@unittest.skipUnless(shutil.which("docker"), "Docker CLI not installed")
class ComposeTests(unittest.TestCase):
    def test_resolved_compose_has_private_database_and_startup_guards(self):
        values = environment()
        values["CADDY_CONFIG"] = str(HERE / "Caddyfile.certificate")
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "settings.env"
            path.write_text("\n".join(name + "=" + value for name, value in values.items()) + "\n")
            result = subprocess.run(["docker", "compose", "--env-file", str(path), "-f", str(HERE / "compose.yaml"),
                                     "config", "--format", "json"], check=True, capture_output=True, text=True, timeout=30)
        compose = json.loads(result.stdout)
        services = compose["services"]
        self.assertFalse(services["postgres"].get("ports"))
        self.assertFalse(services["api"].get("ports"))
        self.assertEqual({str(port["published"]) for port in services["caddy"]["ports"]}, {"80", "443"})
        self.assertEqual(services["api"]["user"], "1654:1654")
        self.assertEqual(services["postgres"]["user"], "999:999")
        # Docker must not independently boot writers/proxy before the systemd gate.
        self.assertEqual(services["api"]["restart"], "on-failure:5")
        self.assertEqual(services["caddy"]["restart"], "on-failure:5")
        self.assertEqual(services["postgres"]["restart"], "unless-stopped")
        self.assertEqual(services["caddy"]["cap_add"], ["NET_BIND_SERVICE"])
        self.assertFalse(services["api"].get("cap_add"))
        self.assertFalse(services["postgres"].get("cap_add"))
        self.assertTrue(compose["networks"]["database"]["internal"])
        self.assertNotIn("edge", services["postgres"]["networks"])
        self.assertNotIn("archive", services["api"]["networks"])
        self.assertEqual(services["api"]["environment"]["Integrations__Banking__ImportOnly"], "true")
        for key in ("Database__MigrateOnStartup", "Authorization__SeedOnStartup", "BackgroundJobs__Enabled"):
            self.assertEqual(services["api"]["environment"][key], "false")
        for service in services.values():
            self.assertIn("@sha256:", service["image"])
            self.assertTrue(service["read_only"])
            self.assertFalse(service.get("privileged", False))
            self.assertEqual(service["cap_drop"], ["ALL"])
            self.assertTrue(service.get("healthcheck"))
            for volume in service.get("volumes", []):
                self.assertNotEqual(volume["source"], "/var/run/docker.sock")


if __name__ == "__main__":
    unittest.main()
