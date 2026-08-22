# 🛡️ shieldAI: Full-Stack Fraud Verification & Digital Asset Audit Portal

[![CI](https://github.com/YashSingh0401/ShieldAI/actions/workflows/ci.yml/badge.svg)](https://github.com/YashSingh0401/ShieldAI/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-emerald?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.0-purple?logo=vite&logoColor=white)](https://vite.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**Try it live:** [shieldai-web.onrender.com](https://shieldai-web.onrender.com) · API health: [shieldai-api-18a4.onrender.com/health](https://shieldai-api-18a4.onrender.com/health)

**shieldAI** is a free, open-source security portal that audits digital assets in real time. It combines image manipulation checks (Error Level Analysis + JPEG blockiness forensics), video splice/timeline analysis, audio prosody statistics, lexical URL phishing heuristics, and a crowdsourced scam-report feed into one dashboard. Every result is evidence-based and shown with its reasoning — no black-box verdicts.

> ⚠️ Results are heuristic indicators, not proof of authenticity. See [BENCHMARKS.md](BENCHMARKS.md) for measured accuracy.

---

## ⚡ Key Core Portals & Engines

### 1. 🖼️ Image Authentication & AI Generator Detector
* **Error Level Analysis (ELA)**: Resaves uploaded images at 90% JPEG quality and computes pixel-by-pixel compression differences, surfacing edited layers in an interactive overlay slider.
* **JPEG Blockiness Forensics**: Measures 8×8 grid-boundary energy to flag double-compression artifacts typical of re-saved or spliced files.
* **AI-Generation Heuristics**: Inspects byte streams, EXIF tables, and sensor-noise statistics for indicators commonly found in synthetic exports — reported as a probability with explicit indicators, never a verdict.
* **EXIF Parser**: Extracts hardware manufacturer details (`Model`, `Make`, `Capture DateTime`, etc.) and automatically applies a trust discount to verified device originals.

### 2. 🎬 Video Deepfake Auditor
* **Stream Demuxing**: Uses `imageio` + `imageio-ffmpeg` to parse containers, extracting magic bytes, codecs, and variable frame-rate (VFR) signatures.
* **Frame-by-Frame ELA Engine**: Extracts 20 frames evenly across the timeline and scores each against the video's own median to localize splices and re-encoding. If ffmpeg is unavailable the result degrades honestly to metadata-only ("Analysis Unavailable") — it never fabricates analysis.

### 3. 🔗 Link Safety Auditor
* **Shannon Entropy Analysis**: Computes hostname character randomness to identify programmatically generated domain hacks and obfuscated redirection paths.
* **Lexical Audits**: Inspects URL string properties (protocol safety, sub-nesting depth, suspicious TLDs like `.xyz`/`.click`, and deceptive brand typosquatting).

### 4. 👥 Crowdsourced Threat Feed & Collapsible Discussions
* **SQLAlchemy Persistence**: PostgreSQL on Render (free tier), SQLite locally — schema upgrades apply automatically at startup.
* **Discussion Drawers**: Community members expand scam cards to post and read threaded comments.
* **Moderation**: Length caps, link/character-spam filters, duplicate rejection, and admin hide/unhide/delete endpoints (see [RUNBOOK.md](RUNBOOK.md)).

---

## 🛠️ Technology Stack

* **Frontend**: React.js, React Router DOM, Lucide Icons, Vanilla CSS Grid (Custom design tokens, shifting background grids, and moving aurora gradient blobs).
* **Backend**: Python 3.10+, FastAPI (Asynchronous routes and CORS middleware), Uvicorn.
* **Database**: PostgreSQL (Render free tier) or SQLite (local) via SQLAlchemy ORM.
* **Computational Engines**: Pillow (PIL), NumPy, ImageIO (FFmpeg integration).

---

## 🚀 Setup & Execution

### 📋 Prerequisites
Ensure you have **Python 3.10+** and **Node.js 18+** installed on your system.

### 1. Backend Server Setup
Navigate to the `backend` folder, install Python dependencies, and run the FastAPI server:
```bash
# Move to backend directory
cd backend

# Install requirements
pip install -r requirements.txt

# Run the development server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*The API backend will start running locally at **`http://127.0.0.1:8000`**.*

### 2. Frontend client Setup
Open a separate terminal window, navigate to the `frontend` folder, install Node modules, configure your credentials, and start the Vite dev server:
```bash
# Move to frontend directory
cd frontend

# Install package dependencies
npm install

# Start Vite server
npm run dev
```
*The client dashboard will start running locally at **`http://localhost:5173/`**.*

### 3. Setup Google OAuth Credentials
1. Paste your Google Cloud OAuth Client ID inside the config file [frontend/.env](file:///c:/Users/ShieldAI/frontend/.env):
   ```env
   VITE_GOOGLE_CLIENT_ID=your-google-client-id-here.apps.googleusercontent.com
   ```
2. Configure **`http://localhost:5173`** under **Authorized JavaScript Origins** in your Google Cloud Console to prevent origin blockages.
3. Paste the same Client ID into [backend/.env](backend/.env.example) as `GOOGLE_CLIENT_ID`, and set a strong `JWT_SECRET`.

### 4. Running the Test Suite
The backend ships with pytest suites that run offline (no live server needed):
```bash
cd backend
pip install pytest
python -m pytest
```
An end-to-end smoke test against a running server is available via `python e2e_smoke.py` (requires `uvicorn app.main:app` running on port 8000). ffmpeg is optional locally: without it, audio/video analysis degrades to an honest metadata-only result.

---

## 🆓 Free tier & limits

shieldAI is **100% free — no accounts to pay for, no paid features**. To keep the free service fast and abuse-resistant:

- **Media scans** (image / video / audio): 10 per user per day (resets midnight UTC). Exceeding it returns HTTP 402 `quota_exceeded` with a friendly message in the UI.
- **Link scans**: unlimited (subject to normal rate limiting).
- **Community feed**: length-capped, spam-filtered, and moderated. Admins (configured via `ADMIN_EMAILS`) can hide/unhide or delete reports and comments via `/admin/*` endpoints.
- Scan history is private per account.

## ☁️ Deployment (Render, free tier)

A [render.yaml](render.yaml) blueprint deploys the full stack on free services. Click **New → Blueprint** in the Render dashboard, point it at this repo, and set the `sync: false` secrets:

| Service | Secret |
|---|---|
| `shieldai-api` | `GOOGLE_CLIENT_ID` (Google OAuth Client ID), `JWT_SECRET` (run `openssl rand -hex 32`) |
| `shieldai-web` | `VITE_GOOGLE_CLIENT_ID` (same Client ID) |

The blueprint provisions a free **Postgres** database (`shieldai-db`) automatically — the backend auto-detects the dialect and skips SQLite-only pragmas. The backend runs in Docker with **ffmpeg preinstalled**, so full audio/video analysis works.

Notes for the free tier:
- Free web services **sleep** after inactivity (~15 min) — the first request after idle will take a few seconds to wake.
- Render free-tier disks are ephemeral; always use the Postgres database for persistence (never the SQLite fallback).
- Add `https://shieldai-web.onrender.com` to your Google OAuth **Authorized JavaScript Origins**.

Deploying elsewhere: the backend is a plain Docker image (`cd backend && docker build -t shieldai-api .`), and the frontend is a static Vite build (`npm run build` in `frontend/`).

## 📏 Known Limitations (measured, not marketing)

Measured on the synthetic benchmark set in [BENCHMARKS.md](BENCHMARKS.md) (threshold = 40):

| Engine | Precision | Recall | Honest gaps |
|---|---|---|---|
| Image ELA | 1.00 | 1.00 | Calibrated on synthetic tampering; real-world camera noise may differ |
| URL lexical | 1.00 | 1.00 | Lexical only — no live DNS/whois/content inspection |
| Video timeline | 1.00 | 0.33 | Detects localized splices; misses uniform re-encodes and micro-overlays |
| Audio prosody | 1.00 | 0.33 | Flags monotone/synthetic profiles; misses high-quality MP3 re-encodes and short clips by design |

Recall numbers reflect deliberate conservatism: the engines prefer silence over false accusations.

---

## 📝 Document Maps

* **Implementation blueprints**: Read [implementation_plan.md](implementation_plan.md) for architectural changes.
* **Technical details & logs**: Read [walkthrough.md](walkthrough.md) for endpoint verification histories.
* **Accuracy benchmarks**: Read [BENCHMARKS.md](BENCHMARKS.md) for measured precision/recall of the four engines.
* **Operations guide**: Read [RUNBOOK.md](RUNBOOK.md) for moderation, quota tuning, and database expiry playbooks.
