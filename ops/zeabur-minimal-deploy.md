# Zeabur Minimal Manual Deploy Guide

This project is designed for GitHub -> Zeabur automatic deployment.

## Goal

Keep Zeabur-side manual actions to a minimum:

1. Import one template file.
2. Fill only three app variables.
3. Redeploy by updating GitHub code.

## Files involved

- `zeabur-template.yaml`: service topology + env defaults
- `.github/workflows/ghcr-image.yml`: GHCR image build and push

## One-time setup

1. Push code to GitHub main branch.
2. Ensure GitHub Actions is enabled for this repository.
3. Confirm the workflow `Build and Push GHCR Image` finishes successfully.

## Deploy from template

Use Zeabur CLI:

```bash
npx zeabur@latest template deploy -f zeabur-template.yaml
```

During import, fill these variables:

- `APP_DASHSCOPE_API_KEY`
- `APP_JWT_SECRET`
- `APP_ADMIN_EMAILS`

## Services created

- `web` (FastAPI + static frontend from GHCR)
- `postgresql`
- `metabase`

## Required validation

1. Health endpoint:

```bash
curl -i https://<your-web-domain>/health
```

Expect `200` with JSON body containing `ok: true`.

2. Upload transcription endpoint (`/api/transcribe/file`):

Use browser or API tool to upload media and confirm a successful JSON result.

## Metabase constraint

After first login:

1. Open database settings.
2. Keep sync scope to `app` schema only.
3. Exclude system tables from business browsing.

## Prompt for Zeabur AI

```text
Please deploy this repository using zeabur-template.yaml.
Create services: web, postgresql, metabase.
For template variables, ask me only for APP_DASHSCOPE_API_KEY, APP_JWT_SECRET, APP_ADMIN_EMAILS.
After deployment, verify GET /health returns 200 and help me test POST /api/transcribe/file.
In Metabase, keep sync scope to app schema only.
```
