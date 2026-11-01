#!/usr/bin/env python3
"""Canonical Compose commands; systemd owns the host and schema admission gates."""
import json
import os
import subprocess
import sys
import preflight


def command(action, settings):
    if action == "postgres":
        return preflight.DOCKER + preflight.compose_command(settings, with_whatsapp=False) + ["up", "-d", "--wait", "--wait-timeout", "180", "--no-build", "--pull", "never", "--no-deps", "postgres"]
    if action == "start":
        return preflight.DOCKER + preflight.compose_command(settings) + ["up", "-d", "--wait", "--wait-timeout", "240", "--no-build", "--pull", "never"]
    if action == "stop":
        return preflight.DOCKER + ["stop", "--time", "90"]
    raise preflight.Refused("unknown_runtime_action")


def selected_containers(rows, services):
    selected = []
    seen = set()
    for row in rows.splitlines():
        identity, _, service = row.partition(" ")
        if service in services:
            preflight.require(service not in seen and len(identity) in (12, 64) and all(c in "0123456789abcdef" for c in identity), "ambiguous_runtime_container")
            seen.add(service)
            selected.append(identity)
    return selected


def main():
    preflight.require(os.geteuid() == 0, "root_required")
    action = sys.argv[1] if len(sys.argv) == 2 else ""
    settings = {}
    if action != "stop":
        preflight.secure_file(preflight.ENV_FILE, 0, 0o600)
        settings = preflight.read_environment(preflight.ENV_FILE)
        preflight.check_settings(settings)
    args = command(action, settings)
    env = {"PATH": "/usr/bin:/bin", "HOME": "/root", "LANG": "C"}
    if action == "stop" or action == "start" and settings.get("WHATSAPP_ENABLED", "false") != "true":
        result = subprocess.run(preflight.DOCKER + ["ps", "--quiet", "--filter", "label=com.docker.compose.project=longbeach", "--format", '{{.ID}} {{.Label "com.docker.compose.service"}}'], check=True, capture_output=True, text=True, timeout=20, env=env)
        selected = selected_containers(result.stdout, {"api", "caddy", "postgres", "whatsapp-bridge"} if action == "stop" else {"whatsapp-bridge"})
        if action == "stop":
            if not selected:
                return
            args += selected
        elif selected:
            stopped = subprocess.run(preflight.DOCKER + ["stop", "--time", "90"] + selected, capture_output=True, timeout=120, env=env)
            preflight.require(stopped.returncode == 0, "disabled_whatsapp_stop_failed")
    result = subprocess.run(args, timeout=300, env=env, capture_output=True)
    preflight.require(result.returncode == 0, "runtime_compose_failed")
    print(json.dumps({"status": "completed", "action": action, "whatsapp_enabled": settings.get("WHATSAPP_ENABLED", "false") == "true"}))


if __name__ == "__main__":
    try:
        main()
    except (preflight.Refused, OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"status": "refused", "code": str(error) if isinstance(error, preflight.Refused) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
