# STRUCTURE

## Project Root

```
3.3-19.01/
├── app/                        # Python backend
├── frontend/                   # React SPA
├── migrations/                 # Alembic migrations
├── package/                    # Vocabulary data (en_2016_50k.txt, etc.)
├── .planning/                  # GSD planning docs
├── requirements.txt            # Python prod deps
├── requirements-dev.txt        # Python dev deps
├── pytest.ini                  # Pytest config
├── alembic.ini                 # Alembic config
└── zeabur-template.yaml       # Zeabur deployment config
```

## Backend (`app/`)

```
app/
├── main.py                     # FastAPI app factory, entry point
├── deps.py                     # FastAPI dependency injection helpers
├── security.py                 # Password hashing, JWT utilities
├── api/
│   ├── deps/                   # Auth dependencies
│   │   ├── __init__.py
│   │   └── auth.py             # get_current_user, get_admin_user
│   └── routers/                # API route modules
│       ├── auth/               # Authentication
│       ├── lessons/            # Lessons + cloud transcription
│       ├── practice/           # Practice sessions
│       ├── wordbook/           # Vocabulary
│       ├── billing/            # Billing + wallet
│       ├── admin/              # Admin operations
│       ├── media/              # Media assets
│       ├── tts/                # Text-to-speech
│       ├── voice_cloning/      # Voice cloning
│       ├── llm.py              # LLM config
│       ├── soe.py              # Tencent SOE
│       ├── transcribe.py       # Cloud transcription
│       ├── asr_models.py       # ASR model registry
│       └── admin_sql_console.py # SQL console for admins
├── core/
│   ├── config.py               # Environment config (APP_DIR, BASE_DATA_DIR, etc.)
│   ├── logging.py              # Logging setup
│   ├── timezone.py             # Timezone utilities
│   └── errors.py               # Error response helpers
├── db/
│   ├── base.py                 # SQLAlchemy Base, schema config, BUSINESS_TABLES
│   ├── session.py              # SessionLocal, engine
│   └── init.py                 # DB init
├── domain/                     # Domain entities + policies
│   ├── lesson/
│   │   ├── entities.py
│   │   └── policy.py
│   └── billing/
│       ├── policy.py
├── models/                     # SQLAlchemy ORM models
│   ├── announcement.py
│   ├── llm_usage.py
│   └── soe_result.py
├── repositories/               # Data access layer
│   ├── base.py
│   ├── lesson.py / lessons.py
│   ├── progress.py
│   ├── wordbook.py
│   ├── wallet.py / wallet_ledger.py
│   ├── billing.py / billing_rates.py
│   ├── media_assets.py
│   ├── admin.py / admin_console.py
│   ├── announcement.py
│   └── user.py
├── schemas/                    # Pydantic request/response models
│   ├── auth.py
│   ├── practice.py
│   ├── wordbook.py
│   ├── admin_console.py
│   ├── announcement.py
│   ├── soe.py
│   └── common.py
├── services/                   # Business logic
│   ├── asr_dashscope.py
│   ├── transcription_service.py
│   ├── practice_service.py
│   ├── wordbook_service.py
│   ├── wordbook_review_scheduler.py
│   ├── billing_service.py
│   ├── media.py
│   ├── llm_usage_service.py
│   ├── admin_service.py
│   ├── admin_bootstrap.py
│   ├── admin_sql_console.py
│   ├── user_activity.py
│   ├── query_cache.py
│   ├── lesson_query_service.py
│   └── asr_model_registry.py
└── infra/                      # External service wrappers
    ├── asr/                    # ASR base class
    ├── tts/                    # TTS base + DashScope impl
    ├── translation/            # Translation base + Qwen MT
    ├── llm/
    │   └── deepseek.py
    ├── dashscope_storage.py
    ├── tencent_soe.py
    ├── media_ffmpeg.py
    ├── translation_qwen_mt.py
    └── runtime_tools.py
```

## Frontend (`frontend/src/`)

```
frontend/src/
├── main.jsx                    # App entry (LearningShell)
├── main-admin.jsx             # Admin entry
├── App.jsx                    # Root component
├── AdminApp.jsx               # Admin root component
├── store/
│   └── index.js               # Zustand store exports
├── app/
│   ├── LearningShell.jsx       # Main learning layout
│   ├── AdminShell.jsx          # Admin layout
│   ├── AdminShellStandalone.jsx
│   ├── bootstrap.jsx            # Auth bootstrap
│   ├── bootstrap-admin.jsx
│   ├── authStorage.js
│   ├── learning-shell/         # Learning shell features
│   │   ├── LearningShellHeader.jsx
│   │   ├── LearningShellPanelContent.jsx
│   │   ├── LearningShellSidebar.jsx
│   │   ├── hooks/
│   │   ├── __tests__/
│   │   └── panelRoutes.js
│   └── AdminShell/
│       └── AdminAuthGate.jsx
├── pages/
│   ├── LearningPage.jsx
│   ├── AdminPage.jsx
│   └── GettingStartedHelpPage.jsx
├── features/
│   ├── immersive/             # Immersive learning (CEFR, SOE)
│   ├── lessons/               # Lesson list + player
│   ├── wordbook/              # Wordbook panel + translation dialog
│   ├── wallet/                # Wallet + redeem codes
│   ├── practice/              # Practice panel
│   ├── getting-started/       # Onboarding
│   ├── admin-*/               # Admin feature modules
│   │   ├── admin-overview/
│   │   ├── admin-users/
│   │   ├── admin-redeem/
│   │   ├── admin-logs/
│   │   ├── admin-workspaces/
│   │   ├── admin-pages/
│   │   ├── admin-llm/
│   │   ├── admin-rates/
│   │   ├── admin-system/
│   │   ├── admin-sql-console/
│   │   └── admin-operation-logs/
│   ├── account/
│   ├── reading/
│   └── upload/
├── components/
│   ├── ui/                    # Radix UI primitive components
│   │   ├── button.jsx, input.jsx, dialog.jsx, etc.
│   │   └── sidebar.jsx, alert.jsx, badge.jsx, etc.
│   ├── AnnouncementBanner.jsx
│   └── AnnouncementModal.jsx
├── shared/
│   ├── api/
│   │   ├── client.js           # Main API client
│   │   ├── adminClient.js      # Admin API client
│   │   └── endpoints.js        # Endpoint constants
│   ├── components/            # Shared UI components
│   ├── hooks/                  # Shared hooks
│   ├── lib/
│   │   ├── utils.js
│   │   ├── datetime.js
│   │   ├── money.js
│   │   ├── asrModels.js
│   │   ├── errorFormatter.js
│   │   ├── adminSecurity.js
│   │   └── adminSearchParams.js
│   └── media/
│       ├── localMediaStore.js
│       ├── localSubtitleStore.js
│       └── localTaskStore.js
├── hooks/
│   ├── useOfflineMode.js
│   └── useReadingRewrite.js
└── lib/
    └── utils.js
```

## Migrations (`migrations/`)

```
migrations/
├── versions/                   # Alembic version scripts
└── script.py.mako
```

## Vocabulary Data (`package/`)

```
package/data/en/
├── en_2016_50k.txt            # 50k word vocabulary list (2016)
├── en_2018_50k.txt            # 50k word vocabulary list (2018)
└── frequency-alpha-gcide.txt   # GCIDE frequency alphabet
```

## Key Naming Conventions

| Layer | Convention |
|-------|------------|
| Python modules | `snake_case.py` |
| Python classes | `PascalCase` |
| Python functions | `snake_case` |
| React components | `PascalCase.jsx` |
| React hooks | `camelCase.js` (use prefix) |
| Zustand stores | `camelCase` (use prefix) |
| API routes | `snake_case` |
| Directories | `kebab-case` |
