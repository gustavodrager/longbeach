#!/usr/bin/env python3
"""Render reviewed REST bodies locally. No SDK, HTTP request or cloud mutation."""
import argparse
import json
import os
from pathlib import Path
import re

PROJECT = 'parsero-prod-20261022'
METRIC = 'custom.googleapis.com/longbeach/vm/operational_ok'
ACCOUNT = 'longbeach-economy-vm@' + PROJECT + '.iam.gserviceaccount.com'


def bodies(email, channel=None, check_id=None):
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email): raise ValueError('invalid_email')
    if channel and not re.fullmatch('projects/' + PROJECT + r'/notificationChannels/[0-9]+', channel): raise ValueError('invalid_channel')
    if check_id and not re.fullmatch(r'[A-Za-z0-9_-]+', check_id): raise ValueError('invalid_check_id')
    custom_filter = 'metric.type="' + METRIC + '" AND resource.type="global" AND resource.labels.project_id="' + PROJECT + '"'
    def policy(name, conditions, enabled):
        return {'displayName': name, 'combiner': 'OR', 'enabled': enabled,
            'notificationChannels': [channel] if channel else [], 'conditions': conditions,
            'documentation': {'mimeType': 'text/markdown', 'content':
                'LongBeach: verificar journalctl -u longbeach-monitor.service e os recibos privados de backup. '
                'Não remover WAL nem repetir restore/prepare para resolver um alerta. A métrica não prova um restore recente.'}}
    uptime_filter = ('metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url" '
                     'AND metric.labels.check_id="' + (check_id or 'REPLACE_UPTIME_CHECK_ID') + '"')
    return {
        'email-channel.json': {'type': 'email', 'displayName': 'Parsero LongBeach alerts', 'enabled': True, 'labels': {'email_address': email}},
        'metric-descriptor.json': {'type': METRIC, 'metricKind': 'GAUGE', 'valueType': 'INT64', 'unit': '1',
            'displayName': 'LongBeach VM operational status',
            'description': 'One host-only heartbeat:1 means local API/public TLS, backup/WAL receipts and disk checks pass;0 means a check failed.'},
        'operational-alert-policy.json': policy('LongBeach backup, API, disk or heartbeat failure', [
            {'displayName': 'Operational status failed for2minutes', 'conditionThreshold': {'filter': custom_filter,
                'comparison': 'COMPARISON_LT', 'thresholdValue': 1, 'duration': '120s', 'trigger': {'count': 1},
                'aggregations': [{'alignmentPeriod': '60s', 'perSeriesAligner': 'ALIGN_MIN'}],
                'evaluationMissingData': 'EVALUATION_MISSING_DATA_INACTIVE'}},
            {'displayName': 'No heartbeat for10minutes', 'conditionAbsent': {'filter': custom_filter,
                'duration': '600s', 'trigger': {'count': 1}}}], bool(channel)),
        'uptime-check.json': {'displayName': 'LongBeach public HTTPS API', 'period': '60s', 'timeout': '10s',
            'checkerType': 'STATIC_IP_CHECKERS', 'selectedRegions': ['SOUTH_AMERICA', 'USA_IOWA', 'EUROPE'],
            'logCheckFailures': False,
            'monitoredResource': {'type': 'uptime_url', 'labels': {'project_id': PROJECT, 'host': 'api.longbeach.quebranunca.com.br'}},
            'httpCheck': {'requestMethod': 'GET', 'useSsl': True, 'validateSsl': True, 'port': 443, 'path': '/health/ready',
                'acceptedResponseStatusCodes': [{'statusValue': 200}]}},
        'uptime-alert-policy.json': policy('LongBeach public API unavailable', [
            {'displayName': 'At least2probe locations fail for2minutes', 'conditionThreshold': {'filter': uptime_filter,
                'comparison': 'COMPARISON_GT', 'thresholdValue': 1, 'duration': '120s', 'trigger': {'count': 1},
                'aggregations': [{'alignmentPeriod': '60s', 'perSeriesAligner': 'ALIGN_NEXT_OLDER',
                                  'crossSeriesReducer': 'REDUCE_COUNT_FALSE'}]}}], bool(channel and check_id)),
        'iam-binding-review.json': {'project': PROJECT, 'role': 'roles/monitoring.metricWriter',
            'member': 'serviceAccount:' + ACCOUNT, 'other_IAM_changes': False},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True); parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--notification-channel'); parser.add_argument('--uptime-check-id')
    args = parser.parse_args()
    values = bodies(args.email, args.notification_channel, args.uptime_check_id)
    args.out.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, value in values.items():
        fd = os.open(args.out/name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream: json.dump(value, stream, indent=2, sort_keys=True); stream.write('\n')
    print(json.dumps({'rendered_local_only': True, 'files': len(values), 'cloud_requests': False,
                      'operational_alert_enabled': bool(args.notification_channel),
                      'uptime_alert_enabled': bool(args.notification_channel and args.uptime_check_id)}))


if __name__ == '__main__': main()
