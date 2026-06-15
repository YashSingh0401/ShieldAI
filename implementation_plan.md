# Implementation Plan: shieldAI Core Feature Overhauls

We will implement 4 major full-stack upgrades to make **shieldAI** extremely premium:
1. **Crowdsourced Comments Database Layer**: Add comment tables and endpoints so users can discuss active fraud cards.
2. **Real Video Frame ELA Analysis**: Install `imageio` and perform actual frame extraction and ELA calculations on uploaded MP4/WebM videos.
3. **Audit Log Export Controls**: Add PDF printing and JSON data export controls for verified assets.
4. **Production Authentication Setup**: Setup `.env.example` configurations for Firebase/Google OAuth.

---

## Proposed Changes

### 1. Database & Comments Layer (Python Backend)

#### [MODIFY] [backend/requirements.txt](file:///c:/Users/ShieldAI/backend/requirements.txt)
* Append `imageio` and `imageio-ffmpeg` to support video frame demuxing and extraction.

#### [MODIFY] [backend/app/models.py](file:///c:/Users/ShieldAI/backend/app/models.py)
* Add `ScamComment` database table model:
  - `id` (Integer, PK)
  - `report_id` (Integer, FK to `scam_reports.id`)
  - `author` (String)
  - `content` (Text)
  - `created_at` (DateTime, default=now)

#### [MODIFY] [backend/app/schemas.py](file:///c:/Users/ShieldAI/backend/app/schemas.py)
* Add `ScamCommentCreate` and `ScamCommentResponse` Pydantic schemas.

#### [MODIFY] [backend/app/main.py](file:///c:/Users/ShieldAI/backend/app/main.py)
* Initialize relationships.
* Implement endpoints:
  - `GET /reports/{report_id}/comments`: Retrieves discussions sorted by date.
  - `POST /reports/{report_id}/comments`: Submits a new comment response.

---

### 2. Real Video Frame ELA Engine

#### [MODIFY] [backend/app/video_engine.py](file:///c:/Users/ShieldAI/backend/app/video_engine.py)
* Replace mock metadata with dynamic `imageio.get_reader` stream demuxing.
* Extract 10-20 frames distributed evenly across the video timeline.
* Run ELA (JPEG compression differences) on each frame using the Pillow CV engine.
* Map these computed differences to the 20 timeline blocks and construct a real anomaly summary.

---

### 3. Frontend Comments & Discussion Board

#### [MODIFY] [frontend/src/components/ReportCard.jsx](file:///c:/Users/ShieldAI/frontend/src/components/ReportCard.jsx)
* Add a collapsible "Discussion Board" panel.
* Fetch comments from `/reports/{id}/comments` when expanded.
* Add a form to submit comments, refreshing the local thread on success.

---

### 4. Audit Log Export Controls

#### [MODIFY] [frontend/src/pages/ImageVerify.jsx](file:///c:/Users/ShieldAI/frontend/src/pages/ImageVerify.jsx), [LinkScan.jsx](file:///c:/Users/ShieldAI/frontend/src/pages/LinkScan.jsx), [VideoVerify.jsx](file:///c:/Users/ShieldAI/frontend/src/pages/VideoVerify.jsx)
* Add "Export Report" button groups to the results console.
* "Export JSON": Downloads a formatted JSON report containing risk ratings, signatures, and EXIF parameters.
* "Export PDF Certificate": Triggers window print frames styled specifically as a security scan certificate.

---

### 5. Configurable Auth Templates

#### [NEW] [backend/.env.example](file:///c:/Users/ShieldAI/backend/.env.example)
* Setup template env keys for database URLs and Google OAuth client secrets.

#### [NEW] [frontend/.env.example](file:///c:/Users/ShieldAI/frontend/.env.example)
* Setup template keys for Vite backend host mappings and Firebase configurations.

---

## Verification Plan

### Automated Tests
1. **Database Relations Test**:
   Modify `backend/test_api.py` to assert commenting and comment retrieval operations work correctly.
2. **Build Validation**:
   Validate code integration compilation:
   ```bash
   npm run build
   ```

### Manual Verification
1. Upload a video file, verify that `imageio` runs frame ELA calculations, and check if the timeline flags compression artifacts.
2. Open a scam report, submit a comment, and ensure it displays instantly under the target card.
