"""Execute the actual startup Python with synthetic metadata/GCS and a temporary filesystem."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch


class Response(io.BytesIO):
    headers = {"Metadata-Flavor": "Google"}


class StartupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = {"gates": {"database_restore_approved": False, "runtime_enabled": False, "workers_enabled": False}}
        self.archive = self.make_archive()
        self.calls = []
        self.prepares = []
        self.prepare_failure = False

    def make_archive(self, extra=None):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w:gz") as archive:
            entry = tarfile.TarInfo("bin/bootstrap-vm")
            entry.mode = 0o755
            content = b"#!/bin/sh\nexit 0\n"
            entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
            if extra is not None:
                archive.addfile(extra, io.BytesIO(b"x") if extra.isfile() else None)
        return data.getvalue()

    def request(self, request, timeout):
        self.calls.append(request.full_url)
        if request.full_url.endswith("/instance/attributes/longbeach-bootstrap-manifest"):
            return Response(json.dumps(self.manifest).encode())
        if request.full_url.endswith("/instance/service-accounts/default/token"):
            return Response(b'{"access_token":"synthetic-memory-only-token"}')
        if request.full_url == "https://storage.googleapis.com/download/storage/v1/b/test-private-bucket/o/vm%2Ftest.tar.gz?alt=media&generation=1234":
            self.assertEqual(request.get_header("Authorization"), "Bearer synthetic-memory-only-token")
            return Response(self.archive)
        raise AssertionError("Unexpected network destination")

    def prepare(self, argv, check):
        self.assertTrue(check)
        self.assertEqual(argv[-1], "--prepare-only")
        self.assertEqual(argv[-3], "--manifest")
        self.assertEqual(Path(argv[-2]), self.root / "etc/bootstrap.json")
        self.prepares.append(argv)
        if self.prepare_failure:
            raise subprocess.CalledProcessError(1, argv)
        return subprocess.CompletedProcess(argv, 0)

    def execute(self, checksum=None):
        template = (Path(__file__).parents[1] / "startup.sh.tftpl").read_text()
        source = template.split("/usr/bin/python3 - <<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
        bundle = {"bucket": "test-private-bucket", "object": "vm/test.tar.gz", "generation": "1234",
                  "sha256": checksum or hashlib.sha256(self.archive).hexdigest()}
        source = source.replace("${bundle_json_b64}", base64.b64encode(json.dumps(bundle).encode()).decode())
        source = source.replace('Path("/etc/longbeach")', "Path(" + repr(str(self.root / "etc")) + ")")
        source = source.replace('Path("/opt/longbeach/bootstrap")', "Path(" + repr(str(self.root / "bootstrap")) + ")")
        with patch("urllib.request.urlopen", self.request), patch("subprocess.run", self.prepare):
            exec(compile(source, "startup-loader-under-test", "exec"), {"__name__": "__main__"})

    def test_prepares_verified_generation_once_and_keeps_runtime_control_on_reboot(self):
        self.execute()
        marker = self.root / "bootstrap/prepared.json"
        self.assertTrue(json.loads(marker.read_text())["prepared_only"])
        self.assertEqual(os.stat(self.root / "etc/bootstrap.json").st_mode & 0o777, 0o600)
        control = self.root / "etc/runtime-control.json"
        control.write_text('{"runtime_enabled":true}')
        with self.assertRaises(SystemExit) as stopped:
            self.execute()
        self.assertEqual(stopped.exception.code, 0)
        self.assertEqual(len(self.prepares), 1)
        self.assertEqual(sum("storage.googleapis.com" in url for url in self.calls), 1)
        self.assertEqual(control.read_text(), '{"runtime_enabled":true}')
        for item in self.root.rglob("*"):
            if item.is_file():
                self.assertNotIn(b"synthetic-memory-only-token", item.read_bytes())

    def test_wrong_sha_refuses_before_prepare(self):
        with self.assertRaisesRegex(RuntimeError, "SHA-256 mismatch"):
            self.execute("0" * 64)
        self.assertEqual(self.prepares, [])
        self.assertFalse((self.root / "bootstrap/prepared.json").exists())

    def test_unsafe_archive_entries_refused(self):
        for kind in ["relative", "absolute", "symlink", "hardlink", "device", "setuid"]:
            with self.subTest(kind=kind):
                extra = tarfile.TarInfo({"relative": "../escape", "absolute": "/escape"}.get(kind, "extra"))
                extra.size = 1
                if kind == "symlink":
                    extra.type, extra.linkname, extra.size = tarfile.SYMTYPE, "/escape", 0
                if kind == "hardlink":
                    extra.type, extra.linkname, extra.size = tarfile.LNKTYPE, "bin/bootstrap-vm", 0
                if kind == "device":
                    extra.type, extra.size = tarfile.CHRTYPE, 0
                if kind == "setuid":
                    extra.mode = 0o4755
                self.archive = self.make_archive(extra)
                with self.assertRaisesRegex(RuntimeError, "archive"):
                    self.execute()
        self.assertEqual(self.prepares, [])

    def test_failed_prepare_can_retry_only_identical_verified_bundle(self):
        self.prepare_failure = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.execute()
        self.assertFalse((self.root / "bootstrap/prepared.json").exists())
        self.prepare_failure = False
        self.execute()
        self.assertEqual(len(self.prepares), 2)
        self.assertTrue((self.root / "bootstrap/prepared.json").exists())

    def test_edited_partial_bundle_refuses_retry(self):
        self.prepare_failure = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.execute()
        digest = hashlib.sha256(self.archive).hexdigest()
        (self.root / "bootstrap" / digest / "bin/bootstrap-vm").write_text("edited")
        self.prepare_failure = False
        with self.assertRaisesRegex(RuntimeError, "installed bundle differs"):
            self.execute()
        self.assertEqual(len(self.prepares), 1)

    def test_changed_manifest_is_not_silently_applied_on_reboot(self):
        self.execute()
        previous = (self.root / "etc/bootstrap.json").read_bytes()
        self.manifest["api_image"] = "new-unreviewed-image"
        with self.assertRaisesRegex(RuntimeError, "manifest differs"):
            self.execute()
        self.assertEqual((self.root / "etc/bootstrap.json").read_bytes(), previous)
        self.assertEqual(len(self.prepares), 1)

    def test_open_gates_refused_before_prepare(self):
        self.manifest["gates"]["workers_enabled"] = True
        with self.assertRaisesRegex(RuntimeError, "gates must be closed"):
            self.execute()
        self.assertEqual(self.prepares, [])


if __name__ == "__main__":
    unittest.main()
