"""Validate isolated frontend artifacts without accessing cloud services."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import urlsplit

REPOSITORY = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("source-revisions.json")
METADATA = ".longbeach-build.json"


def inputs():
    manifest = json.loads(MANIFEST.read_text())
    source = manifest["web_source_commit"]
    if not re.fullmatch(r"[a-f0-9]{40}", source):
        raise ValueError("Revisão frontend inválida no manifesto.")
    if os.environ.get("GCP_WEB_SOURCE_COMMIT", source) != source:
        raise ValueError("Revisão solicitada difere do frontend verificado no manifesto.")
    environment = os.environ.get("GCP_ENVIRONMENT")
    project = os.environ.get("GCP_PROJECT_ID", "")
    if environment not in ("production", "staging") or not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
        raise ValueError("Ambiente/projeto inválido.")
    origin = os.environ.get("VITE_API_URL", "")
    url = urlsplit(origin)
    if (url.scheme.lower() != "https" or not url.hostname or url.username or url.password
            or url.port or url.path or url.query or url.fragment or re.search(r"\s", origin)
            or not re.fullmatch(r"[a-z0-9.-]+", url.hostname.lower()) or url.hostname.endswith(".")):
        raise ValueError("VITE_API_URL deve ser uma origem HTTPS, sem caminho ou credencial.")
    # DNS names/schemes are case-insensitive: staging must never bypass the
    # production-origin gate with an uppercase spelling of the same host.
    origin = "https://" + url.hostname.lower()
    if (origin == manifest["production_api_origin"]) != (environment == "production"):
        raise ValueError("Produção exige a API canônica; staging exige sua própria API.")
    google = os.environ.get("VITE_GOOGLE_CLIENT_ID", "")
    if google and not re.fullmatch(r"[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com", google):
        raise ValueError("Client ID Google opcional deve ser um valor público válido.")
    output = Path(os.environ.get("GCP_WEB_DIST_DIR", ""))
    if not output.is_absolute() or output.is_symlink():
        raise ValueError("GCP_WEB_DIST_DIR deve ser um caminho absoluto, sem symlink.")
    output = output.resolve()
    if output == REPOSITORY or REPOSITORY in output.parents:
        raise ValueError("GCP_WEB_DIST_DIR precisa ficar fora do repositório.")
    expected = {"schema_version": 1, "source_commit": source, "environment": environment,
                "project_id": project, "api_origin": origin,
                "build_flags": {"demo_mode": False, "operational_storage": "postgres"}}
    if google:
        expected["google_client_id_sha256"] = hashlib.sha256(google.encode()).hexdigest()
    return output, expected


def tree_hash(directory):
    digest = hashlib.sha256()
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError("Artefato contém symlink.")
        if path.is_file() and path.name != METADATA:
            digest.update(path.relative_to(directory).as_posix().encode())
            digest.update(b"\0")
            digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def source_tree(source):
    return subprocess.check_output(["git", "-C", str(REPOSITORY), "rev-parse", source + ":app"], text=True).strip()


def artifact_metadata(directory, expected):
    attributes = directory.stat()
    if not stat.S_ISDIR(attributes.st_mode) or attributes.st_uid != os.getuid() or attributes.st_mode & 0o077:
        raise ValueError("Diretório do artefato deve ser privado e do usuário atual (0700).")
    if not (directory / "index.html").is_file():
        raise ValueError("Artefato sem index.html.")
    return dict(expected, source_tree=source_tree(expected["source_commit"]), dist_sha256=tree_hash(directory))


def main():
    command = sys.argv[1] if len(sys.argv) == 2 else ""
    directory, expected = inputs()
    if command == "source":
        print(expected["source_commit"])
    elif command == "record":
        metadata = artifact_metadata(directory, expected)
        with (directory / METADATA).open("x") as file:
            json.dump(metadata, file, indent=2)
            file.write("\n")
    elif command == "verify":
        if (directory / METADATA).is_symlink():
            raise ValueError("Metadados do build não podem ser symlink.")
        metadata = json.loads((directory / METADATA).read_text())
        if metadata != artifact_metadata(directory, expected):
            raise ValueError("Artefato, revisão ou configuração difere do build verificado. Reconstrua antes de publicar.")
    else:
        raise ValueError("Use source, record ou verify.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
