"""Check GIS-compatible document headers without a browser, credential or cloud call."""
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import shlex
import unittest


DEPLOY = Path(__file__).resolve().parents[2]


def nginx_headers(path):
    headers = {}
    for statement in re.findall(r"^\s*add_header\s+(.+);\s*$", path.read_text(), re.MULTILINE):
        name, value, *options = shlex.split(statement)
        if options != ["always"] or name in headers:
            raise ValueError("Document security headers must be unique and apply to error responses too")
        headers[name] = value
    return headers


def document_headers():
    hosting = json.loads((DEPLOY / "google" / "firebase.json").read_text())["hosting"]
    rules = [rule for rule in hosting["headers"] if rule["source"] == "**"]
    if len(rules) != 1:
        raise ValueError("One Firebase document header rule is required")
    entries = rules[0]["headers"]
    firebase = {entry["key"]: entry["value"] for entry in entries}
    if len(firebase) != len(entries):
        raise ValueError("Duplicate Firebase document header")
    return {
        "Firebase": firebase,
        "Nginx": nginx_headers(DEPLOY / "nginx.conf"),
        "Homologação": nginx_headers(DEPLOY / "homologacao" / "nginx.conf"),
    }


class GoogleSignInHeadersTests(unittest.TestCase):
    def test_html_declares_one_compatible_policy_before_loading_any_script(self):
        class DocumentTags(HTMLParser):
            def __init__(self):
                super().__init__()
                self.tags = []

            def handle_starttag(self, tag, attrs):
                self.tags.append((tag, dict(attrs)))

        document = DocumentTags()
        document.feed((DEPLOY.parent / "frontend" / "index.html").read_text())
        policies = [(index, attrs) for index, (tag, attrs) in enumerate(document.tags)
                    if tag == "meta" and attrs.get("name", "").lower() == "referrer"]
        self.assertEqual(1, len(policies))
        index, attributes = policies[0]
        self.assertEqual("strict-origin-when-cross-origin", attributes.get("content"))
        scripts = [position for position, (tag, _) in enumerate(document.tags) if tag == "script"]
        self.assertTrue(scripts, "The application script must remain present")
        self.assertLess(index, min(scripts))

    def test_every_web_host_sends_the_origin_needed_by_google_identity_services(self):
        # Google's documented cross-origin GIS policy sends only the origin to
        # Google, rather than suppressing the context or exposing URL paths.
        for host, headers in document_headers().items():
            with self.subTest(host=host):
                self.assertEqual("strict-origin-when-cross-origin", headers["Referrer-Policy"])

    def test_gis_compatibility_keeps_the_existing_document_security_boundaries(self):
        hosts = document_headers()
        for host, headers in hosts.items():
            with self.subTest(host=host):
                self.assertEqual("nosniff", headers["X-Content-Type-Options"])
                self.assertEqual("DENY", headers["X-Frame-Options"])
                directives = dict(
                    (parts[0], parts[1:])
                    for part in headers["Content-Security-Policy"].split(";")
                    if (parts := part.strip().split())
                )
                for name, value in {"default-src": "'self'", "base-uri": "'self'",
                                    "form-action": "'self'", "frame-ancestors": "'none'",
                                    "object-src": "'none'"}.items():
                    self.assertEqual([value], directives[name])
                self.assertEqual(["https://accounts.google.com/gsi/"], directives["frame-src"])
                self.assertIn("https://accounts.google.com/gsi/", directives["script-src"])
                self.assertNotIn("'unsafe-eval'", directives["script-src"])
                self.assertNotIn("'unsafe-inline'", directives["script-src"])
        for host in ("Firebase", "Nginx"):
            self.assertEqual("camera=(), geolocation=(), microphone=()", hosts[host]["Permissions-Policy"])
        self.assertEqual("noindex, nofollow", hosts["Homologação"]["X-Robots-Tag"])


if __name__ == "__main__":
    unittest.main()
