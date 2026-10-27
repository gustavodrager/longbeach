"""Synthetic safety tests only. No host package, Docker, disk, or cloud calls."""
import base64
import copy
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader("bootstrap", str(Path(__file__).with_name("bootstrap-vm")))
spec = importlib.util.spec_from_loader(loader.name, loader)
b = importlib.util.module_from_spec(spec)
loader.exec_module(b)


def manifest():
    return {"schema_version": 1, "project_id": b.PROJECT, "api_domain": b.vm_config.DOMAIN,
            "web_origin": b.vm_config.WEB_ORIGIN,
            "api_image": "southamerica-east1-docker.pkg.dev/" + b.PROJECT + "/longbeach/api@sha256:" + "a" * 64,
            "postgres_backup_image": "southamerica-east1-docker.pkg.dev/" + b.PROJECT + "/longbeach/postgres-backup@sha256:" + "b" * 64,
            "caddy_image": "docker.io/library/caddy@sha256:" + b.CADDY_DIGEST,
            "data": {"device": b.DEVICE, "mount_path": b.DATA},
            "gates": {"database_restore_approved": False, "runtime_enabled": False, "workers_enabled": False},
            "backup": {"bucket": b.PROJECT + "-longbeach-vm-backups", "prefix": "pgbackrest/longbeach/"},
            "secret_refs": {"ConnectionStrings__LongBeach": {"secret_id": "longbeach-db-runtime-connection", "version": "1"},
                            "Authentication__Jwt__SigningKey": {"secret_id": "longbeach-jwt-signing-key", "version": "1"}},
            "postgres_admin_secret": {"secret_id": "longbeach-vm-postgres-admin-password", "version": "1"},
            "public_environment": {"Cors__AllowedOrigins__0": b.vm_config.WEB_ORIGIN}}


class SafetyTests(unittest.TestCase):
    def disk(self):
        return {"name": "/dev/sdb", "type": "disk", "size": b.DATA_BYTES,
                "fstype": None, "uuid": None, "mountpoints": [None]}

    def test_blank_disk_classification_and_existing_ext4(self):
        self.assertEqual(b.classify_disk(self.disk(), [], 2, ["/dev/sda1", "/dev/sda"]), "blank")
        row = self.disk()
        row.update(fstype="ext4", uuid="12345678-1234-1234-1234-123456789abc", mountpoints=[b.DATA])
        self.assertEqual(b.classify_disk(row, [{"type": "ext4"}], 0, ["/dev/sda"]), "existing")

    def test_root_wrong_size_partitions_and_unknown_signatures_refused(self):
        cases = []
        for change in ({"name": "/dev/sda"}, {"size": 10 * 1024 ** 3}, {"children": [{"name": "/dev/sdb1"}]},
                       {"fstype": "xfs"}, {"mountpoints": ["/other"]}, {"uuid": "unexplained"}):
            row = self.disk(); row.update(change); cases.append((row, [], 2))
        cases.extend([(self.disk(), [{"type": "LVM2_member"}], 2), (self.disk(), [], 0)])
        for row, signatures, status in cases:
            with self.subTest(row=row), self.assertRaises(b.Refused):
                b.classify_disk(row, signatures, status, ["/dev/sda"])

    def test_initialize_requires_explicit_flag_and_does_not_issue_mkfs(self):
        calls = []
        i = b.Installer(manifest(), run=lambda argv, **kwargs: calls.append(argv))
        i.disk_probe = lambda: ("blank", self.disk())
        with self.assertRaisesRegex(b.Refused, "explicit-initialize"):
            i.mount_data(False)
        self.assertEqual(calls, [])

    def test_metadata_rules_drop_only_web_tcp_credentials_not_dns_or_archive_network(self):
        self.assertEqual(b.METADATA_RULE_SOURCES, ("172.29.10.0/24", "172.29.11.0/24"))
        for source in b.METADATA_RULE_SOURCES:
            rule = b.metadata_rule(source)
            self.assertEqual(rule, ["-s", source, "-d", "169.254.169.254/32", "-p", "tcp", "-m", "multiport", "--dports", "80,443", "-j", "DROP"])

    def test_firewall_nft_backend_and_idempotent_checks(self):
        calls = []
        rules = "\n".join("-A DOCKER-USER " + " ".join(b.metadata_rule(source)) for source in b.METADATA_RULE_SOURCES)
        def run(argv, **kwargs):
            calls.append(argv)
            output = b"iptables v1.8.11 (nf_tables)" if argv[-1] == "--version" else rules.encode() if "-S" in argv else b""
            return subprocess.CompletedProcess(argv, 0, output, b"")
        b.Installer(manifest(), run=run).firewall()
        self.assertFalse(any("-N" in argv or "-I" in argv for argv in calls))
        with self.assertRaisesRegex(b.Refused, "nft-backend"):
            b.Installer(manifest(), run=lambda argv, **kwargs: subprocess.CompletedProcess(argv, 0, b"iptables (legacy)", b"")).firewall()

    def test_firewall_drops_are_inserted_before_an_earlier_return(self):
        calls = []
        rules = ["-A DOCKER-USER -j RETURN"]
        def run(argv, **kwargs):
            calls.append(argv)
            if "-I" in argv:
                rules.insert(0, "-A DOCKER-USER " + " ".join(argv[6:]))
            output = b"iptables v1.8.11 (nf_tables)" if argv[-1] == "--version" else "\n".join(rules).encode() if "-S" in argv else b""
            return subprocess.CompletedProcess(argv, 0, output, b"")
        b.Installer(manifest(), run=run).firewall()
        self.assertEqual(sum("-I" in argv for argv in calls), 2)
        self.assertFalse(any("-D" in argv or "-F" in argv for argv in calls))
        self.assertNotIn("RETURN", " ".join(rules[:2]))

    def test_runtime_and_admin_credentials_remain_distinct_and_ephemeral(self):
        class Cloud:
            def token(self): return "fake-memory-token"
            def secret(self, ref, token):
                self.assert_token = token
                return {"longbeach-db-runtime-connection": "Database=longbeach;Username=longbeach_runtime;Password=fictional-runtime",
                        "longbeach-jwt-signing-key": "fictional-signing-key-for-unit-tests-only",
                        "longbeach-vm-postgres-admin-password": "fictional-new-admin-password-for-unit-test"}[ref["secret_id"]]
        i = b.Installer(manifest(), cloud=Cloud())
        writes, directories = [], []
        i.run_tmpfs = lambda: None
        i.write = lambda path, data, **kw: writes.append((path, data, kw))
        i.directory = lambda path, **kw: directories.append((path, kw))
        i.refresh_secrets()
        self.assertEqual({x[0] for x in writes}, {"/run/longbeach/appsettings.Production.json", "/run/longbeach/postgres-admin-password"})
        app = json.loads(writes[0][1])
        self.assertEqual(b.vm_config.database_credentials(app["ConnectionStrings"]["LongBeach"])[1], "longbeach_runtime")
        self.assertEqual(writes[0][2], {"gid": 1654, "mode": 0o640})
        self.assertEqual(writes[1][2], {"gid": 999, "mode": 0o640})
        self.assertNotIn("fake-memory-token", json.dumps(writes))

    def test_image_binding_accepts_only_same_digest_and_platform_including_dockerhub_alias(self):
        image = manifest()["caddy_image"]
        row = {"Architecture": "amd64", "Os": "linux", "RepoDigests": ["caddy@sha256:" + b.CADDY_DIGEST]}
        self.assertTrue(b.image_matches(image, row))
        for change in ({"Architecture": "arm64"}, {"RepoDigests": ["caddy@sha256:" + "0" * 64]}):
            other = dict(row); other.update(change)
            self.assertFalse(b.image_matches(image, other))

    def test_docker_login_token_only_stdin_and_temporary_config_removed(self):
        calls, configs = [], []
        m = manifest()
        def run(argv, **kwargs):
            calls.append((argv, kwargs))
            configs.append(kwargs["extra_env"]["DOCKER_CONFIG"])
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, json.dumps([{"Architecture": "amd64", "Os": "linux", "RepoDigests": [argv[-1]]}]).encode(), b"")
            return subprocess.CompletedProcess(argv, 0, b"", b"")
        class Cloud:
            def token(self): return "synthetic-login-token"
        i = b.Installer(m, run=run, cloud=Cloud())
        i.run_tmpfs = lambda: None
        original = tempfile.TemporaryDirectory
        with tempfile.TemporaryDirectory() as root:
            with patch.object(b.tempfile, "TemporaryDirectory", lambda **kw: original(dir=root, prefix=kw["prefix"])):
                i.pull_images()
            self.assertFalse(any(Path(root).iterdir()))
        self.assertTrue(all("synthetic-login-token" not in " ".join(argv) for argv, _ in calls))
        self.assertEqual(calls[0][1]["input_bytes"], b"synthetic-login-token\n")
        self.assertEqual(sum(argv[:2] == ["docker", "pull"] for argv, _ in calls), 3)
        self.assertTrue(all(not Path(path).exists() for path in configs))

    def test_secret_reader_pins_version_and_rejects_unexpected_version(self):
        reader = b.CloudReader()
        urls = []
        def get(url, headers):
            urls.append((url, headers))
            return json.dumps({"name": "projects/123/secrets/longbeach-test/versions/7", "payload": {"data": base64.b64encode(b"fictional-secret").decode()}}).encode()
        reader.get = get
        self.assertEqual(reader.secret({"secret_id": "longbeach-test", "version": "7"}, "memory-token"), "fictional-secret")
        self.assertEqual(urls[0][0], "https://secretmanager.googleapis.com/v1/projects/" + b.PROJECT + "/secrets/longbeach-test/versions/7:access")
        with self.assertRaisesRegex(b.Refused, "identity-mismatch"):
            reader.secret({"secret_id": "longbeach-test", "version": "8"}, "memory-token")
        with self.assertRaisesRegex(b.Refused, "numbered"):
            reader.secret({"secret_id": "longbeach-test", "version": "latest"}, "memory-token")

    def test_install_units_orders_firewall_before_docker_and_secrets_before_runtime(self):
        i = b.Installer(manifest())
        writes = {}
        i.directory = lambda *args, **kwargs: None
        i.write = lambda path, value, **kwargs: writes.update({path: value})
        i.install_units()
        self.assertIn("Before=docker.service", writes["/etc/systemd/system/longbeach-metadata-firewall.service"])
        docker_dropin = writes["/etc/systemd/system/docker.service.d/longbeach-metadata.conf"]
        self.assertIn("Requires=longbeach-metadata-firewall.service longbeach-secrets.service", docker_dropin)
        self.assertIn("After=longbeach-metadata-firewall.service longbeach-secrets.service", docker_dropin)
        self.assertIn("RequiresMountsFor=/var/lib/longbeach", docker_dropin)
        self.assertIn("RuntimeDirectoryPreserve=yes", writes["/etc/systemd/system/longbeach-secrets.service"])
        self.assertIn("Requires=longbeach-secrets.service", writes["/etc/systemd/system/longbeach-runtime.service.d/credentials.conf"])

    def test_prepare_sequence_only_reloads_units_and_never_activates_application(self):
        steps, commands, writes = [], [], []
        i = b.Installer(manifest(), run=lambda argv, **kw: commands.append(argv))
        i.host = lambda: steps.append("host")
        i.refuse_active_prepare = lambda: steps.append("closed-controls")
        i.mount_data = lambda initialize: steps.append(("mount", initialize)) or "12345678-1234-1234-1234-123456789abc"
        i.packages = lambda: steps.append("packages")
        i.firewall = lambda: steps.append("firewall")
        i.refresh_secrets = lambda: steps.append("secrets")
        i.pull_images = lambda: steps.append("images")
        i.install_files = lambda uuid: steps.append("install")
        i.write = lambda path, data, **kw: writes.append((path, json.loads(data)))
        with patch.object(b.Path, "read_bytes", return_value=b'{"synthetic":true}'):
            receipt = i.prepare(False)
        self.assertEqual(steps, ["host", "closed-controls", ("mount", False), "packages", "closed-controls", "firewall", "secrets", "images", "install"])
        self.assertEqual(commands, [["systemctl", "daemon-reload"]])
        self.assertFalse(receipt["runtime_started"])
        self.assertFalse(receipt["workers_enabled"])
        self.assertEqual(writes[0][0], "/etc/longbeach/host-prepared.json")

    def test_host_commands_do_not_inherit_sdk_or_credential_environment(self):
        with patch.object(b.subprocess, "run", return_value=subprocess.CompletedProcess(["true"], 0, b"", b"")) as called:
            b.command(["true"], input_bytes=b"memory-only-input")
        kwargs = called.call_args.kwargs
        self.assertEqual(kwargs["env"], b.CLEAN_ENV)
        self.assertEqual(kwargs["input"], b"memory-only-input")
        self.assertTrue(kwargs["capture_output"])
        self.assertFalse(kwargs["check"])

    def test_credential_http_redirects_refused(self):
        with self.assertRaisesRegex(b.Refused, "redirect-refused"):
            b.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.invalid")

    def test_reprepare_refuses_inactive_existing_docker_before_any_start(self):
        calls = []
        def run(argv, **kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 3, b"", b"")
        i = b.Installer(manifest(), run=run)
        with patch.object(b.shutil, "which", return_value="/usr/bin/docker"), patch.object(b.Path, "exists", return_value=False):
            with self.assertRaisesRegex(b.Refused, "inactive-needs-manual-review"):
                i.refuse_active_prepare()
        self.assertEqual(calls, [["systemctl", "is-active", "--quiet", "docker.service"]])


if __name__ == "__main__":
    unittest.main()
