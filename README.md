# 🛡️ shieldAI: Full-Stack Fraud Verification & Digital Asset Audit Portal

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-emerald?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.0-purple?logo=vite&logoColor=white)](https://vite.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**shieldAI** is a premium, high-fidelity security control center built to audit and verify digital assets in real-time. It protects users from modern digital fraud by combining localized image manipulation checks (Error Level Analysis), deepfake video timeline scanning, lexical URL analysis, and crowdsourced warning feeds into a unified command dashboard.

---

## ⚡ Key Core Portals & Engines

### 1. 🖼️ Image Authentication & AI Generator Detector
* **Error Level Analysis (ELA)**: Resaves uploaded images at 90% JPEG quality to compute pixel-by-pixel compression discrepancies, highlighting edited layers in a dynamic overlay slider.
* **Texture Complexity Normalization**: Evaluates spatial gradients of original images using `numpy` to adjust thresholds, preventing false positives in highly textured regions.
* **AI Generation Predictor**: Inspects raw byte streams and EXIF tables to identify Stable Diffusion parameters, Midjourney/DALL-E software tags, and checks sensor grain noise variance to output an AI probability percentage.
* **EXIF Parser**: Extracts hardware manufacturer details (`Model`, `Make`, `Capture DateTime`, etc.) and automatically applies a 40% trust discount to verified device originals.

### 2. 🎬 Video Deepfake Auditor
* **Stream Demuxing**: Employs `imageio` and `imageio-ffmpeg` to parse raw video streams, extracting container magic-bytes, codecs, and variable frame-rate (VFR) signatures.
* **Frame-by-Frame ELA Engine**: Extracts exactly 20 video frames distributed evenly across the timeline, running ELA compression checks on each frame to construct a localized deepfake risk timeline.

### 3. 🔗 Link Safety Auditor
* **Shannon Entropy Analysis**: Computes hostname character randomness to identify programmatically generated domain hacks and obfuscated redirection paths.
* **Lexical Audits**: Inspects URL string properties (protocol safety, sub-nesting depth, suspicious TLDs like `.xyz`/`.click`, and deceptive brand typosquatting).

### 4. 👥 Crowdsourced Threat Feed & Collapsible Discussions
* **SQLite Persistence**: Stores security reports and comments locally using an SQLAlchemy relational database schema.
* **Discussion Drawers**: Allows community members to expand scam cards to post and read threaded comments in real-time.

---

## 🛠️ Technology Stack

* **Frontend**: React.js, React Router DOM, Lucide Icons, Vanilla CSS Grid (Custom design tokens, shifting background grids, and moving aurora gradient blobs).
* **Backend**: Python 3.10+, FastAPI (Asynchronous routes and CORS middleware), Uvicorn.
* **Database**: SQLite (SQLAlchemy ORM, multi-relationship schemas).
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

---

## 📝 Document Maps

* **Implementation blueprints**: Read [implementation_plan.md](implementation_plan.md) for architectural changes.
* **Technical details & logs**: Read [walkthrough.md](walkthrough.md) for endpoint verification histories.
