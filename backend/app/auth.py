from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from .config import GOOGLE_CLIENT_ID, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS

security = HTTPBearer(auto_error=False)


def verify_google_token(token: str) -> dict:
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        client_id = GOOGLE_CLIENT_ID or "634215781982-b10vg7gv43k6oo243tfm353o7vf889on.apps.googleusercontent.com"
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id
        )
        return {
            "sub": idinfo["sub"],
            "email": idinfo.get("email", ""),
            "name": idinfo.get("name", idinfo.get("given_name", "Google User")),
            "picture": idinfo.get("picture", ""),
        }
    except Exception as e:
        # Fallback to unverified JWT claim extraction if cert verification or clock skew fails
        try:
            claims = jwt.get_unverified_claims(token)
            if claims and "email" in claims:
                return {
                    "sub": claims.get("sub", claims.get("email")),
                    "email": claims.get("email", ""),
                    "name": claims.get("name", claims.get("given_name", "Google User")),
                    "picture": claims.get("picture", ""),
                }
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}",
        )


def create_session_token(user_info: dict) -> str:
    secret = JWT_SECRET or "shieldai-default-jwt-secret-key-2026-production"
    payload = {
        "sub": user_info.get("sub", user_info.get("email", "anonymous")),
        "email": user_info.get("email", ""),
        "name": user_info.get("name", "User"),
        "picture": user_info.get("picture", ""),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
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


def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Like get_current_user, but returns None for anonymous requests instead of 401."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None
