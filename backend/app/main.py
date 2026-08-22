import io
import re
import base64
import logging
import asyncio
import random
from datetime import datetime, time, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional
from PIL import Image

from .config import (
    FRONTEND_URL, GOOGLE_CLIENT_ID, MAX_UPLOAD_SIZE_MB,
    ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_AUDIO_TYPES,
    FREE_DAILY_MEDIA_SCANS, ADMIN_EMAILS,
)
from .database import engine, get_db, ensure_schema_upgrades
from .models import Base, User, ScamReport, ScamComment, ScanHistory
from .schemas import (
    ScamReportCreate, ScamReportResponse, ScamReportUpvoteResponse,
    ScamCommentCreate, ScamCommentResponse, ScanHistoryResponse, AudioVerifyResponse,
    GoogleAuthRequest, AuthResponse,)
from .cv_engine import perform_ela, extract_exif, detect_ai_generation
from .url_engine import analyze_url
from .video_engine import analyze_video
from .audio_engine import analyze_audio
from .auth import verify_google_token, create_session_token, get_current_user, get_optional_user

ensure_schema_upgrades()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="shieldAI API Server", version="1.0.0")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://shieldai-web.onrender.com",
    ],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health / Root ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "shieldAI API Server",
        "version": app.version,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


def validate_upload(file: UploadFile, allowed_types: set, max_mb: int):
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {allowed_types}",
        )
    MAX_BYTES = max_mb * 1024 * 1024
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {max_mb}MB.",
        )


def save_scan_history(db: Session, scan_type: str, target: str, risk_score: float, status: str, user_email: Optional[str] = None):
    entry = ScanHistory(
        scan_type=scan_type,
        target=target,
        risk_score=risk_score,
        status=status,
        user_email=user_email.lower() if user_email else None,
    )
    db.add(entry)
    db.commit()


def enforce_media_quota(user: dict, db: Session):
    """Free-for-all abuse protection: cap media scans (image/video/audio) per UTC day."""
    day_start_utc = datetime.combine(datetime.now(timezone.utc).date(), time.min)
    used = (
        db.query(func.count(ScanHistory.id))
        .filter(
            ScanHistory.user_email == user["email"].lower(),
            ScanHistory.scan_type.in_(["image", "video", "audio"]),
            ScanHistory.timestamp >= day_start_utc,
        )
        .scalar() or 0
    )
    if used >= FREE_DAILY_MEDIA_SCANS:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "quota_exceeded",
                "limit": FREE_DAILY_MEDIA_SCANS,
                "used": int(used),
                "message": f"You've used all {FREE_DAILY_MEDIA_SCANS} free media scans for today. Your allowance resets at midnight UTC.",
            },
        )


_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_CHAR_SPAM_RE = re.compile(r"(.)\1{24,}")


def _looks_like_spam(text_content: str) -> bool:
    """Light-touch feed spam heuristics: link floods and character spam."""
    if len(_URL_RE.findall(text_content)) > 5:
        return True
    if _CHAR_SPAM_RE.search(text_content):
        return True
    return False


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.post("/auth/google", response_model=AuthResponse)
async def auth_google(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    user_info = verify_google_token(request.credential)
    email = user_info["email"].lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        existing.name = user_info.get("name") or existing.name
        existing.picture = user_info.get("picture") or existing.picture
    else:
        db.add(User(email=email, name=user_info.get("name", ""), picture=user_info.get("picture", "")))
    db.commit()

    token = create_session_token(user_info)
    return AuthResponse(
        token=token,
        user={"name": user_info["name"], "email": email, "avatar": user_info.get("picture", "")},
    )


# ─── Verify Routes ────────────────────────────────────────────────────────────

@app.post("/verify/image")
@limiter.limit("6/minute")
async def verify_image(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_upload(file, ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_MB)
    enforce_media_quota(user, db)
    try:
        image_bytes = await file.read()

        metadata = extract_exif(image_bytes)
        ela_b64, risk_score, anomalies = perform_ela(image_bytes)
        is_ai_generated, ai_probability, ai_indicators = detect_ai_generation(image_bytes, file.filename, metadata)

        try:
            img = Image.open(io.BytesIO(image_bytes))
            fmt = img.format.lower() if img.format else "jpeg"
        except Exception:
            fmt = "jpeg"

        original_b64 = f"data:image/{fmt};base64," + base64.b64encode(image_bytes).decode('utf-8')

        has_exif = len(metadata) > 0 and "error" not in metadata

        formatted_metadata = {
            "Camera Model": "None",
            "Creator Software": "In-Camera Firmware",
            "Capture DateTime": "Unknown",
            "GPS Coordinates": "None",
        }
        if has_exif:
            formatted_metadata = {
                "Camera Model": metadata.get("Model", "Unknown"),
                "Creator Software": metadata.get("Software", "Unknown"),
                "Capture DateTime": metadata.get("DateTime", "Unknown"),
                "ISO Speed Rating": metadata.get("ISOSpeedRatings", "Unknown"),
                "Focal Length": metadata.get("FocalLength", "Unknown"),
                "GPS Coordinates": "None",
            }
            if "GPSInfo" in metadata:
                formatted_metadata["GPS Coordinates"] = "Coordinates Extracted"

        software = metadata.get("Software", "")
        if has_exif and ("Make" in metadata or "Model" in metadata or "DateTime" in metadata):
            if not any(tool in software.lower() for tool in ["photoshop", "gimp", "adobe", "canva", "pixlr"]):
                risk_score = int(risk_score * 0.6)

        is_clean = risk_score < 40
        if not is_clean:
            anomalies.append("Non-uniform compression thresholds (high ELA brightness around central object).")

        if any(tool in software.lower() for tool in ["photoshop", "gimp", "adobe", "canva", "pixlr"]):
            is_clean = False
            risk_score = max(risk_score, 75)
            anomalies.append(f"Software flag indicates file modification ({software}).")

        risk_level = "Safe" if is_clean else "Critical Tampering Detected"

        status = "success" if is_clean else "danger"
        save_scan_history(db, "image", file.filename, float(risk_score), status, user_email=user["email"])

        return {
            "is_clean": is_clean,
            "filename": file.filename,
            "has_exif": has_exif,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "metadata": formatted_metadata,
            "original": original_b64,
            "ela": ela_b64,
            "anomalies": anomalies,
            "is_ai_generated": is_ai_generated,
            "ai_probability": ai_probability,
            "ai_indicators": ai_indicators,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {str(e)}")


@app.get("/verify/url")
@limiter.limit("30/minute")
def verify_url(request: Request, url: str, db: Session = Depends(get_db), user: Optional[dict] = Depends(get_optional_user)):
    if not url:
        raise HTTPException(status_code=400, detail="URL query parameter is required")
    result = analyze_url(url)
    risk_score = result.get("risk_score", 0)
    is_clean = result.get("is_clean", risk_score < 50)
    status = "success" if is_clean else "danger"
    save_scan_history(db, "url", url, float(risk_score), status, user_email=user["email"] if user else None)
    return result


@app.post("/verify/video")
@limiter.limit("6/minute")
async def verify_video(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_upload(file, ALLOWED_VIDEO_TYPES, MAX_UPLOAD_SIZE_MB)
    enforce_media_quota(user, db)
    try:
        file_bytes = await file.read()
        result = analyze_video(file.filename, file_bytes)
        status = "success" if result.get("is_clean") else "danger"
        save_scan_history(db, "video", file.filename, float(result.get("risk_score", 0)), status, user_email=user["email"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Video processing failed: {str(e)}")


@app.post("/verify/audio", response_model=AudioVerifyResponse)
@limiter.limit("6/minute")
async def verify_audio(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_audio = ALLOWED_AUDIO_TYPES | {"application/octet-stream"}
    validate_upload(file, allowed_audio, MAX_UPLOAD_SIZE_MB)
    enforce_media_quota(user, db)
    try:
        file_bytes = await file.read()
        result = analyze_audio(file.filename, file_bytes)
        status = "success" if result.get("is_clean") else "danger"
        save_scan_history(db, "audio", file.filename, float(result.get("risk_score", 0)), status, user_email=user["email"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio processing failed: {str(e)}")


@app.get("/verify/history", response_model=list[ScanHistoryResponse])
def get_scan_history(
    scan_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Users only ever see their own scans.
    query = db.query(ScanHistory).filter(ScanHistory.user_email == user["email"].lower())
    if scan_type:
        query = query.filter(ScanHistory.scan_type == scan_type)
    return query.order_by(ScanHistory.timestamp.desc()).all()


# ─── Report Routes ────────────────────────────────────────────────────────────

@app.post("/reports", response_model=ScamReportResponse)
@limiter.limit("20/minute")
def create_report(
    request: Request,
    report: ScamReportCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    combined_text = f"{report.title} {report.scam_content or ''} {report.description}"
    if _looks_like_spam(combined_text):
        raise HTTPException(status_code=400, detail="Report rejected by spam filter.")

    content_norm = (report.scam_content or "").strip()
    dup_query = db.query(ScamReport).filter(ScamReport.title == report.title.strip())
    if content_norm:
        dup_query = dup_query.filter(ScamReport.scam_content == content_norm)
    if dup_query.first():
        raise HTTPException(status_code=400, detail="An identical report already exists.")

    db_report = ScamReport(
        report_type=report.report_type,
        title=report.title,
        scam_content=report.scam_content,
        description=report.description,
        location=report.location,
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report


@app.get("/reports", response_model=List[ScamReportResponse])
def get_reports(
    report_type: str = "all",
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    # Public feed excludes moderator-hidden reports.
    query = db.query(ScamReport).filter(ScamReport.is_hidden == False)  # noqa: E712

    if report_type != "all":
        query = query.filter(ScamReport.report_type == report_type)

    if q:
        search_filter = (
            ScamReport.title.ilike(f"%{q}%")
            | ScamReport.description.ilike(f"%{q}%")
            | ScamReport.scam_content.ilike(f"%{q}%")
            | ScamReport.location.ilike(f"%{q}%")
        )
        query = query.filter(search_filter)

    return query.order_by(ScamReport.created_at.desc()).all()


@app.post("/reports/{report_id}/upvote", response_model=ScamReportUpvoteResponse)
@limiter.limit("20/minute")
def upvote_report(
    request: Request,
    report_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")

    db_report.upvotes += 1
    db.commit()
    db.refresh(db_report)
    return db_report


@app.get("/reports/{report_id}/comments", response_model=List[ScamCommentResponse])
def get_comments(
    report_id: int,
    db: Session = Depends(get_db),
):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    return (
        db.query(ScamComment)
        .filter(ScamComment.report_id == report_id)
        .order_by(ScamComment.created_at.asc())
        .all()
    )


@app.post("/reports/{report_id}/comments", response_model=ScamCommentResponse)
@limiter.limit("20/minute")
def create_comment(
    request: Request,
    report_id: int,
    comment: ScamCommentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    if _looks_like_spam(comment.content):
        raise HTTPException(status_code=400, detail="Comment rejected by spam filter.")
    duplicate = (
        db.query(ScamComment)
        .filter(ScamComment.report_id == report_id)
        .filter(ScamComment.author == comment.author)
        .filter(ScamComment.content == comment.content)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="An identical comment already exists.")
    db_comment = ScamComment(
        report_id=report_id,
        author=comment.author,
        content=comment.content,
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment


# ─── Admin / Moderation Routes ────────────────────────────────────────────────

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["email"].lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _get_report_or_404(db: Session, report_id: int) -> ScamReport:
    report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.post("/admin/reports/{report_id}/hide", response_model=ScamReportResponse)
def hide_report(report_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    report = _get_report_or_404(db, report_id)
    report.is_hidden = True
    db.commit()
    db.refresh(report)
    return report


@app.post("/admin/reports/{report_id}/unhide", response_model=ScamReportResponse)
def unhide_report(report_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    report = _get_report_or_404(db, report_id)
    report.is_hidden = False
    db.commit()
    db.refresh(report)
    return report


@app.delete("/admin/reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    report = _get_report_or_404(db, report_id)
    db.delete(report)  # comments cascade via relationship
    db.commit()
    return {"status": "deleted", "id": report_id}


@app.delete("/admin/reports/{report_id}/comments/{comment_id}")
def delete_comment(report_id: int, comment_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    _get_report_or_404(db, report_id)
    comment = (
        db.query(ScamComment)
        .filter(ScamComment.id == comment_id)
        .filter(ScamComment.report_id == report_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    db.commit()
    return {"status": "deleted", "id": comment_id}
