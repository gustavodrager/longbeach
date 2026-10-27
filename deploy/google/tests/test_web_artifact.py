"""Provenance gates only; synthetic files, no frontend rebuild or cloud access."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "web_artifact.py"
SPEC = importlib.util.spec_from_file_location("web_artifact", MODULE_PATH)
WEB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WEB)


class WebArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="longbeach-web-guard-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name) / "dist"
        self.directory.mkdir(mode=0o700)
        (self.directory / "index.html").write_text("synthetic fixture")
        self.environment = {"GCP_ENVIRONMENT": "production", "GCP_PROJECT_ID": "parsero-test-project",
                            "GCP_WEB_DIST_DIR": str(self.directory),
                            "VITE_API_URL": "https://api.longbeach.quebranunca.com.br"}
        self.env_patch = patch.dict(os.environ, self.environment, clear=True)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.tree_patch = patch.object(WEB, "source_tree", return_value="b" * 40)
        self.tree_patch.start()
        self.addCleanup(self.tree_patch.stop)

    def command(self, command):
        with patch.object(sys, "argv", [str(MODULE_PATH), command]):
            WEB.main()

    def record(self):
        self.command("record")

    def test_verified_artifact_and_optional_google_id(self):
        self.record()
        self.command("verify")

    def test_changed_file_is_refused(self):
        self.record()
        (self.directory / "index.html").write_text("changed fixture")
        with self.assertRaises(ValueError):
            self.command("verify")

    def test_missing_provenance_is_refused(self):
        with self.assertRaises(FileNotFoundError):
            self.command("verify")

    def test_other_source_is_refused(self):
        os.environ["GCP_WEB_SOURCE_COMMIT"] = "a" * 40
        with self.assertRaises(ValueError):
            WEB.inputs()

    def test_other_project_is_refused(self):
        self.record()
        os.environ["GCP_PROJECT_ID"] = "parsero-other-project"
        with self.assertRaises(ValueError):
            self.command("verify")

    def test_staging_cannot_use_production_api(self):
        os.environ["GCP_ENVIRONMENT"] = "staging"
        with self.assertRaises(ValueError):
            WEB.inputs()

    def test_staging_cannot_use_production_api_with_uppercase_dns(self):
        os.environ["GCP_ENVIRONMENT"] = "staging"
        os.environ["VITE_API_URL"] = "HTTPS://API.longbeach.quebranunca.com.br"
        with self.assertRaises(ValueError):
            WEB.inputs()

    def test_output_inside_checkout_is_refused(self):
        os.environ["GCP_WEB_DIST_DIR"] = str(WEB.REPOSITORY / "frontend" / "dist")
        with self.assertRaises(ValueError):
            WEB.inputs()

    def test_symlink_is_refused(self):
        self.record()
        (self.directory / "linked.html").symlink_to(self.directory / "index.html")
        with self.assertRaises(ValueError):
            self.command("verify")

    def test_public_output_directory_is_refused(self):
        self.directory.chmod(0o755)
        with self.assertRaises(ValueError):
            self.record()

    def test_stale_metadata_is_refused(self):
        self.record()
        metadata = self.directory / WEB.METADATA
        data = json.loads(metadata.read_text())
        data["source_commit"] = "a" * 40
        metadata.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            self.command("verify")


if __name__ == "__main__":
    unittest.main()
