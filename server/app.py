from __future__ import annotations

import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR.parent / "web"

load_dotenv(BASE_DIR / ".env")

GITHUB_API_URL = (
    "https://api.github.com/repos/eclipse-tractusx/sldt-semantic-models/"
    "git/trees/main?recursive=1"
)

CACHE_TTL = int(os.getenv("GITHUB_CACHE_TTL", "300"))
_cache = {"timestamp": 0.0, "data": None}

app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path="")


@app.get("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/diff")
def diff():
    return send_from_directory(WEB_DIR, "diff.html")


@app.get("/api/models")
def models():
    now = time.time()
    if _cache["data"] and now - _cache["timestamp"] < CACHE_TTL:
        return jsonify({"tree": _cache["data"], "cached": True})

    token = os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = requests.get(GITHUB_API_URL, headers=headers, timeout=30)
    if response.status_code != 200:
        if _cache["data"]:
            return jsonify({"tree": _cache["data"], "cached": True})
        return (
            jsonify(
                {
                    "error": "GitHub API request failed",
                    "status": response.status_code,
                    "detail": response.json(),
                }
            ),
            response.status_code,
        )

    tree = response.json().get("tree", [])
    _cache["timestamp"] = now
    _cache["data"] = tree
    return jsonify({"tree": tree, "cached": False})


@app.get("/<path:resource>")
def assets(resource: str):
    return send_from_directory(WEB_DIR, resource)


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


if __name__ == "__main__":
    app.run(debug=True, port=5001)
