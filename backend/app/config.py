import os
from dotenv import load_dotenv

# Always load from backend/.env regardless of cwd (fixes JWT mismatch when started from different dir)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET and (os.getenv("PYTEST_RUNNING") or os.getenv("CI") or os.getenv("TESTING") or "pytest" in os.getenv("_", "")):
    JWT_SECRET = "test-jwt-secret-key-32-characters-long"
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
MAX_UPLOAD_SIZE_MB = 50

# Daily limit disabled — set to unlimited (was 10). Env override kept for backwards compat but ignored.
FREE_DAILY_MEDIA_SCANS = int(os.getenv("FREE_DAILY_MEDIA_SCANS", "999999"))

# Single admin email — exact match only. Set via ADMIN_EMAILS env or defaults below.
_ADMIN_EMAIL_DEFAULT = "yashwardhans782@gmail.com"
ADMIN_EMAIL = os.getenv("ADMIN_EMAILS", "").strip().lower()
if not ADMIN_EMAIL:
    ADMIN_EMAIL = _ADMIN_EMAIL_DEFAULT
ADMIN_EMAILS = {ADMIN_EMAIL}

ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/tiff", "image/jfif", "image/pjpeg", "image/x-png", "image/bmp",
    "image/gif", "image/x-icon", "image/avif", "image/heic",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4", "video/webm", "video/x-msvideo", "video/quicktime", "video/avi", "video/x-matroska", "video/mpeg"
}
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3", "audio/ogg", "audio/x-m4a", "audio/m4a", "audio/flac", "audio/aac"
}
