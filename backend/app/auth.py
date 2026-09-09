from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from .config import GOOGLE_CLIENT_ID, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS, ADMIN_EMAILS

security = HTTPBearer(auto_error=False)


def verify_google_token(token: str) -> dict:
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        if not GOOGLE_CLIENT_ID:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google OAuth not configured",
            )
        client_id = GOOGLE_CLIENT_ID
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id
        )
        return {
            "sub": idinfo["sub"],
            "email": idinfo.get("email", ""),
            "name": idinfo.get("name", idinfo.get("given_name", "Google User")),
            "picture": idinfo.get("picture", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}",
        )


def create_session_token(user_info: dict) -> str:
    secret = JWT_SECRET
    if not secret:
        raise RuntimeError("JWT_SECRET must be configured")
    email = user_info.get("email", "").lower()
    is_admin = email in ADMIN_EMAILS
    payload = {
        "sub": user_info.get("sub", user_info.get("email", "anonymous")),
        "email": user_info.get("email", ""),
        "name": user_info.get("name", "User"),
        "picture": user_info.get("picture", ""),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
        "is_admin": is_admin,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret is not configured on this server",
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "sub": payload.get("sub"),
            "email": payload.get("email", ""),
            "name": payload.get("name", "User"),
            "picture": payload.get("picture", ""),
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )


def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Return user dict if admin, else raise 403."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret is not configured on this server",
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("email", "").lower()
        is_admin = email in ADMIN_EMAILS
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        return {
            "sub": payload.get("sub"),
            "email": payload.get("email", ""),
            "name": payload.get("name", "User"),
            "picture": payload.get("picture", ""),
            "is_admin": True,
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )


def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Like get_current_user, but returns None for anonymous requests instead of 401."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None
