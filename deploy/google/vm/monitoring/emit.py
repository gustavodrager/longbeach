#!/usr/bin/env python3
"""One operational gauge from the host; stdlib only. Default is describe-only."""
import argparse
from datetime import datetime, timezone
import http.client
import json
import math
import os
from pathlib import Path
import socket
import ssl
import stat
import sys
import time
import urllib.request

PROJECT = 'parsero-prod-20261022'
INSTANCE = 'longbeach-economy'
ACCOUNT = 'longbeach-economy-vm@' + PROJECT + '.iam.gserviceaccount.com'
HOST = 'api.longbeach.quebranunca.com.br'
DATA = Path('/var/lib/longbeach')
STATE = DATA / 'backup-state'
METRIC = 'custom.googleapis.com/longbeach/vm/operational_ok'
ENDPOINT = 'https://monitoring.googleapis.com/v3/projects/' + PROJECT + '/timeSeries'
METADATA = 'http://169.254.169.254/computeMetadata/v1/'


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def read_state(path, *, optional=False):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        if optional: return None
        raise
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not (stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 65536):
            raise ValueError('unsafe_backup_state')
        raw = stream.read(65537)
        if len(raw) > 65536: raise ValueError('backup_state_too_large')
    return json.loads(raw)


def backup_checks(success, failure, now):
    end = success.get('completed_epoch')
    full = success.get('latest_full_epoch')
    fail = failure.get('completed_epoch') if failure else None
    return {
        'backup_check_current': success.get('ok') is True and number(end) and -60 <= now-end <= 600,
        'full_backup_current': number(full) and -60 <= now-full <= 26*3600,
        'WAL_last_check_ok': success.get('wal_probe_current') is True and
                             type(success.get('ready_wal_count')) is int and 0 <= success['ready_wal_count'] <= 2,
        'no_newer_backup_failure': failure is None or (number(fail) and number(end) and fail <= end),
    }


def api_ready():
    class LocalTLS(http.client.HTTPSConnection):
        def connect(self):
            raw = socket.create_connection(('127.0.0.1', 443), timeout=4)
            self.sock = self._context.wrap_socket(raw, server_hostname=HOST)
    connection = LocalTLS(HOST, 443, timeout=4, context=ssl.create_default_context())
    try:
        connection.request('GET', '/health/ready', headers={'Host': HOST, 'Accept': 'application/json'})
        response = connection.getresponse()
        body = response.read(8193)  # Discard; never retain/log application content.
        return response.status == 200 and len(body) <= 8192
    finally:
        connection.close()


def collect(now=None):
    now = time.time() if now is None else now
    checks = {}
    try:
        checks['data_disk_mounted'] = DATA.is_mount() and not DATA.is_symlink()
        info = STATE.lstat()
        checks['backup_state_private'] = stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700
        fs = os.statvfs(DATA)
        checks['data_disk_below_85_percent'] = fs.f_blocks > 0 and 0 <= 1-fs.f_bavail/fs.f_blocks < 0.85
        boot = os.statvfs('/')
        checks['boot_disk_below_85_percent'] = boot.f_blocks > 0 and 0 <= 1-boot.f_bavail/boot.f_blocks < 0.85
        checks.update(backup_checks(read_state(STATE/'last-success.json'), read_state(STATE/'last-failure.json', optional=True), now))
    except Exception:
        checks['backup_state_readable'] = False
    try: checks['API_local_TLS_ready'] = api_ready()
    except Exception: checks['API_local_TLS_ready'] = False
    return {'healthy': all(checks.values()), 'checks': checks}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('redirect_refused')


def metadata(opener, path):
    allowed = {'project/project-id', 'instance/name', 'instance/service-accounts/default/email',
               'instance/service-accounts/default/token'}
    if path not in allowed: raise ValueError('metadata_path_refused')
    request = urllib.request.Request(METADATA + path, headers={'Metadata-Flavor': 'Google'})
    with opener.open(request, timeout=4) as response:
        if response.headers.get('Metadata-Flavor') != 'Google': raise ValueError('metadata_identity_missing')
        body = response.read(16385)
        if len(body) > 16384: raise ValueError('metadata_body_limit')
        return body.decode()


def payload(healthy, now=None):
    now = datetime.now(timezone.utc) if now is None else now
    return {'timeSeries': [{'metric': {'type': METRIC}, 'resource': {'type': 'global', 'labels': {'project_id': PROJECT}},
        'metricKind': 'GAUGE', 'valueType': 'INT64',
        'points': [{'interval': {'endTime': now.isoformat(timespec='seconds').replace('+00:00', 'Z')},
                    'value': {'int64Value': '1' if healthy else '0'}}]}]}


def send(healthy):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    if (metadata(opener, 'project/project-id') != PROJECT or metadata(opener, 'instance/name') != INSTANCE or
            metadata(opener, 'instance/service-accounts/default/email') != ACCOUNT):
        raise ValueError('wrong_VM_identity')
    auth = json.loads(metadata(opener, 'instance/service-accounts/default/token'))
    token = auth.get('access_token')
    if not (isinstance(token, str) and token and '\n' not in token and '\r' not in token and
            auth.get('token_type', '').lower() == 'bearer' and number(auth.get('expires_in')) and auth['expires_in'] > 0):
        raise ValueError('invalid_metadata_token')
    request = urllib.request.Request(ENDPOINT, data=json.dumps(payload(healthy)).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
    try:
        with opener.open(request, timeout=8) as response:
            if response.status != 200: raise ValueError('metric_publish_failed')
            response.read(1024)  # No response body is logged.
    finally:
        token = auth = request = None  # Token never goes to files, argv or logs.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--send', action='store_true'); mode.add_argument('--check-local', action='store_true')
    args = parser.parse_args()
    if not (args.send or args.check_local):
        print(json.dumps({'mode': 'describe_only', 'metric': METRIC, 'interval_seconds': 60,
            'cloud_payload': 'one0/1point; no status details, secrets, rows or dynamic labels', 'network_executed': False})); return 0
    if os.geteuid() != 0 or sys.platform != 'linux': raise ValueError('VM_root_required')
    status = collect()
    if args.send:
        try: send(status['healthy'])
        except Exception:
            print(json.dumps({'event': 'LONGBEACH_MONITOR', **status, 'metric_sent': False})); return 1
    print(json.dumps({'event': 'LONGBEACH_MONITOR', **status, 'metric_sent': bool(args.send)}, sort_keys=True))
    return 0 if args.send or status['healthy'] else 1


if __name__ == '__main__':
    try: sys.exit(main())
    except Exception:
        print(json.dumps({'event': 'LONGBEACH_MONITOR', 'metric_sent': False, 'error': 'monitor_failed'})); sys.exit(1)
