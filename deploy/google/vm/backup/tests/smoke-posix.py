#!/usr/bin/env python3
"""Opt-in local Docker full + latest/PITR recovery, synthetic data only.

No cloud, SDK, network, host port, real env, credential, production volume or
directory is used. Labels/names/image IDs identify every resource for cleanup.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PGDATA = "/var/lib/postgresql/18/docker"
LABEL = "longbeach.backup-fixture"


def require(value, message):
    if not value:
        raise RuntimeError(message)


class Fixture:
    def __init__(self, image, out):
        self.image = image
        self.out = out
        self.run_id = "lb-backup-" + uuid.uuid4().hex[:12]
        self.image_id = None
        self.volumes = {}
        self.config = out / "pgbackrest.conf"

    def cmd(self, args, timeout=240, ok=True):
        r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=timeout, check=False)
        # Only synthetic fixture output; file-private, never print raw logs.
        with (self.out / "commands.private.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps({"argv": args, "code": r.returncode,
                                "stdout": r.stdout.decode(errors="replace"),
                                "stderr": r.stderr.decode(errors="replace")}) + "\n")
        os.chmod(self.out / "commands.private.jsonl", 0o600)
        if ok:
            require(r.returncode == 0, "synthetic command failed; inspect private fixture log")
        return r.stdout.decode().strip()

    def inspect_container(self, cid):
        values = json.loads(self.cmd(["docker", "inspect", cid]))
        require(len(values) == 1, "container inspect shape")
        d = values[0]
        require(d["Config"].get("Labels", {}).get(LABEL) == self.run_id, "container ownership")
        require(d["Image"] == self.image_id, "container image changed")
        require(d["Name"].lstrip("/").startswith(self.run_id + "-"), "container name scope")
        require(d["HostConfig"]["NetworkMode"] == "none", "fixture has network")
        require(not d["HostConfig"].get("PortBindings"), "fixture has host port")
        require(not d["HostConfig"].get("Privileged"), "fixture privileged")
        return d

    def create_volume(self, role):
        name = self.run_id + "-" + role
        self.cmd(["docker", "volume", "create", "--label", LABEL + "=" + self.run_id, name])
        self.volumes[role] = name
        volume = json.loads(self.cmd(["docker", "volume", "inspect", name]))[0]
        require(volume["Name"] == name and volume.get("Labels", {}).get(LABEL) == self.run_id,
                "refuse to initialize volume outside this fixture")
        # This helper can change ownership only in its own freshly created volume.
        args = ["docker", "run", "--rm", "--pull=never", "--platform=linux/amd64",
                "--name", self.run_id + "-init-" + role, "--label", LABEL + "=" + self.run_id,
                "--network=none", "--read-only", "--user=0:0", "--cap-drop=ALL",
                "--cap-add=CHOWN", "--cap-add=FOWNER", "--security-opt=no-new-privileges:true",
                "--mount", "type=volume,src=" + name + ",dst=/initialize", "--entrypoint=/bin/sh",
                self.image, "-ec", "chown 999:999 /initialize; chmod 0700 /initialize"]
        self.cmd(args)

    def base(self, name, volume, repo_readonly=False):
        return ["docker", "run", "--pull=never", "--platform=linux/amd64", "--name", self.run_id + "-" + name,
                "--label", LABEL + "=" + self.run_id, "--network=none", "--read-only", "--user=999:999",
                "--memory=1536m", "--cpus=1", "--pids-limit=128", "--cap-drop=ALL",
                "--security-opt=no-new-privileges:true", "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m,mode=1777",
                "--tmpfs", "/var/run/postgresql:rw,nosuid,nodev,size=16m,uid=999,gid=999,mode=3775",
                "--tmpfs", "/var/run/pgbackrest:rw,nosuid,nodev,size=8m,uid=999,gid=999",
                "--tmpfs", "/var/spool/pgbackrest:rw,nosuid,nodev,size=16m,uid=999,gid=999",
                "--tmpfs", "/var/log/pgbackrest:rw,nosuid,nodev,size=16m,uid=999,gid=999",
                "--mount", "type=volume,src=" + self.volumes[volume] + ",dst=/var/lib/postgresql",
                "--mount", "type=volume,src=" + self.volumes["repo"] + ",dst=/repo" + (",readonly" if repo_readonly else ""),
                "--mount", "type=bind,src=" + str(self.config) + ",dst=/etc/pgbackrest/pgbackrest.conf,readonly"]

    def start(self, name, volume, restore=False):
        args = self.base(name, volume, repo_readonly=restore)
        args += ["-d", "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_DB=postgres",
                 "-e", "POSTGRES_PASSWORD=synthetic-fixture-only", "-e", "POSTGRES_INITDB_ARGS=--data-checksums --auth-host=scram-sha-256 --auth-local=peer",
                 self.image, "postgres", "-c", "listen_addresses=", "-c", "shared_buffers=64MB",
                 "-c", "max_connections=20", "-c", "wal_level=replica", "-c", "archive_timeout=60s",
                 "-c", "archive_mode=" + ("off" if restore else "on"),
                 "-c", "archive_command=pgbackrest --stanza=longbeach archive-push %p"]
        cid = self.cmd(args)
        require(re.fullmatch(r"[a-f0-9]{64}", cid), "container id")
        self.inspect_container(cid)
        until = time.monotonic() + 150
        while time.monotonic() < until:
            ready = self.cmd(["docker", "exec", "--user=999:999", cid, "pg_isready", "-U", "postgres", "-d", "postgres"], ok=False)
            if "accepting connections" in ready:
                return cid
            time.sleep(0.5)
        raise RuntimeError("fixture PostgreSQL readiness timeout")

    def sql(self, cid, text):
        self.inspect_container(cid)
        return self.cmd(["docker", "exec", "--user=999:999", cid, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1",
                         "-U", "postgres", "-d", "postgres", "-c", text])

    def backrest(self, cid, *args):
        self.inspect_container(cid)
        return self.cmd(["docker", "exec", "--user=999:999", cid, "pgbackrest", "--stanza=longbeach", *args])

    def restore(self, name, volume, target=None):
        args = self.base(name, volume, repo_readonly=True)
        args += ["--entrypoint=pgbackrest", self.image, "--stanza=longbeach", "--archive-mode=off"]
        if target:
            args += ["--type=time", "--target=" + target, "--target-action=promote"]
        args += ["restore"]
        self.cmd(args)
        self.inspect_container(self.run_id + "-" + name)

    def cleanup(self):
        containers = self.cmd(["docker", "ps", "-aq", "--filter", "label=" + LABEL + "=" + self.run_id]).split()
        for cid in containers:
            self.inspect_container(cid)
            self.cmd(["docker", "rm", "-f", cid])
        for name in self.volumes.values():
            d = json.loads(self.cmd(["docker", "volume", "inspect", name]))[0]
            require(d["Name"] == name and d.get("Labels", {}).get(LABEL) == self.run_id,
                    "volume ownership mismatch; preserved")
            self.cmd(["docker", "volume", "rm", name])
        require(not self.cmd(["docker", "ps", "-aq", "--filter", "label=" + LABEL + "=" + self.run_id]), "container cleanup incomplete")
        require(not self.cmd(["docker", "volume", "ls", "-q", "--filter", "label=" + LABEL + "=" + self.run_id]), "volume cleanup incomplete")

    def run(self):
        inspected = json.loads(self.cmd(["docker", "image", "inspect", self.image]))
        require(len(inspected) == 1 and inspected[0]["Architecture"] == "amd64", "reviewed amd64 image required")
        self.image_id = inspected[0]["Id"]
        spec = importlib.util.spec_from_file_location("render_config", ROOT / "render-config.py")
        cfg = importlib.util.module_from_spec(spec); spec.loader.exec_module(cfg)
        self.config.write_text(cfg.render(posix_path="/repo"))
        self.config.chmod(0o444)  # No secrets; directory containing it is private0700.
        result = {"fixture_id": self.run_id, "cloud_accessed": False, "network": "none", "host_ports": False,
                  "image": self.image, "image_id": self.image_id, "config_sha256": hashlib.sha256(self.config.read_bytes()).hexdigest(),
                  "passed": False, "cleanup_complete": False}
        try:
            for role in ("source", "repo", "latest", "pitr"):
                self.create_volume(role)
            source = self.start("source", "source")
            require(self.cmd(["docker", "exec", "--user=999:999", source, "id", "-u"]) == "999", "UID")
            require(self.cmd(["docker", "exec", "--user=999:999", source, "pgbackrest", "version"])
                    == "pgBackRest 2.59.3", "version")
            identity = self.sql(source, "SELECT (pg_control_system()).system_identifier::text")
            self.sql(source, "CREATE TABLE fixture_sentinel(id integer PRIMARY KEY, marker text NOT NULL); INSERT INTO fixture_sentinel VALUES(1,'seed');")
            self.backrest(source, "stanza-create")
            self.backrest(source, "check")
            self.backrest(source, "--type=full", "backup")
            repository = json.loads(self.backrest(source, "--output=json", "--log-level-console=off", "info"))
            require(repository[0]["status"]["code"] == 0 and repository[0]["backup"][-1]["type"] == "full", "full backup metadata")
            self.sql(source, "INSERT INTO fixture_sentinel VALUES(2,'before_target');")
            target = self.sql(source, "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US') || '+00';")
            require(re.fullmatch(r"[0-9-]{10} [0-9:.]{15}\+00", target), "target format")
            self.sql(source, "SELECT pg_sleep(0.1); INSERT INTO fixture_sentinel VALUES(3,'after_target'); SELECT pg_switch_wal();")
            self.backrest(source, "check")
            monitor_spec = importlib.util.spec_from_file_location("backup_monitor", ROOT / "run.py")
            monitor = importlib.util.module_from_spec(monitor_spec); monitor_spec.loader.exec_module(monitor)
            monitor.repository_status(self.backrest(source, "--output=json", "--log-level-console=off", "info"))
            monitor.archive_status(self.sql(source, monitor.ARCHIVE_SQL))
            source_before = self.sql(source, "SELECT json_agg(id ORDER BY id) FROM fixture_sentinel")
            require(json.loads(source_before) == [1, 2, 3], "source fixture incomplete")
            self.restore("restore-latest", "latest")
            latest = self.start("latest", "latest", restore=True)
            require(json.loads(self.sql(latest, "SELECT json_agg(id ORDER BY id) FROM fixture_sentinel")) == [1, 2, 3], "latest restore lost post-backup WAL")
            self.restore("restore-pitr", "pitr", target=target)
            pitr = self.start("pitr", "pitr", restore=True)
            require(self.sql(pitr, "SELECT pg_is_in_recovery()") == "f", "PITR not promoted")
            require(json.loads(self.sql(pitr, "SELECT json_agg(id ORDER BY id) FROM fixture_sentinel")) == [1, 2], "PITR target sentinel mismatch")
            for cid in (latest, pitr):
                require(self.sql(cid, "SELECT (pg_control_system()).system_identifier::text") == identity, "restored cluster identity")
            require(self.sql(source, "SELECT json_agg(id ORDER BY id) FROM fixture_sentinel") == source_before,
                    "restore modified original source fixture")
            result.update(passed=True, target_utc=target, native_full=True, continuous_wal=True,
                          latest_restored_ids=[1, 2, 3], pitr_restored_ids=[1, 2], original_preserved=True,
                          separate_restore_volumes=True, postgresql_user_uid=999)
        except Exception as e:
            result["failure"] = str(e)
        finally:
            try:
                self.cleanup()
                result["cleanup_complete"] = True
            except Exception as e:
                result["cleanup_failure"] = str(e)
            data = (json.dumps(result, indent=2, sort_keys=True) + "\n").encode()
            (self.out / "result.json").write_bytes(data)
            (self.out / "result.json").chmod(0o600)
            print(json.dumps({"passed": result["passed"], "cleanup_complete": result["cleanup_complete"],
                              "result": str(self.out / "result.json"), "sha256": hashlib.sha256(data).hexdigest()}), flush=True)
        return 0 if result["passed"] and result["cleanup_complete"] else 1


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--image", required=True, help="reviewed local amd64 image or digest; never pulled")
    p.add_argument("--execute", action="store_true")
    a = p.parse_args()
    if not a.execute:
        print(json.dumps({"prepared_only": True, "cloud_accessed": False, "docker_executed": False}))
        return 0
    require(re.fullmatch(r"[a-zA-Z0-9./_:@-]+", a.image), "image reference")
    directory = ROOT / "tests" / ".runs" / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:6])
    directory.mkdir(parents=True, mode=0o700)
    return Fixture(a.image, directory).run()


if __name__ == "__main__":
    sys.exit(main())
