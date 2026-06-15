from datetime import datetime
from typing import Optional
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
