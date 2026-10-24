"""Verify the user ADC principal without logging or persisting access tokens."""
import http.client
import json
import os
from pathlib import Path
import stat
import subprocess
import sys


class AdcVerificationError(ValueError):
    pass


def verify(expected_account):
    credential_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    path = Path(credential_path)
    if not credential_path or not path.is_absolute():
        raise AdcVerificationError("Defina GOOGLE_APPLICATION_CREDENTIALS com o arquivo ADC privado autorizado.")
    try:
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_mode & 0o077 or not 0 < info.st_size <= 65536):
            raise AdcVerificationError("ADC deve ser arquivo regular privado, pertencente ao operador.")
        credentials = json.loads(path.read_text())
        if not isinstance(credentials, dict) or credentials.get("type") != "authorized_user":
            raise AdcVerificationError("Este modo exige ADC de usuário previamente autorizado.")
        # gcloud honors GOOGLE_APPLICATION_CREDENTIALS. Do not use auth list as
        # proof of the ADC principal, or put the returned token in process args.
        result = subprocess.run(
            ["gcloud", "auth", "application-default", "print-access-token",
             "--scopes=openid,https://www.googleapis.com/auth/userinfo.email", "--quiet"],
            capture_output=True, text=True, timeout=60, check=True)
        token = result.stdout.strip()
        if not token or len(token) > 8192 or any(character.isspace() for character in token):
            raise AdcVerificationError("Não foi possível obter um token ADC válido.")
        # HTTPSConnection verifies TLS and does not follow redirects with the
        # Authorization header. No token is placed in the URL or on disk.
        connection = http.client.HTTPSConnection("openidconnect.googleapis.com", timeout=15)
        try:
            connection.request("GET", "/v1/userinfo", headers={"Authorization": "Bearer " + token})
            response = connection.getresponse()
            payload = response.read(16385)
            if response.status != 200 or len(payload) > 16384:
                raise AdcVerificationError("Google não confirmou a identidade ADC.")
            identity = json.loads(payload)
        finally:
            connection.close()
        if (not isinstance(identity, dict) or identity.get("email_verified") is not True
                or identity.get("email") != expected_account):
            raise AdcVerificationError("ADC não pertence à conta autorizada para esta publicação.")
    except AdcVerificationError:
        raise
    except (OSError, ValueError, subprocess.SubprocessError, http.client.HTTPException):
        # Do not expose SDK stderr, response bodies, account details or tokens.
        raise AdcVerificationError("Não foi possível conferir a identidade ADC; publicação bloqueada.") from None


if __name__ == "__main__":
    try:
        verify(sys.argv[1])
    except (AdcVerificationError, IndexError) as error:
        print(str(error) if isinstance(error, AdcVerificationError) else "Informe a conta autorizada.", file=sys.stderr)
        raise SystemExit(1)
    print("Identidade ADC conferida.")
