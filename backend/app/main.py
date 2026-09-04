import os
import io
import re
import json
import socket
import ipaddress
import base64
import logging
import asyncio
import random
import mimetypes
from urllib.parse import urlparse
from datetime import datetime, time, timezone
import uuid
import httpx

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        }
        if record.exc_info and record.exc_info[0] is not None:
            log_obj["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

_handler = logging.StreamHandler()
_handler.setFormatter(JSONFormatter())
_root = logging.getLogger()
_root.handlers = [_handler]
_root.setLevel(logging.INFO)
logger = logging.getLogger("shieldAI")

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header, WebSocket, WebSocketDisconnect, Request, Response
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
    GoogleAuthRequest, AuthResponse, ImageUrlVerifyRequest
)
from .cv_engine import perform_ela, extract_exif, detect_ai_generation, prnu_fingerprint_score, detect_invisible_watermark
from .url_engine import analyze_url, semantic_phish_score, ct_log_threat_intel
from .video_engine import analyze_video
from .audio_engine import analyze_audio
from .auth import verify_google_token, create_session_token, get_current_user, get_optional_user
from .report_generator import generate_pdf_report
try:
    from .clip_engine import clip_coherence_score
except Exception:
    clip_coherence_score = None

ensure_schema_upgrades()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="shieldAI API Server", version="3.1.0")

# ─── Rate Limiter (Redis persistent if REDIS_URL set, else in-memory) ─────────
def _make_limiter():
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        try:
            # slowapi uses limits storage; storage_uri supports redis://
            lim = Limiter(key_func=get_remote_address, storage_uri=redis_url)
            # Test connection quickly if redis lib available
            try:
                import redis as _redis
                _r = _redis.from_url(redis_url, socket_connect_timeout=2)
                _r.ping()
                logger.info(f"Rate limiter: Redis enabled at {redis_url.split('@')[-1]}")
            except Exception as e:
                logger.warning(f"Redis ping failed ({e}), limiter will still try Redis via limits")
            return lim
        except Exception as e:
            logger.warning(f"Redis limiter init failed ({e}), falling back to in-memory")
    # Fallback memory
    logger.info("Rate limiter: in-memory (set REDIS_URL to enable persistent)")
    return Limiter(key_func=get_remote_address)

limiter = _make_limiter()
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

# ─── Request ID + Structured Access Logging Middleware ───────────────────────
@app.middleware("http")
async def add_request_id_and_log(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start = datetime.now(timezone.utc)
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
        status = getattr(response, "status_code", 500) if response else 500
        extra = {"request_id": request_id, "method": request.method, "path": request.url.path, "status": status, "duration_ms": round(duration_ms, 2)}
        # Attach request_id to response headers
        if response is not None:
            response.headers["X-Request-ID"] = request_id
        logger.info(f"{request.method} {request.url.path} -> {status} ({duration_ms:.1f}ms)", extra=extra)


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


@app.get("/health/deep")
def health_deep():
    """Deep health check: DB, ffmpeg, clip availability."""
    checks = {}
    # DB
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # ffmpeg
    try:
        from app.video_engine import _check_ffmpeg
        checks["ffmpeg"] = "ok" if _check_ffmpeg() else "missing (fallback active)"
    except Exception as e:
        checks["ffmpeg"] = f"error: {e}"

    # clip
    try:
        if clip_coherence_score is not None:
            checks["clip"] = "available" if os.getenv("ENABLE_CLIP") else "disabled (set ENABLE_CLIP=1)"
        else:
            checks["clip"] = "not installed (open-clip-torch missing)"
    except Exception as e:
        checks["clip"] = f"error: {e}"

    # overall
    overall = "ok" if checks.get("database") == "ok" else "degraded"
    return {"status": overall, "checks": checks, "version": app.version}


def _is_magic_image(data: bytes) -> bool:
    """Return True if data bytes match known image file signatures."""
    if len(data) < 12:
        return False
    if data[:3] == b"\xff\xd8\xff":          # JPEG
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":     # PNG
        return True
    if data[:4] == b"GIF8" and data[4:6] in (b"7a", b"9a"):  # GIF87a / GIF89a
        return True
    if data[0:4] == b"RIFF" and data[8:12] == b"WEBP":       # WebP
        return True
    if data[:4] in (b"II\x2a\x00", b"MM\x00\x2a"):          # TIFF (little-endian / big-endian)
        return True
    if data[:2] == b"BM":                                    # BMP
        return True
    if data[:4] == b"\x00\x00\x01\x00":                      # ICO
        return True
    return False


def validate_upload(file: UploadFile, allowed_types: set, max_mb: int):
    # ── Tier 1: Normalise content_type ──────────────────────────────────────
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type in ("", "application/octet-stream"):
        guessed, _ = mimetypes.guess_type(file.filename or "")
        if guessed:
            content_type = guessed.lower()

    ext = os.path.splitext(file.filename or "")[1].lower()

    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".jfif", ".bmp", ".gif", ".ico", ".avif", ".heic"}
    video_exts = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".mpeg", ".mpg", ".m4v"}
    audio_exts = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"}

    # ── Tier 2: Fast-path whitelist ─────────────────────────────────────────
    allowed_lower = {t.lower() for t in allowed_types}
    if content_type in allowed_lower:
        is_valid = True
    else:
        # ── Tier 3: Content sniffing ────────────────────────────────────────
        file.file.seek(0)
        data = file.file.read()
        size = len(data)
        file.file.seek(0)

        is_valid = False
        is_image_set = "image/jpeg" in allowed_types

        if is_image_set:
            magic_ok = _is_magic_image(data)
            pillow_ok = False
            try:
                img = Image.open(io.BytesIO(data))
                img.verify()
                pillow_ok = True
            except Exception:
                pass
            if magic_ok or pillow_ok:
                is_valid = True

        elif "video/mp4" in allowed_types:
            if ext in video_exts:
                is_valid = True
            elif size >= 12 and (
                data[4:8] == b"ftyp"            # MP4 / M4A / MOV
                or data[:4] == b"\x1aE\xdf\xa3"  # WebM / Matroska
                or data[:4] == b"AVI "            # AVI
            ):
                is_valid = True

        elif "audio/mpeg" in allowed_types:
            if ext in audio_exts:
                is_valid = True
            elif size >= 4 and (
                data[:3] == b"ID3"               # MP3 ID3v2
                or data[:4] == b"RIFF"            # WAV (RIFF container)
                or data[:4] == b"OggS"            # OGG
                or data[:4] == b"fLaC"            # FLAC
                or (size >= 2 and data[0] == 0xff and (data[1] & 0xe0) == 0xe0)  # MP3 frame sync
            ):
                is_valid = True

        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type or ext or 'unknown'}. Allowed: {allowed_types}",
            )

    # ── Size check ──────────────────────────────────────────────────────────
    MAX_BYTES = max_mb * 1024 * 1024
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if size > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {max_mb}MB.",
        )


def save_scan_history(
    db: Session,
    scan_type: str,
    target: str,
    risk_score: float,
    status: str,
    user_email: Optional[str] = None,
    scan_payload: Optional[dict] = None,
) -> int:
    payload_str = None
    if scan_payload:
        clean_payload = {k: v for k, v in scan_payload.items() if k not in ("original", "ela")}
        try:
            payload_str = json.dumps(clean_payload)
        except Exception:
            payload_str = None

    entry = ScanHistory(
        scan_type=scan_type,
        target=target,
        risk_score=risk_score,
        status=status,
        user_email=user_email.lower() if user_email else None,
        scan_payload=payload_str,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.id


def _validate_safe_external_url(url_str: str) -> str:
    """
    Prevents Server-Side Request Forgery (SSRF).
    Ensures URL uses HTTP/HTTPS and resolves only to public, non-internal IP addresses.
    """
    try:
        parsed = urlparse(url_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed URL structure.")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only HTTP and HTTPS protocols are allowed.")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="URL is missing a valid hostname.")

    if hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"):
        raise HTTPException(status_code=400, detail="Targeting loopback or local infrastructure addresses is forbidden.")

    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for item in addr_info:
            ip_str = item[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
                raise HTTPException(status_code=400, detail="URL resolves to a private or internal network address.")
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Could not resolve domain. Verify domain is active and publicly registered.")

    return url_str


def enforce_media_quota(user: dict, db: Session):
    """Daily limit — disabled when FREE_DAILY_MEDIA_SCANS is huge (unlimited mode). Low values still enforce for tests."""
    if FREE_DAILY_MEDIA_SCANS >= 900000:
        return
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

def _process_image(image_bytes: bytes, filename: str):
    metadata = extract_exif(image_bytes)
    ela_b64, risk_score, anomalies = perform_ela(image_bytes)
    is_ai_generated, ai_probability, ai_indicators = detect_ai_generation(image_bytes, filename, metadata)

    # Engine D — PRNU fingerprint
    try:
        prnu = prnu_fingerprint_score(image_bytes)
    except Exception as e:
        prnu = {"prnu_risk": 5, "prnu_signals": [f"PRNU error: {e}"]}

    # Engine G — Invisible watermark / C2PA
    try:
        watermark = detect_invisible_watermark(image_bytes)
    except Exception as e:
        watermark = {"watermark_detected": False, "watermark_signals": [f"Watermark error: {e}"], "confidence": 0}

    # Engine A — CLIP semantic coherence (gated by ENABLE_CLIP env)
    enable_clip = os.getenv("ENABLE_CLIP", "").strip().lower() in ("1", "true", "yes", "on")
    if enable_clip and clip_coherence_score is not None:
        try:
            clip = clip_coherence_score(image_bytes)
        except Exception as e:
            clip = {"coherence_score": 0.5, "incoherence_risk": 5, "is_incoherent": False, "probe_results": [], "clip_signals": [f"CLIP error: {e}"], "clip_available": True}
    else:
        if enable_clip and clip_coherence_score is None:
            clip = {"coherence_score": 0.5, "incoherence_risk": 5, "is_incoherent": False, "probe_results": [], "clip_signals": ["CLIP engine not available (open-clip-torch not installed)."], "clip_available": False}
        elif not enable_clip:
            clip = {"coherence_score": 0.5, "incoherence_risk": 5, "is_incoherent": False, "probe_results": [], "clip_signals": ["CLIP analysis disabled (set ENABLE_CLIP=1 to enable)."], "clip_available": False}
        else:
            clip = {"coherence_score": 0.5, "incoherence_risk": 5, "is_incoherent": False, "probe_results": [], "clip_signals": ["CLIP analysis unavailable."], "clip_available": False}

    return metadata, ela_b64, risk_score, anomalies, is_ai_generated, ai_probability, ai_indicators, prnu, watermark, clip


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

        (
            metadata,
            ela_b64,
            risk_score,
            anomalies,
            is_ai_generated,
            ai_probability,
            ai_indicators,
            prnu,
            watermark,
            clip,
        ) = await asyncio.to_thread(_process_image, image_bytes, file.filename)

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

        # Weighted secondary fusion (PRNU + watermark) — does not override ELA verdict
        # Only boost if PRNU indicates synthetic suspicion or watermark present (avoid +1 on clean tiny images)
        _prnu_risk = int(prnu.get("prnu_risk", 5)) if isinstance(prnu, dict) else 5
        _secondary_boost = 0
        # prnu_risk 5 is baseline (no evidence) — don't boost. 20+ is synthetic suspect.
        if _prnu_risk > 15:
            _secondary_boost += int(_prnu_risk * 0.25)
        if isinstance(watermark, dict) and watermark.get("watermark_detected"):
            _secondary_boost += 10
        if _secondary_boost:
            risk_score = min(98, max(5, risk_score + _secondary_boost))

        is_clean = risk_score < 40
        if not is_clean:
            anomalies.append("Non-uniform compression thresholds (high ELA brightness around central object).")

        if any(tool in software.lower() for tool in ["photoshop", "gimp", "adobe", "canva", "pixlr"]):
            is_clean = False
            risk_score = max(risk_score, 75)
            anomalies.append(f"Software flag indicates file modification ({software}).")

        risk_level = "Safe" if is_clean else "Critical Tampering Detected"
        status = "success" if is_clean else "danger"

        result = {
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
            "prnu": prnu,
            "watermark": watermark,
            "clip_coherence": clip,
        }

        scan_id = save_scan_history(
            db, "image", file.filename, float(risk_score), status,
            user_email=user["email"], scan_payload=result
        )
        result["scan_id"] = scan_id
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {str(e)}")


@app.post("/verify/image-url")
@limiter.limit("6/minute")
async def verify_image_url(
    request: Request,
    body: ImageUrlVerifyRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    url = body.url.strip()
    _validate_safe_external_url(url)
    enforce_media_quota(user, db)

    MAX_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "shieldAI-Security-Auditor/1.0"})
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to fetch image: HTTP status {resp.status_code}.")
            image_bytes = resp.content
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="Connection timed out while fetching image from the provided URL.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=400, detail=f"Network error while downloading image: {str(e)}")

    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="The remote server returned an empty file.")
    if len(image_bytes) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Image too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")

    if not _is_magic_image(image_bytes):
        try:
            img_probe = Image.open(io.BytesIO(image_bytes))
            img_probe.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="The fetched URL does not point to a supported image file format.")

    filename = os.path.basename(urlparse(url).path) or "hotlink_image.jpg"

    (
        metadata,
        ela_b64,
        risk_score,
        anomalies,
        is_ai_generated,
        ai_probability,
        ai_indicators,
        prnu,
        watermark,
        clip,
    ) = await asyncio.to_thread(_process_image, image_bytes, filename)

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

    # Weighted secondary fusion (PRNU + watermark) — only if synthetic evidence
    _prnu_risk = int(prnu.get("prnu_risk", 5)) if isinstance(prnu, dict) else 5
    _secondary_boost = 0
    if _prnu_risk > 15:
        _secondary_boost += int(_prnu_risk * 0.25)
    if isinstance(watermark, dict) and watermark.get("watermark_detected"):
        _secondary_boost += 10
    if _secondary_boost:
        risk_score = min(98, max(5, risk_score + _secondary_boost))

    is_clean = risk_score < 40
    if not is_clean:
        anomalies.append("Non-uniform compression thresholds (high ELA brightness around central object).")

    if any(tool in software.lower() for tool in ["photoshop", "gimp", "adobe", "canva", "pixlr"]):
        is_clean = False
        risk_score = max(risk_score, 75)
        anomalies.append(f"Software flag indicates file modification ({software}).")

    risk_level = "Safe" if is_clean else "Critical Tampering Detected"
    status = "success" if is_clean else "danger"

    result = {
        "is_clean": is_clean,
        "filename": filename,
        "source_url": url,
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
        "prnu": prnu,
        "watermark": watermark,
        "clip_coherence": clip,
    }

    scan_id = save_scan_history(
        db, "image", url, float(risk_score), status,
        user_email=user["email"], scan_payload=result
    )
    result["scan_id"] = scan_id
    return result


@app.get("/verify/url")
@limiter.limit("30/minute")
async def verify_url(request: Request, url: str, db: Session = Depends(get_db), user: Optional[dict] = Depends(get_optional_user)):
    if not url:
        raise HTTPException(status_code=400, detail="URL query parameter is required")
    # Lexical analysis (sync in thread)
    result = await asyncio.to_thread(analyze_url, url)
    # Extract domain for semantic + threat intel
    try:
        _p = urlparse(url if url.startswith(("http://","https://")) else "http://"+url)
        _domain = (_p.netloc or _p.path).lower()
        if _domain.startswith("www."):
            _domain = _domain[4:]
        if ":" in _domain:
            _domain = _domain.split(":")[0]
        _domain = _domain.split("/")[0]
    except Exception:
        _domain = result.get("domain") or url

    # Engine E — Semantic phish (sync)
    try:
        sem = await asyncio.to_thread(semantic_phish_score, url, _domain)
    except Exception as e:
        sem = {"phish_score": 5, "phish_signals": [f"Semantic error: {e}"], "domain": _domain}

    # Engine H — CT + Threat Intel (async, concurrent, warning-only on failure)
    try:
        intel = await ct_log_threat_intel(_domain)
    except Exception as e:
        intel = {"domain": _domain, "cert_age_days": None, "cert_recent": False, "intel_signals": [f"Threat intel error: {e} — warning only."]}

    # Merge Engine E into flags/score (weighted secondary)
    try:
        _phish_score = int(sem.get("phish_score", 0))
        result["semantic_phish"] = sem
        # Append phish signals to flags (danger if high)
        if _phish_score >= 20:
            for sig in sem.get("phish_signals", []):
                if "No semantic" not in sig:
                    result.setdefault("flags", []).append({"type": "danger" if _phish_score >= 40 else "warning", "text": f"[Semantic] {sig}"})
            # Weighted boost: 35% of phish_score, cap
            boost = int(_phish_score * 0.35)
            result["risk_score"] = min(98, int(result.get("risk_score",0)) + boost)
    except Exception:
        pass

    # Merge Engine H — warning-only boosts for positive hits only
    try:
        result["threat_intel"] = intel
        for sig in intel.get("intel_signals", []):
            # intel signals are info/warning by nature — add as info unless critical
            if "ACTIVE threat" in sig or "BLOCK" in sig:
                result.setdefault("flags", []).append({"type": "danger", "text": sig})
            elif "Unavailable" in sig or "skipped" in sig:
                result.setdefault("flags", []).append({"type": "info", "text": sig})
            else:
                result.setdefault("flags", []).append({"type": "info", "text": sig})
        # Score boosts for confirmed positives only
        if intel.get("cert_recent"):
            result["risk_score"] = min(98, int(result.get("risk_score",0)) + 25)
        urlhaus = intel.get("urlhaus") or {}
        if isinstance(urlhaus, dict) and urlhaus.get("status") == "listed" and urlhaus.get("count",0) > 0:
            result["risk_score"] = min(98, int(result.get("risk_score",0)) + 40)
    except Exception:
        pass

    # Recompute levelClass after boosts
    try:
        rs = int(result.get("risk_score",0))
        if rs < 30:
            result["risk_level"] = "Low Risk (Safe)"
            result["levelClass"] = "safe"
        elif rs < 70:
            result["risk_level"] = "Medium Risk (Suspicious)"
            result["levelClass"] = "suspicious"
        else:
            result["risk_level"] = "High Risk (Phishing Suspect)"
            result["levelClass"] = "phishing"
        result["is_clean"] = rs < 30
    except Exception:
        pass

    risk_score = result.get("risk_score", 0)
    is_clean = result.get("is_clean", risk_score < 50)
    status = "success" if is_clean else "danger"
    scan_id = save_scan_history(
        db, "url", url, float(risk_score), status,
        user_email=user["email"] if user else None, scan_payload=result
    )
    result["scan_id"] = scan_id
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
        result = await asyncio.to_thread(analyze_video, file.filename, file_bytes)
        status = "success" if result.get("is_clean") else "danger"
        scan_id = save_scan_history(
            db, "video", file.filename, float(result.get("risk_score", 0)), status,
            user_email=user["email"], scan_payload=result
        )
        result["scan_id"] = scan_id
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
        result = await asyncio.to_thread(analyze_audio, file.filename, file_bytes)
        status = "success" if result.get("is_clean") else "danger"
        scan_id = save_scan_history(
            db, "audio", file.filename, float(result.get("risk_score", 0)), status,
            user_email=user["email"], scan_payload=result
        )
        result["scan_id"] = scan_id
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio processing failed: {str(e)}")


@app.get("/verify/report/{scan_id}")
def get_scan_report(
    scan_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    entry = db.query(ScanHistory).filter(ScanHistory.id == scan_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Scan audit record not found.")
    if entry.user_email and entry.user_email.lower() != user["email"].lower():
        raise HTTPException(status_code=403, detail="Unauthorized: Access to this scan certificate is restricted.")

    payload = json.loads(entry.scan_payload) if entry.scan_payload else {}
    pdf_bytes = generate_pdf_report(
        scan_id=entry.id,
        scan_type=entry.scan_type,
        target=entry.target,
        risk_score=entry.risk_score,
        status=entry.status,
        timestamp=entry.timestamp,
        payload=payload,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="shieldAI_audit_certificate_{entry.id}.pdf"'
        },
    )


@app.websocket("/ws/scan-progress")
async def websocket_scan_progress(websocket: WebSocket):
    """
    Real-time scan progress WebSocket channel.
    Clients connect, send a start ping with asset type, and receive progressive telemetry stages.
    """
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        params = {}
        try:
            params = json.loads(data)
        except Exception:
            pass

        asset_type = params.get("type", "media")
        
        stages = [
            {"step": 1, "pct": 20, "stage": "Ingesting container bytes & verifying magic signatures"},
            {"step": 2, "pct": 45, "stage": "Running Error Level Analysis & spectral noise estimation"},
            {"step": 3, "pct": 70, "stage": "Evaluating Laplacian high-frequency gradient variance"},
            {"step": 4, "pct": 90, "stage": "Correlating multi-factor heuristic risk indices"},
            {"step": 5, "pct": 100, "stage": "Audit synthesis complete"},
        ]

        for s in stages:
            await asyncio.sleep(0.35)
            await websocket.send_json({
                "status": "in_progress" if s["pct"] < 100 else "completed",
                "progress": s["pct"],
                "stage": s["stage"],
                "step": s["step"],
                "total_steps": len(stages),
            })
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass


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


@app.get("/user/profile")
def get_user_profile(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Returns user profile details including today's quota usage, 
    lifetime scans count, threats detected count, and scan type breakdowns.
    """
    user_email = user["email"].lower()
    day_start_utc = datetime.combine(datetime.now(timezone.utc).date(), time.min)

    today_media_used = (
        db.query(func.count(ScanHistory.id))
        .filter(
            ScanHistory.user_email == user_email,
            ScanHistory.scan_type.in_(["image", "video", "audio"]),
            ScanHistory.timestamp >= day_start_utc,
        )
        .scalar() or 0
    )

    total_scans = (
        db.query(func.count(ScanHistory.id))
        .filter(ScanHistory.user_email == user_email)
        .scalar() or 0
    )

    threats_flagged = (
        db.query(func.count(ScanHistory.id))
        .filter(
            ScanHistory.user_email == user_email,
            ScanHistory.status == "danger",
        )
        .scalar() or 0
    )

    by_type = {}
    for t in ["image", "video", "url", "audio"]:
        by_type[t] = (
            db.query(func.count(ScanHistory.id))
            .filter(
                ScanHistory.user_email == user_email,
                ScanHistory.scan_type == t,
            )
            .scalar() or 0
        )

    return {
        "email": user["email"],
        "name": user.get("name", user["email"].split("@")[0]),
        "role": user.get("role", "Auditor"),
        "quota": {
            "limit": FREE_DAILY_MEDIA_SCANS,
            "used_today": int(today_media_used),
            "remaining_today": max(0, FREE_DAILY_MEDIA_SCANS - int(today_media_used)),
        },
        "stats": {
            "total_scans": int(total_scans),
            "threats_flagged": int(threats_flagged),
            "clean_verified": max(0, int(total_scans) - int(threats_flagged)),
            "by_type": by_type,
        }
    }


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
