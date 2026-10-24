"""Exercise the shell gate with a fake SDK; never use cloud credentials/network."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "run-migrations.sh"
DIGEST = "southamerica-east1-docker.pkg.dev/parsero-test-project/longbeach/api@sha256:" + "a" * 64
FAKE_GCLOUD = """#!/usr/bin/env python3
import os, sys
args = sys.argv[1:]
if args[:2] == ['auth', 'list']:
    print('parserotech@gmail.com')
elif args[:3] == ['run', 'jobs', 'describe']:
    print(os.environ['FAKE_IMAGE'])
elif args[:4] == ['run', 'jobs', 'executions', 'list']:
    if os.environ.get('FAKE_LIST_FAILURE') == '1':
        sys.exit(1)
    print(os.environ['FAKE_EXECUTIONS'])
elif args[:3] == ['run', 'jobs', 'execute']:
    with open(os.environ['FAKE_EXECUTED'], 'w') as file:
        file.write('executed')
else:
    raise SystemExit('Unexpected SDK command')
"""


class MigrationGuardTests(unittest.TestCase):
    def run_gate(self, executions, expected, image=DIGEST, list_failure=False):
        with tempfile.TemporaryDirectory(prefix="longbeach-migration-test-") as temporary:
            directory = Path(temporary)
            fake = directory / "gcloud"
            fake.write_text(FAKE_GCLOUD)
            fake.chmod(0o700)
            marker = directory / "executed"
            environment = dict(os.environ, PATH=str(directory) + os.pathsep + os.environ["PATH"],
                               GCP_ENVIRONMENT="staging", GCP_PROJECT_ID="parsero-test-project",
                               GCP_MIGRATION_JOB="longbeach-migrations", API_IMAGE_DIGEST=DIGEST,
                               FAKE_IMAGE=image, FAKE_EXECUTIONS=json.dumps(executions),
                               FAKE_EXECUTED=str(marker), FAKE_LIST_FAILURE="1" if list_failure else "0")
            result = subprocess.run(["bash", str(SCRIPT), "--apply"], env=environment,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(marker.exists(), expected, result.stdout + result.stderr)
            self.assertEqual(result.returncode == 0, expected, result.stdout + result.stderr)

    def test_first_execution(self):
        self.run_gate([], True)

    def test_completed_timestamp_v1(self):
        self.run_gate([{"status": {"completionTime": "2026-10-22T12:00:00Z"}}], True)

    def test_completed_condition_v1(self):
        self.run_gate([{"status": {"conditions": [{"type": "Completed", "status": "True"}]}}], True)

    def test_completed_timestamp_v2(self):
        self.run_gate([{"completionTime": "2026-10-22T12:00:00Z"}], True)

    def test_active_unknown_condition(self):
        self.run_gate([{"status": {"conditions": [{"type": "Completed", "status": "Unknown"}]}}], False)

    def test_false_without_completion_is_not_proof(self):
        self.run_gate([{"status": {"conditions": [{"type": "Completed", "status": "False"}]}}], False)

    def test_active_execution_anywhere_in_list(self):
        self.run_gate([{"status": {"completionTime": "2026-10-22T12:00:00Z"}}, {"status": {}}], False)

    def test_unexpected_payload(self):
        self.run_gate({"error": "not a list"}, False)

    def test_invalid_completion_type(self):
        self.run_gate([{"status": {"completionTime": {"unexpected": True}}}], False)

    def test_failed_query_never_executes(self):
        self.run_gate([], False, list_failure=True)

    def test_different_job_image_never_executes(self):
        self.run_gate([], False, image=DIGEST.replace("a" * 64, "b" * 64))


if __name__ == "__main__":
    unittest.main()
