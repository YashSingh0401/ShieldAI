import io
import base64
import logging
import asyncio
import random

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from PIL import Image

from .config import FRONTEND_URL, GOOGLE_CLIENT_ID, MAX_UPLOAD_SIZE_MB, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_AUDIO_TYPES
from .database import engine, get_db
from .models import Base, ScamReport, ScamComment, ScanHistory
from .schemas import (
    ScamReportCreate, ScamReportResponse, ScamReportUpvoteResponse,
    ScamCommentCreate, ScamCommentResponse, ScanHistoryResponse, AudioVerifyResponse,
    LoginRequest, GoogleAuthRequest, AuthResponse,
)
from .cv_engine import perform_ela, extract_exif, detect_ai_generation
from .url_engine import analyze_url
from .video_engine import analyze_video
from .audio_engine import analyze_audio
from .auth import verify_google_token, create_session_token, get_current_user

Base.metadata.create_all(bind=engine)

app = FastAPI(title="shieldAI API Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
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


def save_scan_history(db: Session, scan_type: str, target: str, risk_score: float, status: str):
    entry = ScanHistory(
        scan_type=scan_type,
        target=target,
        risk_score=risk_score,
        status=status,
    )
    db.add(entry)
    db.commit()


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.post("/auth/google", response_model=AuthResponse)
async def auth_google(request: GoogleAuthRequest):
    user_info = verify_google_token(request.credential)
    token = create_session_token(user_info)
    return AuthResponse(
        token=token,
        user={"name": user_info["name"], "email": user_info["email"], "avatar": user_info.get("picture", "")},
    )


@app.post("/auth/login", response_model=AuthResponse)
async def auth_login(request: LoginRequest):
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    user_info = {
        "sub": request.email,
        "email": request.email,
        "name": request.email.split("@")[0],
        "picture": "",
    }
    token = create_session_token(user_info)
    return AuthResponse(
        token=token,
        user={"name": user_info["name"], "email": user_info["email"], "avatar": ""},
    )


# ─── Verify Routes ────────────────────────────────────────────────────────────

@app.post("/verify/image")
async def verify_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_upload(file, ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_MB)
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
        save_scan_history(db, "image", file.filename, float(risk_score), status)

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
def verify_url(url: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if not url:
        raise HTTPException(status_code=400, detail="URL query parameter is required")
    result = analyze_url(url)
    risk_score = result.get("risk_score", 0)
    is_clean = result.get("is_clean", risk_score < 50)
    status = "success" if is_clean else "danger"
    save_scan_history(db, "url", url, float(risk_score), status)
    return result


@app.post("/verify/video")
async def verify_video(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_upload(file, ALLOWED_VIDEO_TYPES, MAX_UPLOAD_SIZE_MB)
    try:
        file_bytes = await file.read()
        result = analyze_video(file.filename, file_bytes)
        status = "success" if result.get("is_clean") else "danger"
        save_scan_history(db, "video", file.filename, float(result.get("risk_score", 0)), status)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Video processing failed: {str(e)}")


@app.post("/verify/audio", response_model=AudioVerifyResponse)
async def verify_audio(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_audio = ALLOWED_AUDIO_TYPES | {"application/octet-stream"}
    validate_upload(file, allowed_audio, MAX_UPLOAD_SIZE_MB)
    try:
        file_bytes = await file.read()
        result = analyze_audio(file.filename, file_bytes)
        status = "success" if result.get("is_clean") else "danger"
        save_scan_history(db, "audio", file.filename, float(result.get("risk_score", 0)), status)
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
    query = db.query(ScanHistory)
    if scan_type:
        query = query.filter(ScanHistory.scan_type == scan_type)
    return query.order_by(ScanHistory.timestamp.desc()).all()


# ─── Report Routes ────────────────────────────────────────────────────────────

@app.post("/reports", response_model=ScamReportResponse)
def create_report(
    report: ScamReportCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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
    query = db.query(ScamReport)

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
def upvote_report(
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
def create_comment(
    report_id: int,
    comment: ScamCommentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    db_comment = ScamComment(
        report_id=report_id,
        author=comment.author,
        content=comment.content,
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment
