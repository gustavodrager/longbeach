"""Offline monitor guards. Synthetic data only; no sockets, metadata or cloud."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
import sys
from contextlib import redirect_stdout
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
def load(name):
    spec = importlib.util.spec_from_file_location('monitor_' + name, ROOT/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
emit, render = load('emit'), load('render')
NOW = 1800000000
def success():
    return {'ok': True, 'completed_epoch': NOW-30, 'latest_full_epoch': NOW-3600,
            'wal_probe_current': True, 'ready_wal_count': 0}


class Monitor(unittest.TestCase):
    def test_default_only_describes_without_host_or_cloud_access(self):
        capture = io.StringIO()
        with patch.object(sys, 'argv', ['emit.py']), patch.object(emit, 'collect') as collect, patch.object(emit, 'send') as send, redirect_stdout(capture):
            self.assertEqual(emit.main(), 0)
        collect.assert_not_called(); send.assert_not_called()
        self.assertFalse(json.loads(capture.getvalue())['network_executed'])

    def test_success_and_recovered_old_failure(self):
        self.assertTrue(all(emit.backup_checks(success(), None, NOW).values()))
        self.assertTrue(all(emit.backup_checks(success(), {'completed_epoch': NOW-60}, NOW).values()))

    def test_stale_check_full_or_WAL_failure_refused(self):
        for key, value in [('ok', False), ('completed_epoch', NOW-601), ('completed_epoch', NOW+61),
                           ('latest_full_epoch', NOW-26*3600-1), ('wal_probe_current', False),
                           ('ready_wal_count', 3), ('ready_wal_count', True), ('latest_full_epoch', float('nan'))]:
            raw = success(); raw[key] = value
            with self.subTest(key=key, value=value): self.assertFalse(all(emit.backup_checks(raw, None, NOW).values()))

    def test_newer_or_malformed_failure_is_not_hidden(self):
        for value in [{'completed_epoch': NOW-1}, {}, {'completed_epoch': True}]:
            self.assertFalse(all(emit.backup_checks(success(), value, NOW).values()))

    def test_scalar_clock_and_backup_boundaries(self):
        raw = success(); raw['completed_epoch'] = NOW-600; raw['latest_full_epoch'] = NOW-26*3600
        self.assertTrue(all(emit.backup_checks(raw, None, NOW).values()))
        self.assertFalse(emit.number(True)); self.assertFalse(emit.number(float('inf')))

    def test_payload_has_one_series_one_bit_no_status_or_dynamic_labels(self):
        for healthy, expected in [(True, '1'), (False, '0')]:
            body = emit.payload(healthy); series = body['timeSeries']
            self.assertEqual(len(series), 1); self.assertEqual(series[0]['metric'], {'type': emit.METRIC})
            self.assertEqual(series[0]['resource'], {'type': 'global', 'labels': {'project_id': emit.PROJECT}})
            self.assertEqual(series[0]['points'][0]['value'], {'int64Value': expected})
            self.assertNotIn('checks', json.dumps(body)); self.assertNotIn('email', json.dumps(body))

    def test_API_TLS_has_fixed_loopback_SNI_Host_and_public_CA(self):
        captured = {}
        context = types.SimpleNamespace(wrap_socket=lambda raw, server_hostname: captured.update(SNI=server_hostname) or object())
        class Connection:
            def __init__(self, host, port, *, timeout, context): self._context = context
            def request(self, method, path, *, headers):
                captured.update(method=method, path=path, headers=headers); self.connect()
            def getresponse(self): return types.SimpleNamespace(status=200, read=lambda limit: b'{}')
            def close(self): pass
        with patch.object(emit.ssl, 'create_default_context', return_value=context) as trust, patch.object(emit.http.client, 'HTTPSConnection', Connection), patch.object(emit.socket, 'create_connection', side_effect=lambda address, timeout: captured.update(TCP=address) or object()):
            self.assertTrue(emit.api_ready())
        trust.assert_called_once_with(); self.assertEqual(captured['TCP'], ('127.0.0.1', 443))
        self.assertEqual(captured['SNI'], emit.HOST); self.assertEqual(captured['headers']['Host'], emit.HOST)
        self.assertEqual((captured['method'], captured['path']), ('GET', '/health/ready'))
        self.assertNotIn('Authorization', captured['headers'])

    def test_metadata_paths_and_redirects_are_closed(self):
        with self.assertRaises(ValueError): emit.metadata(None, 'instance/attributes/secrets')
        with self.assertRaises(ValueError): emit.NoRedirect().redirect_request(None)

    def test_publish_uses_only_expected_ADC_identity_and_one_metric(self):
        seen = []
        class Response(io.BytesIO):
            headers = {'Metadata-Flavor': 'Google'}; status = 200
        class Opener:
            def open(self, request, timeout):
                seen.append(request)
                if request.full_url.endswith('project/project-id'): return Response(emit.PROJECT.encode())
                if request.full_url.endswith('instance/name'): return Response(emit.INSTANCE.encode())
                if request.full_url.endswith('default/email'): return Response(emit.ACCOUNT.encode())
                if request.full_url.endswith('default/token'): return Response(b'{"access_token":"synthetic-token","token_type":"Bearer","expires_in":3000}')
                self.assert_expected(request)
                return Response(b'{}')
            def assert_expected(self, request):
                assert request.full_url == emit.ENDPOINT and request.method == 'POST'
                assert request.get_header('Authorization') == 'Bearer synthetic-token'
                assert len(json.loads(request.data)['timeSeries']) == 1
        with patch.object(emit.urllib.request, 'build_opener', return_value=Opener()): emit.send(False)
        self.assertEqual(len(seen), 5)

    def test_wrong_VM_identity_never_requests_token_or_sends(self):
        with patch.object(emit, 'metadata', return_value='wrong-project') as metadata, patch.object(emit.urllib.request, 'build_opener'):
            with self.assertRaises(ValueError): emit.send(True)
        self.assertEqual(metadata.call_count, 1)

    def test_missing_backup_or_health_failure_becomes_zero(self):
        with patch.object(emit.DATA.__class__, 'is_mount', return_value=True), patch.object(emit.DATA.__class__, 'is_symlink', return_value=False), patch.object(emit.DATA.__class__, 'lstat', return_value=types.SimpleNamespace(st_mode=0o40700, st_uid=0)), patch.object(emit.os, 'statvfs', return_value=types.SimpleNamespace(f_blocks=100, f_bavail=50)), patch.object(emit, 'read_state', side_effect=[success(), None]), patch.object(emit, 'api_ready', return_value=True):
            self.assertTrue(emit.collect(NOW)['healthy'])
        with patch.object(emit, 'read_state', side_effect=FileNotFoundError), patch.object(emit, 'api_ready', return_value=False):
            self.assertFalse(emit.collect(NOW)['healthy'])

    def test_render_without_ids_disables_alerts_and_pins_minimal_IAM(self):
        data = render.bodies('synthetic@example.invalid')
        self.assertFalse(data['operational-alert-policy.json']['enabled']); self.assertFalse(data['uptime-alert-policy.json']['enabled'])
        self.assertEqual(data['iam-binding-review.json']['role'], 'roles/monitoring.metricWriter')
        self.assertEqual(data['iam-binding-review.json']['member'], 'serviceAccount:' + emit.ACCOUNT)
        self.assertEqual(data['uptime-check.json']['httpCheck']['validateSsl'], True)

    def test_render_alerts_bind_exact_channel_and_uptime_check(self):
        channel = 'projects/' + emit.PROJECT + '/notificationChannels/123456789'
        data = render.bodies('synthetic@example.invalid', channel, 'own-check')
        policy = data['operational-alert-policy.json']
        self.assertTrue(policy['enabled']); self.assertEqual(policy['notificationChannels'], [channel])
        self.assertEqual(policy['conditions'][1]['conditionAbsent']['duration'], '600s')
        self.assertTrue(data['uptime-alert-policy.json']['enabled'])
        self.assertIn('own-check', data['uptime-alert-policy.json']['conditions'][0]['conditionThreshold']['filter'])
        for bad in ['projects/other/notificationChannels/1', 'https://other.invalid']:
            with self.assertRaises(ValueError): render.bodies('synthetic@example.invalid', bad)


if __name__ == '__main__': unittest.main()
