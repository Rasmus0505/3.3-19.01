FROM node:22-alpine AS frontend-builder

ARG BUILD_DATE=1970-01-01T00:00:00Z

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN echo "Building at ${BUILD_DATE}" && npm run build

# Clean npm artifacts before copying
RUN npm cache clean --force && rm -rf node_modules package-lock.json

FROM python:3.11-slim
LABEL "language"="python"
LABEL "framework"="fastapi"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package installation (10-100x faster than pip)
RUN pip install --no-cache-dir uv

# Copy requirements FIRST, then install dependencies
# This enables layer caching - code changes won't trigger dependency reinstall
COPY requirements.txt ./

# Use uv to install dependencies (much faster than pip)
RUN uv pip install --system --no-cache-dir -r requirements.txt

# Copy application code (changes here won't trigger dependency reinstall)
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts
COPY --from=frontend-builder /frontend/dist/ ./app/static/

RUN chmod +x /app/scripts/start.sh

EXPOSE 8080

CMD ["/app/scripts/start.sh"]
