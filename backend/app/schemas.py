from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel, Field, field_validator

class ScamReportBase(BaseModel):
    report_type: str = Field(..., description="Category of scam: phishing_link, scam_call, fake_app, fraud_website, other")
    title: str = Field(..., min_length=3, max_length=100, description="Short descriptive title of the scam")
    scam_content: Optional[str] = Field(None, description="The phone number, link, or email address involved")
    description: str = Field(..., min_length=10, description="Detailed description of the scam mechanism")
    location: Optional[str] = Field(None, description="City/State where the scam occurred")

class ScamReportCreate(ScamReportBase):
    @field_validator('report_type')
    @classmethod
    def validate_report_type(cls, v: str) -> str:
        allowed = {'phishing_link', 'scam_call', 'fake_app', 'fraud_website', 'other'}
        if v not in allowed:
            raise ValueError(f"report_type must be one of {allowed}")
        return v

class ScamReportResponse(ScamReportBase):
    id: int
    upvotes: int
    created_at: datetime

    # Pydantic configuration to enable reading ORM models directly
    model_config = {
        "from_attributes": True
    }

class ScamReportUpvoteResponse(BaseModel):
    id: int
    upvotes: int

    model_config = {
        "from_attributes": True
    }

class ScamCommentBase(BaseModel):
    author: str = Field(..., min_length=2, max_length=50, description="Author's name or username")
    content: str = Field(..., min_length=1, description="Comment text content")

class ScamCommentCreate(ScamCommentBase):
    pass

class ScamCommentResponse(ScamCommentBase):
    id: int
    report_id: int
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., description="Google OAuth credential JWT token")


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class ScanHistoryResponse(BaseModel):
    id: int
    scan_type: str
    target: str
    risk_score: float
    status: str
    timestamp: datetime

    model_config = {
        "from_attributes": True
    }

class AudioVerifyResponse(BaseModel):
    is_clean: bool
    filename: str
    risk_score: float
    risk_level: str
    pitch_variation: float
    pitch_status: str
    sample_rate: int
    sample_rate_anomaly: bool
    voice_clone_probability: float
    compression_warnings: list[str]
    anomalies: list[str]


class AuthResponse(BaseModel):
    token: str = Field(..., description="Session JWT token")
    user: Dict[str, str] = Field(..., description="User info (name, email, avatar)")
