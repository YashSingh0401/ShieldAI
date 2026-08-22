import os
from dotenv import load_dotenv

load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID") or "634215781982-b10vg7gv43k6oo243tfm353o7vf889on.apps.googleusercontent.com"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
JWT_SECRET = os.getenv("JWT_SECRET") or "shieldai-default-jwt-secret-key-2026-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
MAX_UPLOAD_SIZE_MB = 50
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/x-msvideo"}
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3"}
