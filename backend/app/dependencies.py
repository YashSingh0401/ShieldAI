import os
import io
import re
import json
import socket
import ipaddress
import mimetypes
import logging
from datetime import datetime, time, timezone
from typing import Optional

from fastapi import HTTPException, UploadFile
from PIL import Image
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import FREE_DAILY_MEDIA_SCANS
from .models import ScanHistory

logger = logging.getLogger('shieldAI')


def _make_limiter() -> Limiter:
    redis_url = os.getenv('REDIS_URL', '').strip()
    if redis_url:
        try:
            lim = Limiter(key_func=get_remote_address, storage_uri=redis_url)
            try:
                import redis as _redis
                _r = _redis.from_url(redis_url, socket_connect_timeout=2)
                _r.ping()
                logger.info(f'Rate limiter: Redis enabled at {redis_url.split(chr(64))[-1]}')
            except Exception as e:
                logger.warning(f'Redis ping failed ({e}), limiter will still try Redis via limits')
            return lim
        except Exception as e:
            logger.warning(f'Redis limiter init failed ({e}), falling back to in-memory')
    logger.info('Rate limiter: in-memory (set REDIS_URL to enable persistent)')
    return Limiter(key_func=get_remote_address)


limiter = _make_limiter()


def _is_magic_image(data: bytes) -> bool:
    if len(data) < 12:
        return False
    if data[:3] == b'\xff\xd8\xff':
        return True
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return True
    if data[:4] == b'GIF8' and data[4:6] in (b'7a', b'9a'):
        return True
    if data[0:4] == b'RIFF' and data[8:12] == b'WEBP':
        return True
    if data[:4] in (b'II\x2a\x00', b'MM\x00\x2a'):
        return True
    if data[:2] == b'BM':
        return True
    if data[:4] == b'\x00\x00\x01\x00':
        return True
    if data[:4] == b'ftyp' and data[4:8] in (b'avif', b'avis', b'mif1', b'heic', b'heix', b'av1 ', b'av1'):
        return True
    return False


def validate_upload(file: UploadFile, allowed_types: set, max_mb: int):
    content_type = (file.content_type or '').split(';')[0].strip().lower()
    if content_type in ('', 'application/octet-stream'):
        guessed, _ = mimetypes.guess_type(file.filename or '')
        if guessed:
            content_type = guessed.lower()
    ext = os.path.splitext(file.filename or '')[1].lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.jfif', '.bmp', '.gif', '.ico', '.avif', '.heic'}
    video_exts = {'.mp4', '.webm', '.avi', '.mov', '.mkv', '.mpeg', '.mpg', '.m4v'}
    audio_exts = {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'}
    allowed_lower = {t.lower() for t in allowed_types}
    if content_type in allowed_lower:
        is_valid = True
    else:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
        if size == 0:
            raise HTTPException(status_code=400, detail='Empty file uploaded.')
        if size > max_mb * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f'File too large. Maximum size is {max_mb}MB.')
        data = file.file.read()
        size = len(data)
        file.file.seek(0)
        is_valid = False
        if 'image/jpeg' in allowed_types:
            if _is_magic_image(data):
                is_valid = True
            else:
                try:
                    img = Image.open(io.BytesIO(data))
                    img.verify()
                    is_valid = True
                except Exception:
                    pass
        elif 'video/mp4' in allowed_types:
            if ext in video_exts:
                is_valid = True
            elif size >= 12 and (data[4:8] == b'ftyp' or data[:4] == b'\x1aE\xdf\xa3' or data[:4] == b'AVI '):
                is_valid = True
        elif 'audio/mpeg' in allowed_types:
            if ext in audio_exts:
                is_valid = True
            elif size >= 4 and (data[:3] == b'ID3' or data[:4] == b'RIFF' or data[:4] == b'OggS' or data[:4] == b'fLaC' or (size >= 2 and data[0] == 0xff and (data[1] & 0xe0) == 0xe0)):
                is_valid = True
        if not is_valid:
            raise HTTPException(status_code=400, detail=f'Unsupported file type: {file.content_type or ext or chr(63)}. Allowed: {allowed_types}')
    MAX_BYTES = max_mb * 1024 * 1024
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size == 0:
        raise HTTPException(status_code=400, detail='Empty file uploaded.')
    if size > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f'File too large. Maximum size is {max_mb}MB.')


def save_scan_history(db: Session, scan_type: str, target: str, risk_score: float, status: str, user_email: Optional[str] = None, scan_payload: Optional[dict] = None) -> int:
    payload_str = None
    if scan_payload:
        clean_payload = {k: v for k, v in scan_payload.items() if k not in ('original', 'ela')}
        try:
            payload_str = json.dumps(clean_payload)
        except Exception:
            payload_str = None
    entry = ScanHistory(scan_type=scan_type, target=target, risk_score=risk_score, status=status, user_email=user_email.lower() if user_email else None, scan_payload=payload_str)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.id


def validate_safe_external_url(url_str: str) -> str:
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url_str)
    except Exception:
        raise HTTPException(status_code=400, detail='Malformed URL structure.')
    if parsed.scheme not in ('http', 'https'):
        raise HTTPException(status_code=400, detail='Only HTTP and HTTPS protocols are allowed.')
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail='URL is missing a valid hostname.')
    if hostname.lower() in ('localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'):
        raise HTTPException(status_code=400, detail='Targeting loopback or local infrastructure addresses is forbidden.')
    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for item in addr_info:
            ip_str = item[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
                raise HTTPException(status_code=400, detail='URL resolves to a private or internal network address.')
    except socket.gaierror:
        raise HTTPException(status_code=400, detail='Could not resolve domain. Verify domain is active and publicly registered.')
    return url_str


def enforce_media_quota(user: dict, db: Session):
    if FREE_DAILY_MEDIA_SCANS >= 900000:
        return
    day_start_utc = datetime.combine(datetime.now(timezone.utc).date(), time.min)
    used = (db.query(func.count(ScanHistory.id)).filter(ScanHistory.user_email == user['email'].lower(), ScanHistory.scan_type.in_(['image', 'video', 'audio']), ScanHistory.timestamp >= day_start_utc).scalar() or 0)
    if used >= FREE_DAILY_MEDIA_SCANS:
        raise HTTPException(status_code=402, detail={'code': 'quota_exceeded', 'limit': FREE_DAILY_MEDIA_SCANS, 'used': int(used), 'message': f'You have used all {FREE_DAILY_MEDIA_SCANS} free media scans for today.'})


_URL_RE = re.compile(r'https?://|www\.', re.IGNORECASE)
_CHAR_SPAM_RE = re.compile(r'(.)\1{24,}')


def looks_like_spam(text_content: str) -> bool:
    if len(_URL_RE.findall(text_content)) > 5:
        return True
    if _CHAR_SPAM_RE.search(text_content):
        return True
    return False
