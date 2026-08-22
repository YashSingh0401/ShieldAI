# ShieldAI Runbook — Operations Guide

Everything needed to operate the live deployment day-to-day.

---

## 1. Service map

| Service | URL | Platform | Notes |
|---|---|---|---|
| Frontend | https://shieldai-web.onrender.com | Render static site | Vite build of `frontend/` |
| API | https://shieldai-api-18a4.onrender.com | Render Docker service | ffmpeg preinstalled in image |
| Database | (internal) | Render free PostgreSQL | Wired via `DATABASE_URL` |
| Repo / CI | https://github.com/YashSingh0401/ShieldAI | GitHub Actions | Workflow: `.github/workflows/ci.yml` |

## 2. Deploys

- **Automatic**: every push to `main` runs CI (backend pytest + benchmark regeneration + frontend build + Docker build/smoke test), then Render redeploys both services.
- **Manual redeploy**: Render dashboard → service → **Manual Deploy → Deploy latest commit**.
- **Rollback**: Render dashboard → service → **Events** → pick an older successful deploy → **Rollback**.

## 3. Reading logs

Render dashboard → `shieldai-api` → **Logs** tab. What you'll see:

- `Uvicorn running on http://0.0.0.0:8000` — healthy boot.
- `INFO ... "GET /health" 200 OK` — Render's own health probes (normal noise).
- `Audio decoding unavailable (...)` / `"Analysis Unavailable"` results — ffmpeg hiccup on one file; the engine reported metadata-only instead of guessing (by design). Repeated occurrences warrant checking the Docker image still has ffmpeg.
- Tracebacks — copy the last ~30 lines before filing/fixing; deploys don't roll back automatically on runtime errors.

## 4. Admin moderation

Admin powers are gated by the `ADMIN_EMAILS` env var (comma-separated) on `shieldai-api`.

**Get a token:** sign in at the site with Google, then open DevTools → Application → Local Storage → copy `shield_session_token`.

```bash
TOKEN="paste-token-here"
API="https://shieldai-api-18a4.onrender.com"

# Hide a report from the public feed
curl -X POST "$API/admin/reports/ID/hide" -H "Authorization: Bearer $TOKEN"

# Unhide
curl -X POST "$API/admin/reports/ID/unhide" -H "Authorization: Bearer $TOKEN"

# Delete a report permanently (its comments cascade)
curl -X DELETE "$API/admin/reports/ID" -H "Authorization: Bearer $TOKEN"

# Delete a single comment
curl -X DELETE "$API/admin/reports/RID/comments/CID" -H "Authorization: Bearer $TOKEN"
```

Non-admins get `403`; anonymous calls get `401`. Hidden reports disappear from `GET /reports` but stay in the database until deleted.

## 5. Limits & quotas

| Control | Env var | Default | Effect |
|---|---|---|---|
| Daily media scans/user | `FREE_DAILY_MEDIA_SCANS` | `10` | image+video+audio combined, resets midnight UTC. Exceeding → HTTP 402 `quota_exceeded` |
| URL scan rate limit | (code) | 30/min/IP | Public quick-scan endpoint |
| Media upload rate limit | (code) | 6/min/IP | Per scanner endpoint |
| Report/comment writes | (code) | 20/min/IP | Community feed |
| Upload size | `MAX_UPLOAD_SIZE_MB` (config.py) | 50 | All media uploads |

To tune the quota: change the env var in Render → Save (service restarts).

## 6. PostgreSQL expiry playbook (free tier)

Render **free databases expire after 30 days**. Watch for this; symptoms are `connection refused` boot-loops on the API.

1. **Export before expiry** (from any machine with psql):
   ```bash
   pg_dump "EXTERNAL_CONNECTION_STRING_FROM_RENDER_DASHBOARD" -Fc -o shieldai_backup.dump
   ```
   (Render → `shieldai-db` → **Connections** → copy the External Database URL.)
2. **Choose:**
   - *Stay free*: create a fresh free DB, update `DATABASE_URL` link on `shieldai-api`, redeploy. Data history is lost (scan history regenerates naturally; community feed restarts empty).
   - *$6/mo*: upgrade `shieldai-db` to the smallest paid plan — keeps data, no expiry.
3. **Verify** after any DB change: `/health` returns ok, then sign in and confirm Scan History loads.

## 7. JWT secret rotation

`JWT_SECRET` signs all session tokens (24 h expiry).

1. Generate: `openssl rand -hex 32`
2. Render → `shieldai-api` → Environment → replace `JWT_SECRET` → Save (restarts service).
3. Everyone is logged out and must sign in again. Nothing else breaks.

Never commit real secrets — the repo is public.

## 8. Known engine fallbacks (honesty rules)

- Audio/video analysis requires ffmpeg. If decoding fails, results come back `risk_level: "Analysis Unavailable"` with risk 5 — the UI shows an amber inconclusive card rather than pretending the file is clean.
- The video engine detects compression/splice signatures only; it does not perform facial recognition or GAN detection. Copy across the app reflects this deliberately — keep it that way when editing marketing text.
- Accuracy numbers and known gaps live in [BENCHMARKS.md](BENCHMARKS.md); regenerate anytime with `python benchmark_data/generate_samples.py && python benchmark.py` inside `backend/`.
