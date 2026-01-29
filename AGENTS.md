# Agent Notes

## Project intent
Provide a minimal, public-facing viewer for Aspect Models in the Eclipse Tractus-X Semantic Layer
(SLDT). The UI stays monochrome, editorial, and focused on readability.

## Local development
- Flask server lives in `server/`.
- Use `server/.env` for secrets; never commit it.
- `sldt-semantic-models/` is a local clone only and must stay out of git.

## Routing and SEO
- Main routes: `/`, `/models/<model>`, `/models/<model>/versions/<version>`, `/diff`.
- `sitemap.xml` is generated from the GitHub API cache (`GITHUB_CACHE_TTL`).
- `index.html` and `diff.html` are rendered as templates for dynamic meta tags.
- OG image is served locally from `web/assets/mindbehindit-og.webp`.

## Deployment
- Docker uses Gunicorn and reads env vars at runtime.
- GHCR images are published only on git tags via GitHub Actions.

## Conventions
- Prefer simple HTML/CSS/JS; avoid heavy frameworks.
- Keep copy business-friendly, concise, and in English.
- Preserve existing visual language and type hierarchy.

## Security
- Preserve security headers in `server/app.py`.
- Do not relax CSP unless explicitly required.
