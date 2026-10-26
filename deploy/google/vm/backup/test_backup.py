"""Offline safety/monitoring tests. Real backup/PITR uses a separate Docker fixture."""
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


r = load("backup_runner", "run.py")
c = load("backup_config", "render-config.py")


def info(stops=(999900,), status=0):
    return json.dumps([{"name": "longbeach", "status": {"code": status}, "backup": [
        {"type": "full", "label": "fixture" + str(stop), "error": False,
         "timestamp": {"start": stop - 10, "stop": stop}} for stop in stops]}])


def archive(**kwargs):
    row = {"server_version_num": 180006, "data_directory": r.PGDATA,
           "archive_mode": "on", "archive_command": r.EXPECTED_ARCHIVE_COMMAND,
           "archive_timeout": "1min", "in_recovery": False,
           "last_archived_epoch": 999990, "last_failed_epoch": None, "ready_wal_count": 0}
    row.update(kwargs)
    return json.dumps(row)


class BackupTests(unittest.TestCase):
    def test_repository_option_only_for_commands_that_accept_it(self):
        runner = r.Runner({})
        observed = []
        runner.exec = lambda args, timeout: observed.append(args) or ""
        for command in ("stanza-create", "check", "backup", "info"):
            runner.backrest(command, full=command == "backup")
        self.assertEqual(["--repo=1" in args for args in observed], [False, False, True, True])
        for command, full in (("restore", False), ("expire", False), ("check", True)):
            with self.subTest(command=command), self.assertRaises(r.GuardError):
                runner.backrest(command, full=full)

    def test_config_keyless_and_retains_wal_by_time(self):
        text = c.render(bucket="longbeach-test-bucket", prefix="pgbackrest/longbeach/")
        self.assertIn("repo1-gcs-key-type=auto", text)
        self.assertNotIn("repo1-gcs-key=", text)
        self.assertIn("repo1-retention-full-type=time", text)
        self.assertIn("repo1-retention-full=8", text)
        self.assertNotIn("repo1-retention-archive=", text)
        self.assertIn("archive-async=n", text)

    def test_local_fixture_does_not_use_cloud(self):
        text = c.render(posix_path="/repo")
        self.assertIn("repo1-type=posix", text)
        self.assertNotIn("gcs-key", text)

    def test_reject_config_injection(self):
        for kwargs in ({"bucket": "x\nrepo1-path=/other"},
                       {"bucket": "valid-bucket", "prefix": "../other"},
                       {"posix_path": "/repo/../prod"},
                       {"bucket": "valid-bucket", "posix_path": "/repo"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                c.render(**kwargs)

    def test_new_history_is_warmup_not_seven_day_success(self):
        result = r.repository_status(info(), now=1000000)
        self.assertFalse(result["seven_days_history_accumulated"])

    def test_old_and_fresh_full_make_seven_day_age_visible(self):
        result = r.repository_status(info((300000, 999900)), now=1000000)
        self.assertTrue(result["seven_days_history_accumulated"])
        self.assertEqual(result["latest_full_age_seconds"], 100)

    def test_reject_stale_failed_empty_future_and_wrong_stanza(self):
        wrong = json.loads(info()); wrong[0]["name"] = "other"
        failed = json.loads(info()); failed[0]["backup"][0]["error"] = True
        for raw in (info((800000,)), info(status=2), info(()), info((1001000,)),
                    json.dumps(wrong), json.dumps(failed)):
            with self.subTest(raw=raw), self.assertRaises(r.GuardError):
                r.repository_status(raw, now=1000000)

    def test_full_command_must_produce_a_new_completed_backup(self):
        with self.assertRaises(r.GuardError):
            r.repository_status(info(), now=1000000, started=999950)

    def test_wal_probe_good(self):
        self.assertTrue(r.archive_status(archive(), now=1000000)["wal_probe_current"])

    def test_reject_wal_stale_unresolved_failure_backlog_or_wrong_pgdata(self):
        for changes in ({"last_archived_epoch": 999000}, {"last_failed_epoch": 999995},
                        {"ready_wal_count": 4}, {"archive_mode": "off"},
                        {"archive_command": "true"}, {"data_directory": "/other"},
                        {"in_recovery": True}, {"server_version_num": 170008}):
            with self.subTest(changes=changes), self.assertRaises(r.GuardError):
                r.archive_status(archive(**changes), now=1000000)

    def test_container_guard_rejects_any_published_port(self):
        m = {"postgres_image": "fixture@sha256:" + "a" * 64, "project_name": "longbeach",
             "data_mount": "/var/lib/longbeach", "pgbackrest_config": "/etc/longbeach/backup/pgbackrest.conf"}
        d = {"State": {"Running": True}, "Config": {"Image": m["postgres_image"],
             "Labels": {"com.docker.compose.project": "longbeach", "com.docker.compose.service": "postgres"}},
             "HostConfig": {"Privileged": False, "PortBindings": {}, "NetworkMode": "longbeach_backend"},
             "Mounts": [{"Destination": "/var/lib/postgresql", "Source": "/var/lib/longbeach/postgres", "RW": True},
                        {"Destination": r.CONFIG_DEST, "Source": m["pgbackrest_config"], "RW": False}]}
        self.assertTrue(r.validate_container(d, m))
        d["HostConfig"]["PortBindings"] = {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5432"}]}
        with self.assertRaises(r.GuardError):
            r.validate_container(d, m)

    def test_native_timeout_precedes_host_timeout_and_clears_environment(self):
        runner = r.Runner({}); runner.cid = "a" * 64
        observed = []
        runner.command = lambda args, timeout: observed.append((args, timeout)) or ""
        runner.exec(["pgbackrest", "check"], timeout=300)
        args, timeout = observed[0]
        self.assertEqual(timeout, 300)
        self.assertIn("-i", args)
        self.assertEqual(args[-6:], ["/usr/bin/timeout", "--signal=TERM", "--kill-after=10s", "270s", "pgbackrest", "check"])
        self.assertIn("999:999", args)


if __name__ == "__main__":
    unittest.main()
