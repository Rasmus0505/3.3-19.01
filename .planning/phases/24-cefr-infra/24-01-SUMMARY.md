# Phase 24-01: Add cefr_level Field to User Profile Backend — SUMMARY

**Completed:** 2026-04-03
**Plan:** 24-01 | Phase: 24-cefr-infra

## Tasks Completed

1. ✅ Task 1: Add `cefr_level` column to User model
   - `cefr_level: Mapped[str | None] = mapped_column(String(2), nullable=True, default="B1", index=True)` added at line 22

2. ✅ Task 2: Add `cefr_level` to Pydantic schemas
   - `ProfileUpdateRequest`: `cefr_level: str | None = Field(default=None, pattern="^(A1|A2|B1|B2|C1|C2)$")` at line 19
   - `UserResponse`: `cefr_level: str | None = "B1"` at line 39

3. ✅ Task 3: Add `update_cefr_level` to UserRepository
   - Method added at line 97, pattern follows `update_username` — fetches user, updates field, flushes, returns user

4. ✅ Task 4: Update `to_user_response` serializer
   - Added `cefr_level=str(getattr(user, "cefr_level", "B1") or "B1")` to UserResponse construction at line 52

5. ✅ Task 5: Update PATCH `/profile` endpoint to handle `cefr_level`
   - After username update, checks `payload.cefr_level is not None` and calls `user_repo.update_cefr_level()` at lines 96-97
   - Re-fetches user after any update and returns via `to_user_response()`

## Key Decisions

| Decision | Implementation |
|----------|----------------|
| D-01 (default value) | "B1" per D-07 — reasonable starter level |
| D-02 (validation) | Pydantic regex `^(A1\|A2\|B1\|B2\|C1\|C2)$` — single-field optional update |
| D-03 (endpoint) | Same PATCH `/profile` as username per D-04 |

## Files Modified

- `app/models/user.py`
- `app/schemas/auth.py`
- `app/repositories/user.py`
- `app/api/serializers.py`
- `app/api/routers/auth/router.py`

## Verification

```bash
grep -n "cefr_level" app/models/user.py
grep -n "cefr_level" app/schemas/auth.py
grep -n "update_cefr_level" app/repositories/user.py
grep -n "cefr_level" app/api/serializers.py
grep -n "cefr_level" app/api/routers/auth/router.py
```

All 5 files confirmed with `cefr_level` present.

## Commit

```
[main xxxxxxx] feat(auth): add cefr_level field to user profile (CEFR-14, CEFR-15)
```

## Next

- Run database migration: `alembic revision --autogenerate -m "add cefr_level to users"`
- Then apply migration via `postgresql-update` skill
