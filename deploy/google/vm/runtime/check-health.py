#!/usr/bin/env python3
"""Container health summary for journald; never inspect or print config/environment."""
import json
import subprocess
import sys

DOCKER = ["/usr/bin/docker", "--host", "unix:///var/run/docker.sock"]


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=20).stdout.strip()


def main():
    active = subprocess.run(["systemctl", "is-active", "--quiet", "longbeach-runtime.service"],
                            capture_output=True, timeout=5).returncode == 0
    if not active:
        print(json.dumps({"status": "skipped", "reason": "runtime_unit_inactive"}))
        return 0
    states = {}
    for service in ("postgres", "api", "caddy"):
        ids = run(DOCKER + ["ps", "--all", "--quiet", "--filter", "label=com.docker.compose.project=longbeach",
                   "--filter", "label=com.docker.compose.service=" + service]).splitlines()
        if len(ids) != 1:
            states[service] = "missing_or_duplicated"
            continue
        value = json.loads(run(DOCKER + ["inspect", "--format", "{{json .State}}", ids[0]]))
        # Health log Output is deliberately not emitted.
        states[service] = value.get("Health", {}).get("Status", "healthcheck_missing") if value.get("Running") else "stopped"
    healthy = all(value == "healthy" for value in states.values())
    print(json.dumps({"status": "healthy" if healthy else "attention", "services": states,
                      "recovery": "API/Caddy retry process failures at most 5 times, never daemon boot; inspect failures then recover via gated longbeach-runtime.service"}))
    return 0 if healthy else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError):
        print(json.dumps({"status": "attention", "reason": "health_inspection_failed"}), file=sys.stderr)
        sys.exit(1)
