#!/usr/bin/env python3
"""Consulta de autenticação, sem gerar cobranças e sem exibir credenciais."""
import argparse
import base64
import json
import os
from pathlib import Path
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=Path(__file__).resolve().parents[1] / '.env.pagbank.local')
    parser.add_argument('--save-webhook-key', action='store_true', help='Salvar a chave pública validada no arquivo local, apenas em sandbox.')
    args = parser.parse_args()
    config = {}
    if args.env_file.exists():
        for line in args.env_file.read_text().splitlines():
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                config[key] = value
    config.update({key: value for key, value in os.environ.items() if key.startswith('Payments__PagBank__')})
    url = config.get('Payments__PagBank__BaseUrl', 'https://sandbox.api.pagseguro.com/')
    if url not in ('https://sandbox.api.pagseguro.com/', 'https://api.pagseguro.com/'):
        raise ValueError('Ambiente PagBank inválido.')
    token = config.get('Payments__PagBank__Token', '')
    if not token or any(c.isspace() for c in token):
        raise ValueError('Credencial ausente ou inválida.')
    if args.save_webhook_key and 'sandbox.' not in url:
        raise ValueError('Atualização automática de chave limitada ao sandbox.')
    opener = urllib.request.build_opener(NoRedirect())
    results = {'ambiente': 'Sandbox' if 'sandbox.' in url else 'Production', 'pagamentos_ativados': config.get('Payments__PagBank__Enabled', 'false').lower() == 'true'}
    for name, path in [('autenticacao', 'public-keys/card'), ('chave_webhook', 'public-keys/webhook')]:
        request = urllib.request.Request(url + path, headers={'Authorization': 'Bearer ' + token,
            'Accept': 'application/json', 'User-Agent': 'LongBeachOS-IntegrationCheck/1.0'})
        try:
            with opener.open(request, timeout=20) as response:
                data = json.load(response)
                key = data.get('public_key', '')
                if name == 'autenticacao':
                    valid = isinstance(key, str) and bool(key)
                else:
                    # OID id-ecPublicKey: não aceitar uma chave RSA de cartões como chave de webhook.
                    valid = isinstance(key, str) and b'\x06\x07\x2a\x86\x48\xce\x3d\x02\x01' in base64.b64decode(key, validate=True)
                results[name] = {'http': response.status, 'validada': valid}
                if name == 'chave_webhook' and valid and args.save_webhook_key:
                    config['Payments__PagBank__WebhookPublicKey'] = key
                    args.env_file.write_text(''.join(f'{k}={v}\n' for k, v in config.items()))
                    args.env_file.chmod(0o600)
        except urllib.error.HTTPError as error:
            results[name] = {'http': error.code, 'validada': False}
        except (urllib.error.URLError, TimeoutError, ValueError, TypeError):
            results[name] = {'http': None, 'validada': False}
    print(json.dumps(results, ensure_ascii=False))
    return 0 if results['autenticacao']['validada'] and results['chave_webhook']['validada'] else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print(json.dumps({'erro': 'Configuração local inválida ou indisponível.'}))
        raise SystemExit(1)
