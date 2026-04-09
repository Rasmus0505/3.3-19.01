# STACK

## Languages & Runtime

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+ |
| Frontend | JavaScript/JSX (React 18) |
| Build | Vite 7 |
| Runtime | Uvicorn (ASGI) |

## Backend Stack

| Component | Library |
|-----------|---------|
| Framework | FastAPI 0.115 |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic 1.14 |
| Database | PostgreSQL (SQLite for dev) |
| Auth | PyJWT + passlib[bcrypt] |
| HTTP Client | requests 2.32 |
| File Downloads | yt-dlp |
| API Docs | OpenAI SDK 1.65 |

### Key Backend Dependencies

```
fastapi==0.115.8
uvicorn==0.34.0
sqlalchemy==2.0.38
psycopg2-binary==2.9.10
passlib[bcrypt]==1.7.4
PyJWT==2.10.1
openai==1.65.4
alembic==1.14.1
yt-dlp>=2025.2.19
dashscope==1.25.11
```

## Frontend Stack

| Component | Library |
|-----------|---------|
| Framework | React 18.3 |
| Routing | React Router DOM 7 |
| State | Zustand 5 |
| Styling | TailwindCSS 4 + tw-animate-css |
| UI Primitives | Radix UI |
| Charts | Recharts 3 |
| Toasts | Sonner |
| Build | Vite 7 |
| Testing | Vitest + Testing Library |

### Key Frontend Dependencies

```
react==18.3.1
react-router-dom==7.13.1
zustand==5.0.11
tailwindcss==4.2.1
@radix-ui/* (dialog, tabs, select, etc.)
recharts==3.8.0
sonner==2.0.7
vite==7.3.1
vitest==3.2.0
```

## Infrastructure

| Concern | Technology |
|---------|------------|
| Storage | DashScope (Alibaba Cloud) |
| Transcription | DashScope Paraformer ASR |
| Speech Eval | Tencent SOE |
| Translation | Qwen MT (Alibaba) |
| Video Processing | FFmpeg |
| Deployment | Zeabur (template: `zeabur-template.yaml`) |

## Configuration Files

| File | Purpose |
|------|---------|
| `requirements.txt` | Python dependencies |
| `requirements-dev.txt` | Python dev dependencies |
| `pytest.ini` | Pytest configuration |
| `alembic.ini` | Alembic migration config |
| `frontend/package.json` | Node dependencies |
| `vite.config.js` | Vite build config |
| `zeabur-template.yaml` | Zeabur deployment |
