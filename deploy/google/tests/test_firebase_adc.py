"""Firebase identity/authentication guards with fake SDK and HTTP; no network."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("firebase_adc", SCRIPTS / "verify_firebase_adc.py")
ADC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ADC)
ACCOUNT = "parserotech@gmail.com"
TOKEN = "synthetic-access-token"


class FirebaseAdcIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="longbeach-adc-identity-")
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "adc.json"
        self.path.write_text(json.dumps({"type": "authorized_user"}))
        self.path.chmod(0o600)
        self.env = patch.dict(os.environ, GOOGLE_APPLICATION_CREDENTIALS=str(self.path))
        self.env.start()
        self.addCleanup(self.env.stop)
        self.sdk = patch.object(ADC.subprocess, "run", return_value=SimpleNamespace(stdout=TOKEN + "\n"))
        self.sdk_mock = self.sdk.start()
        self.addCleanup(self.sdk.stop)
        self.response = SimpleNamespace(status=200, read=lambda size: json.dumps(self.identity).encode())
        self.identity = {"email": ACCOUNT, "email_verified": True}
        self.connection = unittest.mock.Mock()
        self.connection.getresponse.return_value = self.response
        self.http = patch.object(ADC.http.client, "HTTPSConnection", return_value=self.connection)
        self.http_mock = self.http.start()
        self.addCleanup(self.http.stop)

    def test_verified_user_token_stays_in_header_only(self):
        ADC.verify(ACCOUNT)
        self.http_mock.assert_called_once_with("openidconnect.googleapis.com", timeout=15)
        self.connection.request.assert_called_once_with(
            "GET", "/v1/userinfo", headers={"Authorization": "Bearer " + TOKEN})
        arguments, options = self.sdk_mock.call_args
        self.assertNotIn(TOKEN, " ".join(arguments[0]))
        self.assertTrue(options["capture_output"])
        self.assertNotIn("--account", arguments[0])
        self.connection.close.assert_called_once()

    def test_different_principal_is_rejected_without_disclosing_it(self):
        self.identity["email"] = "other@example.invalid"
        with self.assertRaises(ADC.AdcVerificationError) as error:
            ADC.verify(ACCOUNT)
        self.assertNotIn(self.identity["email"], str(error.exception))

    def test_unverified_email_is_rejected(self):
        self.identity["email_verified"] = False
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)

    def test_missing_identity_is_rejected(self):
        self.identity = {}
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)

    def test_http_redirect_is_not_followed(self):
        self.response.status = 302
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)
        self.connection.request.assert_called_once()

    def test_oversized_response_is_rejected(self):
        self.response.read = lambda size: b"x" * size
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)

    def test_sdk_failure_does_not_disclose_its_output(self):
        self.sdk_mock.side_effect = subprocess.CalledProcessError(1, ["gcloud"], output=TOKEN, stderr=TOKEN)
        with self.assertRaises(ADC.AdcVerificationError) as error:
            ADC.verify(ACCOUNT)
        self.assertNotIn(TOKEN, str(error.exception))
        self.http_mock.assert_not_called()

    def test_empty_token_is_rejected(self):
        self.sdk_mock.return_value.stdout = "\n"
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)
        self.http_mock.assert_not_called()

    def test_non_user_credential_is_rejected_before_sdk(self):
        self.path.write_text(json.dumps({"type": "service_account"}))
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)
        self.sdk_mock.assert_not_called()

    def test_shared_credential_file_is_rejected_before_sdk(self):
        self.path.chmod(0o644)
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)
        self.sdk_mock.assert_not_called()

    def test_symlink_is_rejected_before_sdk(self):
        link = self.path.with_name("linked-adc.json")
        link.symlink_to(self.path)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(link)
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)
        self.sdk_mock.assert_not_called()

    def test_missing_credential_is_rejected_before_sdk(self):
        os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS")
        with self.assertRaises(ADC.AdcVerificationError):
            ADC.verify(ACCOUNT)
        self.sdk_mock.assert_not_called()


class FirebaseShellAuthTests(unittest.TestCase):
    """Isolate shell auth selection; provenance and identity have separate tests."""

    def run_script(self, mode=None, allow_identity=True, token="", apply=True):
        with tempfile.TemporaryDirectory(prefix="longbeach-firebase-shell-") as temporary:
            directory = Path(temporary)
            scripts = directory / "scripts"
            scripts.mkdir()
            for filename in ("deploy-web.sh", "common.sh", "firebase.json"):
                shutil.copyfile(SCRIPTS / filename, scripts / filename)
            (scripts / "web_artifact.py").write_text("# Provenance is tested independently.\n")
            (scripts / "verify_firebase_adc.py").write_text(
                "import os, pathlib, sys\n"
                "pathlib.Path(os.environ['FAKE_IDENTITY_CHECKED']).touch()\n"
                "sys.exit(0 if os.environ['FAKE_IDENTITY_ALLOWED'] == '1' else 1)\n")
            executable = directory / "firebase"
            executable.write_text(
                "#!/usr/bin/env python3\nimport json, os, pathlib, stat, sys\n"
                "xdg = os.environ.get('XDG_CONFIG_HOME', '')\n"
                "pathlib.Path(os.environ['FAKE_FIREBASE_CALLED']).write_text(json.dumps({\n"
                " 'args':sys.argv[1:], 'xdg':xdg, 'quota':os.environ.get('GOOGLE_CLOUD_QUOTA_PROJECT'),\n"
                " 'mode':stat.S_IMODE(os.stat(xdg).st_mode) if xdg and os.path.isdir(xdg) else None}))\n")
            executable.chmod(0o700)
            gcloud = directory / "gcloud"
            gcloud.write_text("#!/bin/sh\nexit 1\n")
            gcloud.chmod(0o700)
            marker = directory / "firebase-called.json"
            checked = directory / "identity-checked"
            environment = dict(os.environ, PATH=str(directory) + os.pathsep + os.environ["PATH"],
                               TMPDIR=str(directory), GCP_ENVIRONMENT="production",
                               GCP_PROJECT_ID="parsero-test-project", GCP_FIREBASE_SITE_ID="parsero-test-site",
                               GCP_WEB_DIST_DIR=str(directory / "dist"), VITE_API_URL="https://example.invalid",
                               FAKE_FIREBASE_CALLED=str(marker), FAKE_IDENTITY_CHECKED=str(checked),
                               FAKE_IDENTITY_ALLOWED="1" if allow_identity else "0", FIREBASE_TOKEN=token,
                               XDG_CONFIG_HOME=str(directory / "existing-cli-config"))
            environment.pop("GCP_FIREBASE_AUTH_MODE", None)
            if mode is not None:
                environment["GCP_FIREBASE_AUTH_MODE"] = mode
            result = subprocess.run(["bash", str(scripts / "deploy-web.sh")] + (["--apply"] if apply else []),
                                    env=environment, capture_output=True, text=True, timeout=10)
            called = json.loads(marker.read_text()) if marker.exists() else None
            return result, called, checked.exists()

    def test_default_keeps_explicit_firebase_account(self):
        result, called, checked = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        account_index = called["args"].index("--account")
        self.assertEqual(called["args"][account_index + 1], ACCOUNT)
        self.assertFalse(checked)

    def test_adc_verifies_identity_and_isolates_cli_without_account(self):
        result, called, checked = self.run_script("adc")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(checked)
        self.assertNotIn("--account", called["args"])
        self.assertTrue(called["xdg"].endswith("/adc-config"))
        self.assertEqual(called["mode"], 0o700)
        self.assertEqual(called["quota"], "parsero-test-project")

    def test_unconfirmed_adc_never_calls_firebase(self):
        result, called, checked = self.run_script("adc", allow_identity=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(checked)
        self.assertIsNone(called)

    def test_conflicting_token_never_calls_identity_or_firebase(self):
        result, called, checked = self.run_script("adc", token="synthetic-conflicting-token")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(checked)
        self.assertIsNone(called)
        self.assertNotIn("synthetic-conflicting-token", result.stdout + result.stderr)

    def test_invalid_mode_never_calls_firebase(self):
        result, called, checked = self.run_script("unknown")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(checked)
        self.assertIsNone(called)

    def test_dry_run_does_not_query_identity_or_firebase(self):
        result, called, checked = self.run_script("adc", apply=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(checked)
        self.assertIsNone(called)


if __name__ == "__main__":
    unittest.main()
