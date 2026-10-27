#!/usr/bin/env python3
"""Host runner: explicit stanza bootstrap, daily full, and five-minute checks.

Runs ONLY in the pinned postgres container. It never restores, deletes a stanza,
starts services, changes IAM, fetches secrets, or removes WAL. pgBackRest owns
repository expiry after a successful full backup. Production is the GCS mode.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time

EXPECTED_ARCHIVE_COMMAND = "pgbackrest --stanza=longbeach archive-push %p"
PGDATA = "/var/lib/postgresql/18/docker"
CONFIG_DEST = "/etc/pgbackrest/pgbackrest.conf"
IMAGE_RE = re.compile(r"[a-zA-Z0-9./_:-]+@sha256:[a-f0-9]{64}")
REQUIRED_KEYS = {"schema_version", "compose_file", "env_file", "project_name",
                 "postgres_service", "postgres_image", "data_mount",
                 "pgbackrest_config", "config_sha256"}

# Metadata only, not application rows. The native check before this query proves
# a newly switched WAL has reached the repository even when the database is idle.
ARCHIVE_SQL = """BEGIN READ ONLY;
SELECT json_build_object(
 'server_version_num',current_setting('server_version_num')::integer,
 'data_directory',current_setting('data_directory'),
 'archive_mode',current_setting('archive_mode'),
 'archive_command',current_setting('archive_command'),
 'archive_timeout',current_setting('archive_timeout'),
 'in_recovery',pg_is_in_recovery(),
 'last_archived_epoch',extract(epoch from last_archived_time),
 'last_failed_epoch',extract(epoch from last_failed_time),
 'ready_wal_count',(SELECT count(*) FROM pg_ls_archive_statusdir() WHERE name LIKE '%.ready')
) FROM pg_stat_archiver;
ROLLBACK;"""


class GuardError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise GuardError(code)


def read_private(path, *, group_read=False):
    p = Path(path)
    require(p.is_absolute(), "absolute-path-required")
    s = p.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1, "unsafe-config-file")
    require(s.st_mode & (0o027 if group_read else 0o077) == 0, "unsafe-config-mode")
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as f:
        require(os.fstat(f.fileno()).st_ino == s.st_ino, "config-file-replaced")
        return f.read()


def load_manifest(path):
    m = json.loads(read_private(path))
    require(set(m) == REQUIRED_KEYS and m["schema_version"] == 1, "manifest-schema")
    require(m["postgres_service"] == "postgres" and m["project_name"] == "longbeach", "compose-scope")
    require(IMAGE_RE.fullmatch(m["postgres_image"]) is not None, "image-digest-required")
    require(m["data_mount"] == "/var/lib/longbeach", "data-mount-scope")
    require(m["pgbackrest_config"] == "/etc/longbeach/backup/pgbackrest.conf", "backup-config-scope")
    require(re.fullmatch(r"[a-f0-9]{64}", m["config_sha256"]) is not None, "config-hash-required")
    require(hashlib.sha256(read_private(m["pgbackrest_config"], group_read=True)).hexdigest()
            == m["config_sha256"], "config-hash-drift")
    read_private(m["env_file"])
    require(Path(m["compose_file"]).is_absolute(), "absolute-compose-path")
    require(os.path.ismount(m["data_mount"]), "data-disk-not-mounted")
    return m


def validate_container(d, m):
    require(d["State"]["Running"] is True, "postgres-not-running")
    require(d["Config"]["Image"] == m["postgres_image"], "postgres-image-drift")
    labels = d["Config"].get("Labels") or {}
    require(labels.get("com.docker.compose.project") == m["project_name"]
            and labels.get("com.docker.compose.service") == "postgres", "postgres-label-drift")
    require(not d["HostConfig"].get("Privileged") and not d["HostConfig"].get("PortBindings"),
            "postgres-public-port-or-privileged")
    require(d["HostConfig"].get("NetworkMode") not in ("host", "none"), "postgres-network-drift")
    mounts = {x["Destination"]: x for x in d["Mounts"]}
    require(mounts["/var/lib/postgresql"]["Source"] == m["data_mount"] + "/postgres"
            and mounts["/var/lib/postgresql"]["RW"] is True, "postgres-data-mount-drift")
    require(mounts[CONFIG_DEST]["Source"] == m["pgbackrest_config"]
            and mounts[CONFIG_DEST]["RW"] is False, "postgres-backup-config-mount-drift")
    return True


def repository_status(raw, now=None, started=None):
    now = time.time() if now is None else now
    rows = json.loads(raw)
    require(isinstance(rows, list) and len(rows) == 1 and rows[0]["name"] == "longbeach", "repository-stanza")
    row = rows[0]
    require(row["status"]["code"] == 0, "repository-status-error")
    full = [b for b in row.get("backup", []) if b.get("type") == "full" and not b.get("error", False)]
    require(bool(full), "no-successful-full-backup")
    require(all(isinstance(b.get("timestamp", {}).get("stop"), (int, float))
                and 0 < b["timestamp"]["stop"] <= now + 60 for b in full), "backup-timestamp-invalid")
    latest = max(full, key=lambda b: b["timestamp"]["stop"])
    require(now - latest["timestamp"]["stop"] <= 26 * 3600, "full-backup-older-than26h")
    if started is not None:
        require(latest["timestamp"]["stop"] >= started - 1, "full-backup-not-from-current-run")
    oldest = min(b["timestamp"]["stop"] for b in full)
    return {"latest_full_label": latest["label"], "latest_full_epoch": latest["timestamp"]["stop"],
            "latest_full_age_seconds": max(0, int(now - latest["timestamp"]["stop"])),
            "oldest_full_epoch": oldest,
            "history_age_seconds": max(0, int(now - oldest)),
            # This establishes age, not proof that every segment has been restored.
            "seven_days_history_accumulated": oldest <= now - 7 * 86400,
            "successful_full_count": len(full)}


def archive_status(raw, now=None):
    now = time.time() if now is None else now
    rows = [json.loads(x) for x in raw.splitlines() if x.strip()]
    require(len(rows) == 1, "archive-metadata-shape")
    r = rows[0]
    require(180000 <= r["server_version_num"] < 190000 and r["data_directory"] == PGDATA,
            "postgres-identity-drift")
    require(r["archive_mode"] == "on" and r["archive_command"] == EXPECTED_ARCHIVE_COMMAND
            and r["archive_timeout"] in ("1min", "60s") and r["in_recovery"] is False,
            "archive-settings-drift")
    archived = r["last_archived_epoch"]
    require(isinstance(archived, (float, int)) and -60 <= now - archived <= 300, "wal-archive-not-current")
    require(r["last_failed_epoch"] is None or r["last_failed_epoch"] <= archived, "wal-archive-failure-unresolved")
    require(isinstance(r["ready_wal_count"], int) and r["ready_wal_count"] <= 2, "wal-archive-backlog")
    return {"wal_probe_current": True, "ready_wal_count": r["ready_wal_count"],
            "last_archived_epoch": archived}


def save(path, value):
    data = (json.dumps(value, sort_keys=True) + "\n").encode()
    fd, tmp = tempfile.mkstemp(prefix=".backup-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


class Runner:
    def __init__(self, manifest):
        self.m = manifest
        self.cid = None

    def command(self, args, timeout=300):
        # Capture errors privately; stdout of a failed command never reaches journald.
        r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
        if r.returncode:
            raise GuardError("native-command-failed")
        return r.stdout.decode("utf-8")

    def connect(self):
        m = self.m
        ids = self.command(["docker", "compose", "--project-name", m["project_name"],
                            "--env-file", m["env_file"], "--file", m["compose_file"],
                            "ps", "--quiet", "postgres"]).split()
        require(len(ids) == 1 and re.fullmatch(r"[a-f0-9]{64}", ids[0]), "one-postgres-container-required")
        inspect = json.loads(self.command(["docker", "inspect", ids[0]]))
        require(len(inspect) == 1, "postgres-inspect-shape")
        validate_container(inspect[0], m)
        self.cid = ids[0]
        require(self.exec(["id", "-u"]).strip() == "999", "postgres-uid-drift")

    def exec(self, args, timeout=300):
        # Discard container environment so PGBACKREST_* cannot override reviewed config.
        # The timeout MUST run inside the container: killing only docker-exec can
        # otherwise leave a backup/check alive while the host flock is released.
        require(timeout >= 60, "native-timeout-too-short")
        return self.command(["docker", "exec", "--user", "999:999", self.cid,
                             "/usr/bin/env", "-i", "PATH=/usr/lib/postgresql/18/bin:/usr/bin:/bin",
                             "/usr/bin/timeout", "--signal=TERM", "--kill-after=10s",
                             str(timeout - 30) + "s", *args], timeout)

    def backrest(self, command, *, full=False):
        require(command in ("stanza-create", "check", "backup", "info"), "backup-command-scope")
        require(not full or command == "backup", "full-backup-command-required")
        args = ["pgbackrest", "--config=" + CONFIG_DEST,
                "--config-include-path=/etc/pgbackrest/empty", "--stanza=longbeach"]
        # stanza-create/check operate on every configured repository and reject
        # --repo in pgBackRest 2.59.3. This configuration has exactly one repo.
        if command in ("backup", "info"):
            args += ["--repo=1"]
        if command == "info":
            args += ["--output=json", "--log-level-console=off"]
        if full:
            args += ["--type=full"]
        return self.exec(args + [command], 21600 if full else 300)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", default="/etc/longbeach/backup-runner.json")
    p.add_argument("action", choices=("bootstrap", "full", "check"))
    a = p.parse_args()
    require(os.geteuid() == 0, "host-root-required")
    m = load_manifest(a.manifest)
    state_dir = Path(m["data_mount"]) / "backup-state"
    state_dir.mkdir(mode=0o700, exist_ok=True)
    require(not state_dir.is_symlink() and state_dir.stat().st_uid == 0, "unsafe-state-directory")
    os.chmod(state_dir, 0o700)
    # Serializes scheduled check/full/bootstrap. WAL archive-push uses pgBackRest's
    # separate native archive lock and MUST keep running during a full backup.
    fd = os.open("/run/lock/longbeach-backup.lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        started = time.time()
        result = {"action": a.action, "started_epoch": started, "ok": False}
        try:
            runner = Runner(m)
            runner.connect()
            if a.action == "bootstrap":
                runner.backrest("stanza-create")
            runner.backrest("check")
            if a.action in ("bootstrap", "full"):
                runner.backrest("backup", full=True)
            result.update(repository_status(runner.backrest("info"), started=started
                          if a.action in ("bootstrap", "full") else None))
            result.update(archive_status(runner.exec(["psql", "-XqAt", "--set=ON_ERROR_STOP=1",
                         "--username=postgres", "--dbname=postgres", "--command=" + ARCHIVE_SQL])))
            fs = os.statvfs(m["data_mount"])
            used = 1 - fs.f_bavail / max(fs.f_blocks, 1)
            result["data_disk_used_fraction"] = round(used, 4)
            require(used < 0.85, "data-disk-at-least85percent")
            result.update(ok=True, completed_epoch=time.time())
            save(state_dir / "last-success.json", result)
            if a.action in ("bootstrap", "full"):
                save(state_dir / "last-full-success.json", result)
        except Exception as e:
            # Native errors may include connection details: emit only a fixed class
            # or an allowlisted guard code. Existing success evidence is preserved.
            result.update(error=str(e) if isinstance(e, GuardError) else type(e).__name__,
                          completed_epoch=time.time())
            save(state_dir / "last-failure.json", result)
            print(json.dumps({"event": "LONGBEACH_BACKUP_FAILURE", **result}), flush=True)
            return 1
        print(json.dumps({"event": "LONGBEACH_BACKUP_SUCCESS", **result}), flush=True)
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({"event": "LONGBEACH_BACKUP_FAILURE", "ok": False,
                          "error": str(e) if isinstance(e, GuardError) else type(e).__name__}), flush=True)
        sys.exit(1)
