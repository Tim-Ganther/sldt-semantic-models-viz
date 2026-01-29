from __future__ import annotations

import os
import time
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template_string, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR.parent / "web"
INDEX_TEMPLATE = (WEB_DIR / "index.html").read_text(encoding="utf-8")

load_dotenv(BASE_DIR / ".env", override=False)

GITHUB_API_URL = (
    "https://api.github.com/repos/eclipse-tractusx/sldt-semantic-models/"
    "git/trees/main?recursive=1"
)

CACHE_TTL = int(os.getenv("GITHUB_CACHE_TTL", "300"))
_cache = {"timestamp": 0.0, "data": None}

app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path="")


OG_IMAGE_URL = "https://mindbehind.it/wp-content/uploads/mindbehindit_og_image.webp"


def _page_meta(model: str | None = None, version: str | None = None) -> dict[str, str]:
    base_title = "Tractus-X Semantic Models"
    if model and version:
        title = f"{model} v{version} | {base_title}"
        description = (
            f"Semantic model {model} version {version}. Browse attributes, diagrams, "
            "and payload examples in the Tractus-X catalog."
        )
    elif model:
        title = f"{model} | {base_title}"
        description = (
            f"Semantic model {model} in the Tractus-X catalog. Browse available versions, "
            "attributes, and diagrams."
        )
    else:
        title = "Explore Tractus-X Semantic Models"
        description = (
            "Explore Tractus-X semantic models, review attributes, and compare versions "
            "to align on shared data contracts."
        )
    canonical_url = request.base_url
    return {
        "page_title": title,
        "page_description": description,
        "canonical_url": canonical_url,
        "og_image_url": OG_IMAGE_URL,
    }


def _render_index(model: str | None = None, version: str | None = None):
    return render_template_string(INDEX_TEMPLATE, **_page_meta(model, version))


@app.get("/")
def index():
    return _render_index()


@app.get("/index.html")
def index_file():
    return _render_index()


@app.get("/models/<path:model>")
@app.get("/models/<path:model>/versions/<path:version>")
def model_view(model: str, version: str | None = None):
    return _render_index(model, version)


@app.get("/diff")
def diff():
    return send_from_directory(WEB_DIR, "diff.html")


@app.get("/api/models")
def models():
    tree, cached, error = _fetch_tree()
    if error:
        status, detail = error
        return (
            jsonify(
                {
                    "error": "GitHub API request failed",
                    "status": status,
                    "detail": detail,
                }
            ),
            status,
        )
    return jsonify({"tree": tree, "cached": cached})


@app.get("/<path:resource>")
def assets(resource: str):
    return send_from_directory(WEB_DIR, resource)


@app.get("/sitemap.xml")
def sitemap():
    tree, _, _ = _fetch_tree(fallback_to_cache=True)
    tree = tree or []
    model_versions = _build_model_versions(tree)
    base_url = request.url_root.rstrip("/")
    urls = ["/", "/diff"]
    for model in sorted(model_versions):
        urls.append(f"/models/{quote(model)}")
        for version in sorted(model_versions[model]):
            urls.append(f"/models/{quote(model)}/versions/{quote(version)}")

    lines = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    ]
    for path in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{base_url}{path}</loc>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines), 200, {"Content-Type": "application/xml"}


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers[
        "Content-Security-Policy"
    ] = (
        "default-src 'self'; "
        "connect-src 'self' https://api.github.com https://raw.githubusercontent.com; "
        "img-src 'self' data: https://raw.githubusercontent.com; "
        "style-src 'self'; "
        "font-src 'self'; "
        "script-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'self'"
    )
    if request.is_secure or request.headers.get("X-Forwarded-Proto", "").startswith("https"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def _fetch_tree(fallback_to_cache: bool = False):
    now = time.time()
    if _cache["data"] and now - _cache["timestamp"] < CACHE_TTL:
        return _cache["data"], True, None

    token = os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = requests.get(GITHUB_API_URL, headers=headers, timeout=30)
    if response.status_code != 200:
        if fallback_to_cache and _cache["data"]:
            return _cache["data"], True, None
        return None, False, (response.status_code, response.json())

    tree = response.json().get("tree", [])
    _cache["timestamp"] = now
    _cache["data"] = tree
    return tree, False, None


def _build_model_versions(tree: list[dict]) -> dict[str, set[str]]:
    models: dict[str, set[str]] = {}
    for entry in tree:
        if entry.get("type") != "blob":
            continue
        path = entry.get("path") or ""
        if "/gen/" not in path:
            continue
        parts = path.split("/")
        if len(parts) < 4:
            continue
        model, version, segment = parts[0], parts[1], parts[2]
        if segment != "gen":
            continue
        filename = parts[-1]
        if not filename.endswith(".html"):
            continue
        models.setdefault(model, set()).add(version)
    return models


if __name__ == "__main__":
    app.run(debug=True, port=5001)
