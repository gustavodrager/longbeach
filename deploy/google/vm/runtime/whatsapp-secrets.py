#!/usr/bin/env python3
"""Refresh one numbered Secret Manager configuration, never logging its contents."""
import base64
import copy
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.request import HTTPRedirectHandler, Request, build_opener
import preflight

MANIFEST = Path("/etc/longbeach/whatsapp-bootstrap.json")
PROJECT = "parsero-prod-20261022"
APP_CONFIG = preflight.SECRET_ROOT / "appsettings.Production.json"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise preflight.Refused("whatsapp_secret_redirect_refused")


def checked_manifest(value):
    preflight.require(isinstance(value, dict) and set(value) == {"schemaVersion", "projectId", "secretId", "version", "messagingEnabled", "aiEnabled"}, "whatsapp_secret_manifest_invalid")
    preflight.require(value["schemaVersion"] == 1 and value["projectId"] == PROJECT, "whatsapp_secret_project_changed")
    preflight.require(isinstance(value["secretId"], str) and re.fullmatch(r"longbeach-whatsapp-[a-z0-9-]+", value["secretId"]) is not None
                      and re.fullmatch(r"[1-9][0-9]*", str(value["version"])) is not None, "whatsapp_secret_reference_invalid")
    preflight.require(type(value["messagingEnabled"]) is bool and value["aiEnabled"] is False, "whatsapp_secret_feature_flag_invalid")
    return value


def fetch_configuration(manifest):
    opener = build_opener(NoRedirect())
    request = Request("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", headers={"Metadata-Flavor": "Google"})
    with opener.open(request, timeout=15) as response:
        preflight.require(response.headers.get("Metadata-Flavor") == "Google", "metadata_identity_unproven")
        token = json.loads(response.read(65537))
    token = token.get("access_token")
    preflight.require(isinstance(token, str) and token and not any(c in token for c in "\r\n\x00"), "metadata_token_invalid")
    suffix = "/secrets/" + manifest["secretId"] + "/versions/" + str(manifest["version"])
    request = Request("https://secretmanager.googleapis.com/v1/projects/" + PROJECT + suffix + ":access", headers={"Authorization": "Bearer " + token})
    with opener.open(request, timeout=20) as response:
        body = response.read(131073)
    preflight.require(len(body) <= 131072, "whatsapp_secret_too_large")
    payload = json.loads(body)
    preflight.require(isinstance(payload, dict) and payload.get("name", "").endswith(suffix), "whatsapp_secret_version_changed")
    data = base64.b64decode(payload["payload"]["data"], validate=True)
    preflight.require(len(data) <= 65536, "whatsapp_configuration_too_large")
    return json.loads(data, object_pairs_hook=preflight.json_object)


def merged_application(application, bridge, manifest):
    result = copy.deepcopy(application)
    messaging = result.setdefault("Messaging", {})
    preflight.require(isinstance(messaging, dict), "messaging_configuration_not_object")
    messaging["Enabled"] = manifest["messagingEnabled"]
    messaging["BridgeUrl"] = "http://whatsapp-bridge:8091"
    messaging["BridgeSecret"] = bridge["secret"]
    ai = messaging.setdefault("Ai", {})
    preflight.require(isinstance(ai, dict), "messaging_ai_configuration_not_object")
    ai["Enabled"] = False
    return result


def atomic_json(path, value, gid):
    # Parent directory is provisioned by the existing secret bootstrap, never recreated here.
    preflight.require(path.parent == preflight.SECRET_ROOT and path.parent.is_dir() and not path.parent.is_symlink(), "whatsapp_secret_directory_invalid")
    if path.exists() or path.is_symlink():
        preflight.secure_file(path, gid, 0o640)
    descriptor, temporary = tempfile.mkstemp(prefix=".whatsapp-private-", dir=path.parent)
    try:
        os.fchown(descriptor, 0, gid)
        os.fchmod(descriptor, 0o640)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    preflight.require(os.geteuid() == 0, "root_required")
    preflight.secure_file(preflight.ENV_FILE, 0, 0o600)
    settings = preflight.read_environment(preflight.ENV_FILE)
    preflight.check_settings(settings)
    preflight.secure_file(APP_CONFIG, 1654, 0o640)
    application = json.loads(APP_CONFIG.read_text(), object_pairs_hook=preflight.json_object)
    preflight.check_application_config(application)
    if settings.get("WHATSAPP_ENABLED", "false") != "true":
        if isinstance(application.get("Messaging"), dict):
            application["Messaging"]["Enabled"] = False
            ai = application["Messaging"].get("Ai")
            if isinstance(ai, dict):
                ai["Enabled"] = False
            atomic_json(APP_CONFIG, application, 1654)
        print(json.dumps({"status": "whatsapp_disabled"}))
        return
    preflight.secure_file(MANIFEST, 0, 0o600)
    manifest = checked_manifest(json.loads(MANIFEST.read_text(), object_pairs_hook=preflight.json_object))
    bridge = fetch_configuration(manifest)
    preflight.require(isinstance(bridge, dict) and isinstance(bridge.get("secret"), str), "whatsapp_configuration_invalid")
    merged = merged_application(application, bridge, manifest)
    preflight.check_application_config(merged)
    preflight.check_whatsapp_config(settings, merged, bridge)
    atomic_json(preflight.BRIDGE_CONFIG, bridge, 65532)
    atomic_json(APP_CONFIG, merged, 1654)
    print(json.dumps({"status": "whatsapp_private_configuration_ready", "messaging_worker_enabled": manifest["messagingEnabled"], "ai_enabled": False}))


if __name__ == "__main__":
    try:
        main()
    except (preflight.Refused, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"status": "refused", "code": str(error) if isinstance(error, preflight.Refused) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
