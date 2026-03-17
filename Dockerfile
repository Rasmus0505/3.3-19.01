FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
LABEL "language"="python"
LABEL "framework"="fastapi"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates git git-lfs \
    && git lfs install --skip-repo \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts
COPY --from=frontend-builder /frontend/dist/ ./app/static/

EXPOSE 8080

CMD ["sh", "/app/scripts/start.sh"]
