import base64
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('check_pagbank', Path(__file__).with_name('verificar-pagbank.py'))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class Response(io.BytesIO):
    status = 200


class CheckPagBankTests(unittest.TestCase):
    def run_check(self, opener):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / '.env.test'
            env.write_text('Payments__PagBank__Token=test-private-token\n')
            output = io.StringIO()
            with patch.object(check.os, 'environ', {}), patch.object(check.urllib.request, 'build_opener', return_value=opener), patch('sys.argv', ['check', '--env-file', str(env)]), contextlib.redirect_stdout(output):
                result = check.main()
            self.assertNotIn('test-private-token', output.getvalue())
            return result, json.loads(output.getvalue())

    def test_queries_existing_keys_by_type_without_creating_payments(self):
        requests = []

        class Opener:
            def open(self, request, timeout):
                requests.append(request)
                # Public ECDSA sample from the provider documentation; no private material.
                key = 'card-key' if request.full_url.endswith('/card') else 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEMgZPv1MegPbRkddk7LdfRtix4uTVs5HeAE0kjlzEJwod3aSIcG3LiKbQFOxHzYlzqrq8xXO/T+VbstgwuHPjzg=='
                return Response(json.dumps({'public_key': key}).encode())

        result, output = self.run_check(Opener())
        self.assertEqual(0, result)
        self.assertTrue(output['chave_webhook']['validada'])
        self.assertEqual(['https://sandbox.api.pagseguro.com/public-keys/card', 'https://sandbox.api.pagseguro.com/public-keys/webhook'], [r.full_url for r in requests])
        self.assertTrue(all(r.get_method() == 'GET' for r in requests))

    def test_oid_without_a_valid_public_key_is_rejected(self):
        self.assertFalse(check.valid_webhook_key(base64.b64encode(b'\x06\x07\x2a\x86\x48\xce\x3d\x02\x01').decode()))

    def test_failed_authentication_does_not_report_valid_connection(self):
        class Opener:
            def open(self, request, timeout):
                raise urllib.error.HTTPError(request.full_url, 401, 'Unauthorized', {}, None)

        result, output = self.run_check(Opener())
        self.assertEqual(1, result)
        self.assertFalse(output['autenticacao']['validada'])
        self.assertEqual(401, output['autenticacao']['http'])


if __name__ == '__main__':
    unittest.main()
