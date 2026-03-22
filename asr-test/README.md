# ASR Test Lab

Independent local test bench for English ASR model comparison.

## Models

- `distil-small.en`
- `distil-medium.en`
- `large-v3-turbo`

## Setup

```powershell
cd D:\3.3-19.01\asr-test
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:HF_ENDPOINT="https://hf-mirror.com"
python .\scripts\download_models.py
python -m uvicorn server:app --host 127.0.0.1 --port 8091 --reload
```

Open `http://127.0.0.1:8091`.

## Saved results

Each run creates `runs/<run_id>/` with:

- `input.json`
- `progress.jsonl`
- `result.json`
- `metrics.json`
- `transcript.txt`
- `subtitle.srt`
- `segments.json`

## CLI benchmark

```powershell
python .\scripts\benchmark_video.py "C:\path\to\video.mp4"
```
