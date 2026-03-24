# ── Stage 1: Frontend builder ──────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Clean npm artifacts before copying
RUN npm cache clean --force \
    && rm -rf node_modules package-lock.json npm-shrinkwrap.json

# ── Stage 2: Python runtime ─────────────────────────────────────────────────
FROM python:3.11-slim
LABEL "language"="python"
LABEL "framework"="fastapi"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && rm -r /root/.cache/pip

# Copy application code
COPY alembic.ini ./
COPY migrations/ ./migrations/
COPY app/ ./app/
COPY scripts/ ./scripts/

# Copy pre-built frontend assets
COPY --from=frontend-builder /frontend/dist/ ./app/static/

EXPOSE 8080

CMD ["sh", "/app/scripts/start.sh"]
