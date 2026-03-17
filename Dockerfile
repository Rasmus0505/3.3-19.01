FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM alpine:3.21 AS local-asr-assets

RUN apk add --no-cache git git-lfs ca-certificates \
    && git lfs install

WORKDIR /assets
RUN git clone --depth 1 https://www.modelscope.cn/studios/csukuangfj/web-assembly-vad-asr-sherpa-onnx-zh-en-jp-ko-cantonese-sense-voice.git repo \
    && mkdir -p /export/local-asr-assets \
    && cp repo/sherpa-onnx-asr.js /export/local-asr-assets/ \
    && cp repo/sherpa-onnx-vad.js /export/local-asr-assets/ \
    && cp repo/sherpa-onnx-wasm-main-vad-asr.js /export/local-asr-assets/ \
    && cp repo/sherpa-onnx-wasm-main-vad-asr.wasm /export/local-asr-assets/ \
    && cp repo/sherpa-onnx-wasm-main-vad-asr.data /export/local-asr-assets/

FROM python:3.11-slim
LABEL "language"="python"
LABEL "framework"="fastapi"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts
COPY --from=frontend-builder /frontend/dist/ ./app/static/
COPY --from=local-asr-assets /export/local-asr-assets ./app/static/local-asr-assets

EXPOSE 8080

CMD ["sh", "/app/scripts/start.sh"]
