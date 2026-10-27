"""Exercise archived old/new layouts using synthetic Git commits, with no cloud."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("web_source_layout", SCRIPTS / "web_artifact.py")
WEB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WEB)


class WebSourceLayoutTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="longbeach-source-layout-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repository = self.root / "repository"
        self.repository.mkdir()
        self.git("init", "--quiet")
        self.git("config", "user.name", "Synthetic Test")
        self.git("config", "user.email", "fixture@example.invalid")
        app = self.repository / "app"
        app.mkdir()
        (app / "package.json").write_text('{"private": true}\n')
        (app / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
        (app / "fixture.txt").write_text("archived frontend fixture")
        self.git("add", "app")
        self.git("commit", "--quiet", "-m", "Legacy frontend layout")
        self.legacy = self.git("rev-parse", "HEAD")
        self.legacy_tree = self.git("rev-parse", self.legacy + ":app")
        app.rename(self.repository / "frontend")
        self.git("add", "--all")
        self.git("commit", "--quiet", "-m", "Separated frontend layout")
        self.current = self.git("rev-parse", "HEAD")
        self.manifest = self.root / "source-revisions.json"
        self.write_manifest(self.legacy)
        for name, value in (("REPOSITORY", self.repository), ("MANIFEST", self.manifest)):
            patcher = patch.object(WEB, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def git(self, *arguments):
        return subprocess.check_output(
            ["git", "-C", str(self.repository), *arguments],
            text=True, stderr=subprocess.PIPE).strip()

    def write_manifest(self, source, **extra):
        self.manifest.write_text(json.dumps({
            "schema_version": 1,
            "web_source_commit": source,
            "production_api_origin": "https://api.longbeach.quebranunca.com.br",
            **extra,
        }))

    def test_resolves_layout_in_pinned_commit_instead_of_checkout(self):
        self.assertFalse((self.repository / "app").exists())
        self.assertEqual("app", WEB.source_path(self.legacy))
        self.assertEqual("frontend", WEB.source_path(self.current))
        self.assertEqual(self.legacy_tree, WEB.source_tree(self.legacy))
        self.assertEqual(self.legacy_tree, WEB.source_tree(self.current))

    def test_rejects_ambiguous_layout_until_manifest_selects_one(self):
        shutil.copytree(self.repository / "frontend", self.repository / "app")
        self.git("add", "app")
        self.git("commit", "--quiet", "-m", "Ambiguous fixture")
        source = self.git("rev-parse", "HEAD")
        self.write_manifest(source)
        with self.assertRaises(ValueError):
            WEB.source_path(source)
        self.write_manifest(source, web_source_path="frontend")
        self.assertEqual("frontend", WEB.source_path(source))

    def test_rejects_missing_or_unsafe_explicit_path(self):
        for source_path in ("frontend", "../app", "/app", "app/../frontend", ""):
            with self.subTest(source_path=source_path):
                self.write_manifest(self.legacy, web_source_path=source_path)
                with self.assertRaises(ValueError):
                    WEB.source_path(self.legacy)

    def test_rejects_directory_without_frontend_package(self):
        (self.repository / "frontend" / "package.json").unlink()
        self.git("add", "--all")
        self.git("commit", "--quiet", "-m", "Incomplete fixture")
        with self.assertRaises(ValueError):
            WEB.source_path(self.git("rev-parse", "HEAD"))

    def test_preserves_historical_artifact_metadata(self):
        output = self.root / "historical-dist"
        output.mkdir(mode=0o700)
        (output / "index.html").write_text("historical artifact fixture")
        environment = {
            "GCP_ENVIRONMENT": "production", "GCP_PROJECT_ID": "parsero-test-project",
            "GCP_WEB_DIST_DIR": str(output),
            "VITE_API_URL": "https://api.longbeach.quebranunca.com.br",
        }
        with patch.dict(os.environ, environment, clear=True):
            directory, expected = WEB.inputs()
            metadata = WEB.artifact_metadata(directory, expected)
        self.assertEqual({
            "schema_version": 1, "source_commit": self.legacy,
            "environment": "production", "project_id": "parsero-test-project",
            "api_origin": "https://api.longbeach.quebranunca.com.br",
            "build_flags": {"demo_mode": False, "operational_storage": "postgres"},
            "source_tree": self.legacy_tree, "dist_sha256": WEB.tree_hash(output),
        }, metadata)

    def test_build_script_archives_both_layouts_without_using_checkout(self):
        scripts = self.repository / "deploy" / "google"
        scripts.mkdir(parents=True)
        for name in ("build-web.sh", "common.sh", "web_artifact.py"):
            shutil.copy2(SCRIPTS / name, scripts / name)
        tools = self.root / "tools"
        tools.mkdir()
        pnpm = tools / "pnpm"
        pnpm.write_text("""#!/usr/bin/env python3
from pathlib import Path
import sys
assert sys.argv[1] == '--dir'
source = Path(sys.argv[2])
assert (source / 'package.json').is_file()
assert (source / 'pnpm-lock.yaml').is_file()
if sys.argv[3] == 'build':
    (source / 'dist').mkdir()
    (source / 'dist' / 'index.html').write_text((source / 'fixture.txt').read_text())
""")
        pnpm.chmod(0o700)
        # Local edits must never substitute the pinned commit's archived source.
        (self.repository / "frontend" / "fixture.txt").write_text("uncommitted checkout change")
        for source in (self.legacy, self.current):
            with self.subTest(source=source):
                self.write_manifest(source)
                shutil.copy2(self.manifest, scripts / self.manifest.name)
                output = self.root / ("dist-" + source)
                environment = {
                    "PATH": str(tools) + os.pathsep + os.environ["PATH"],
                    "GCP_ENVIRONMENT": "production", "GCP_PROJECT_ID": "parsero-test-project",
                    "GCP_WEB_DIST_DIR": str(output),
                    "VITE_API_URL": "https://api.longbeach.quebranunca.com.br",
                }
                subprocess.run(["bash", str(scripts / "build-web.sh"), "--apply"],
                               env=environment, check=True, capture_output=True, text=True)
                self.assertEqual("archived frontend fixture", (output / "index.html").read_text())
                metadata = json.loads((output / WEB.METADATA).read_text())
                self.assertEqual(source, metadata["source_commit"])
                self.assertEqual(self.legacy_tree, metadata["source_tree"])
                self.assertEqual({"demo_mode": False, "operational_storage": "postgres"},
                                 metadata["build_flags"])


if __name__ == "__main__":
    unittest.main()
