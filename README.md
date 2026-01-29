# Tractus-X Semantic Models Viz

Minimal web viewer for the Tractus-X semantic models repository. It loads model metadata from the
GitHub API, renders the generated SAMM diagram, exposes model attributes, and provides a dedicated
version diff page.

## Features
- Live model catalogue from `eclipse-tractusx/sldt-semantic-models` (main branch).
- Attribute explorer with required-only toggle and example payload downloads.
- Diagram viewer using the generated SAMM SVG with pan/zoom.
- Dedicated diff page with summary + side-by-side SAMM source view.

## Local setup
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.sample .env
```

Set a GitHub token for higher API limits:
```
GITHUB_TOKEN=your_token_here
GITHUB_CACHE_TTL=300
```

Run the server:
```bash
./.venv/bin/python app.py
```

Open:
- `http://localhost:5001`
- `http://localhost:5001/diff`

## Security headers
The Flask server ships with a restrictive CSP, no-sniff, and referrer policy headers. Adjust in
`server/app.py` if you need to allow additional domains.

## Notes
- The local clone of `sldt-semantic-models/` is intentionally ignored by git.
- `server/.env` is ignored; use `.env.sample` as a template.
