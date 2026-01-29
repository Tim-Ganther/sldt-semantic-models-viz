# Agent Notes

## Project intent
This repository provides a minimal, public-facing viewer for the Tractus-X semantic models. Keep
the UI clean, monochrome, and focused on readability.

## Local development
- Run the Flask server in `server/`.
- Use `server/.env` for secrets; never commit it.
- `sldt-semantic-models/` is a local clone only and must stay out of git.

## Conventions
- Prefer straightforward HTML/CSS/JS; avoid heavy frameworks.
- Keep the diagram viewer based on the generated SAMM SVG/IMG.
- Keep copy business-friendly, concise, and in English.

## Security
- Preserve security headers in `server/app.py`.
- Do not relax CSP unless explicitly required.
