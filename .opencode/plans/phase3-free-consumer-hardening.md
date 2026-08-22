# Phase 3 — Consumer Hardening (All-Free Model) — FINAL PLAN

## Decisions locked in (user-confirmed)
- **NO Pro tier / NO Stripe / no payments of any kind.** Product is free for everyone.
- **Abuse-protection quota stays**: 10 media scans/day per user (image+video+audio combined), UTC reset. URL scans unlimited.
- PDF certificates stay free.
- Admin account = legal contact = the user's Google email (they paste it into Render `ADMIN_EMAILS`; also goes into legal pages).
- Everything else from the original Phase 3 (moderation, legal pages, per-user history) proceeds unchanged.

## Security note discovered during planning
`backend/app/config.py` was modified (by user, for deploy) to hardcode a fallback
`JWT_SECRET = "shieldai-default-jwt-secret-key-2026-production"` and the real Google Client ID.
The repo is PUBLIC → anyone can forge valid session tokens with that fallback secret if the env var is unset.
**Action required (user)**: set a strong random `JWT_SECRET` in Render's Environment tab (overrides the fallback). Keep the code fallback but treat it as dev-only. Optionally print a startup warning when the fallback is active in production.

## Implementation steps

### 1. Backend config (`backend/app/config.py`)
```python
# Free-for-all abuse protection: media scans per user per UTC day.
FREE_DAILY_MEDIA_SCANS = int(os.getenv("FREE_DAILY_MEDIA_SCANS", "10"))
# Comma-separated admin emails; admins can hide/unhide/delete community reports.
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}
```

### 2. Models (`backend/app/models.py`)
- New `User` table: `id`, `email` (unique index), `name`, `picture`, `created_at`. No Stripe columns needed.
  - Created automatically by `Base.metadata.create_all` (new table = safe on existing Postgres).
- `ScanHistory`: add nullable `user_email` column (attribution for quotas + own-history view).
- `ScamReport`: add `is_hidden` boolean, default False (soft-delete for moderation).

### 3. Startup migration helper (`backend/app/database.py`)
No Alembic; Postgres table already exists in prod and `create_all` won't ALTER it:
```python
def _ensure_columns():
    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("scan_history")}
    if "user_email" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE scan_history ADD COLUMN user_email VARCHAR"))
    # same for scam_reports.is_hidden (BOOLEAN / SMALLINT portable via SQLAlchemy text with dialect check)
```
Call before `create_all` in `main.py`. Keep dialect-tolerant (works SQLite + Postgres).

### 4. Auth & attribution (`backend/app/auth.py`, `app/main.py`)
- `/auth/google`: after token verify, upsert `User(email=..., name=..., picture=...)`. JWT payload unchanged.
- Add `get_optional_user` dependency (HTTPBearer auto_error=False) — returns None for anonymous.
- `save_scan_history(db, scan_type, target, risk_score, status, user_email=None)`.
- All four verify endpoints pass `user.email` when authenticated; anonymous URL scans store NULL.

### 5. Quota enforcement (`app/main.py`)
```python
def enforce_media_quota(user, db):
    start_utc = datetime.combine(datetime.now(timezone.utc).date(), time.min)
    used = db.query(func.count(ScanHistory.id)).filter(
        ScanHistory.user_email == user["email"],
        ScanHistory.scan_type.in_(["image", "video", "audio"]),
        ScanHistory.timestamp >= start_utc,
    ).scalar()
    if used >= FREE_DAILY_MEDIA_SCANS:
        raise HTTPException(402, detail={"code": "quota_exceeded", "limit": ..., "message": "Daily limit reached — resets at midnight UTC."})
```
Wire into `/verify/image|video|audio` AFTER auth, BEFORE processing. URL endpoint untouched.

### 6. History privacy fix (`app/main.py`)
`GET /verify/history` returns ONLY rows where `user_email == current user's email`.
(Currently global — wrong for consumers.) Existing NULL rows become invisible; acceptable on fresh DB.

### 7. Moderation (`schemas.py`, `main.py`)
- Caps: `description max_length=1000`, comment `content max_length=500` (Pydantic → 422 automatically).
- `_looks_like_spam(text)`: >5 URLs OR any 25+ repeated chars OR exact duplicate content already in DB → 400.
- `ScamReport.is_hidden` filter on public `GET /reports` (hidden excluded).
- Admin-only endpoints gated by `email.lower() in ADMIN_EMAILS` (403 otherwise):
  - `POST /admin/reports/{id}/hide`, `POST /admin/reports/{id}/unhide`
  - `DELETE /admin/reports/{id}`, `DELETE /admin/reports/{rid}/comments/{cid}`

### 8. Frontend
- `api/client.js`: attach `err.status` (+ parsed body) to thrown errors so pages can detect 402.
- Image/Video/AudioVerify: catch `status===402 && code==="quota_exceeded"` → friendly inline card:
  "You've used your 10 free scans today — resets at midnight UTC" (NOT an upsell; product is free).
- New static routes `/privacy`, `/terms` (drafted text, contact email from `src/config.js` CONTACT_EMAIL const).
- Landing footer: Privacy · Terms links + disclaimer "Heuristic analysis — not proof of authenticity".
- Dashboard unchanged (server now scopes history to the signed-in user).

### 9. Tests (offline pytest)
- Update existing history tests (anonymous URL scans no longer appear in an authenticated user's history; pass auth headers on scans meant to be attributed).
- New `test_quota_and_moderation.py`: quota blocks at N+1 with 402 shape; quota counts only media types; reset via date monkeypatch optional; spam heuristics reject; length caps → 422; admin endpoints 403 non-admin / 200 admin; hidden reports filtered from public list.
- conftest: fresh in-memory DB each run already covers new schema.

### 10. Deploy config
- `render.yaml`: add `ADMIN_EMAILS` (sync:false), `FREE_DAILY_MEDIA_SCANS` = "10" on shieldai-api.
- `backend/.env.example`: document both new vars.
- README: short "Free tier & limits" + moderation/admin section.

### 11. Verification & ship
1. `python -m pytest` green (all suites).
2. `npm run build` green.
3. Local uvicorn e2e smoke (e2e uses 4 media scans — under quota; still passes).
4. Commit(s): backend quota/moderation → frontend/legal → deploy docs.
5. Push → CI → Render auto-deploy.

### User checklist after deploy (their side, ~5 min)
1. Render → shieldai-api → Environment: set `ADMIN_EMAILS=yashwardhans782@gmail.com` and a strong `JWT_SECRET` (security note above).
2. Legal contact email confirmed: **yashwardhans782@gmail.com** — hardcoded as `CONTACT_EMAIL` in `frontend/src/config.js`; no placeholder remains.
3. Review /privacy + /terms drafts once live.
