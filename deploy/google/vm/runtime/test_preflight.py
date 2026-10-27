"""Local safety tests; all credentials and images are fictitious."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import stat
import tempfile
from types import SimpleNamespace
import unittest

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
