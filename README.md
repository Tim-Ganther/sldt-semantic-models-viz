# Semantic Models Viewer

A lightweight, public-facing viewer for Aspect Models in the Eclipse Tractus-X Semantic Layer
(SLDT). The app loads model metadata from GitHub, renders SAMM diagrams, surfaces attributes, and
offers a dedicated version diff view.

## Features
- Live catalogue from `eclipse-tractusx/sldt-semantic-models`.
- Diagram viewer with pan/zoom and model metadata.
- Attribute explorer with required-only filter and example payload downloads.
- Version diff page with summary and side-by-side SAMM source.
- SEO-ready routes with dynamic metadata and `sitemap.xml`.

## Getting started
### Requirements
- Python 3.12+
- pip

### Local development
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.sample .env
```

Run the server:
```bash
./.venv/bin/python app.py
```

Open:
- `http://localhost:5001`
- `http://localhost:5001/diff`

## Configuration
Environment variables (runtime and Docker):

| Variable | Description | Default |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub token for higher API limits | unset |
| `GITHUB_CACHE_TTL` | Cache TTL for GitHub API responses (seconds) | `300` |

## Docker
Build the image:
```bash
docker build -t sldt-semantic-models-viz:local .
```

Run (configure via env vars, no `.env` required):
```bash
docker run --rm -p 5001:5001 \
  -e GITHUB_TOKEN=your_token_here \
  -e GITHUB_CACHE_TTL=300 \
  sldt-semantic-models-viz:local
```

## Container registry
GitHub Actions publishes multi-arch images to GHCR when a tag is pushed:

```
ghcr.io/tim-ganther/sldt-semantic-models-viz:<tag>
ghcr.io/tim-ganther/sldt-semantic-models-viz:latest
```

## SEO routes
- Model: `/models/<model>`
- Version: `/models/<model>/versions/<version>`
- Sitemap: `/sitemap.xml`

## Security headers
The Flask server ships with strict CSP, no-sniff, referrer policy, and related security headers.
Adjust in `server/app.py` only if required.

## Contributing
Issues and PRs are welcome. Keep changes minimal, readable, and aligned with the existing visual
language.

## License
BSD 2-Clause License. See `LICENSE`.
