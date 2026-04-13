"""Real-time ASR via WebSocket — for live speaking practice.

Uses DashScope's streaming ASR API via WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

import websockets

logger = logging.getLogger(__name__)

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
DASHSCOPE_ASR_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"


async def stream_asr_websocket(
    audio_chunks: asyncio.Queue[bytes],
    result_queue: asyncio.Queue[dict],
    *,
    api_key: str | None = None,
    model: str = "qwen3-asr-flash",
    language: str = "en",
    sample_rate: int = 16000,
) -> None:
    """Stream audio chunks to DashScope ASR WebSocket and push results.

    audio_chunks: Queue of raw PCM audio bytes (16-bit, mono, sample_rate Hz)
    result_queue: Queue of transcription results {"text": str, "is_final": bool}
    """
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        await result_queue.put({"error": "DASHSCOPE_API_KEY not configured"})
        return

    headers = {"Authorization": f"bearer {api_key}"}

    try:
        async with websockets.connect(DASHSCOPE_ASR_WS_URL, additional_headers=headers) as ws:
            # Send start message
            start_msg = {
                "header": {"action": "run-task", "task_id": os.urandom(16).hex(), "streaming": "duplex"},
                "payload": {
                    "model": model,
                    "task_group": "audio",
                    "task": "asr",
                    "function": "recognition",
                    "parameters": {
                        "sample_rate": sample_rate,
                        "format": "pcm",
                        "language": language,
                        "enable_words": True,
                    },
                },
            }
            await ws.send(json.dumps(start_msg))

            # Send audio + receive results concurrently
            async def send_audio():
                while True:
                    chunk = await audio_chunks.get()
                    if chunk is None:  # Sentinel: end of stream
                        break
                    await ws.send(chunk)
                # Send finish signal
                await ws.send(json.dumps({"header": {"action": "finish-task"}}))

            async def recv_results():
                async for message in ws:
                    data = json.loads(message)
                    payload = data.get("payload", {})
                    text = payload.get("output", {}).get("sentence", {}).get("text", "")
                    is_final = payload.get("output", {}).get("sentence", {}).get("end_time", False) is not False
                    if text:
                        await result_queue.put({"text": text, "is_final": is_final})

            await asyncio.gather(send_audio(), recv_results())

    except Exception as exc:
        logger.exception("realtime_asr.failed error=%s", str(exc)[:200])
        await result_queue.put({"error": str(exc)[:500]})
