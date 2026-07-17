from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, func
from sqlalchemy.orm import relationship
from .database import Base

class ScamReport(Base):
    __tablename__ = "scam_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    scam_content = Column(String, index=True, nullable=True)
    description = Column(Text, nullable=False)
    location = Column(String, index=True, nullable=True)
    upvotes = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationship to comments
    comments = relationship("ScamComment", back_populates="report", cascade="all, delete-orphan")

class ScamComment(Base):
    __tablename__ = "scam_comments"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("scam_reports.id"), nullable=False)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Reference back to parent report
    report = relationship("ScamReport", back_populates="comments")

class ScanHistory(Base):
    __tablename__ = "scan_history"

    id = Column(Integer, primary_key=True, index=True)
    scan_type = Column(String, nullable=False)
    target = Column(String, nullable=False)
    risk_score = Column(Float, nullable=False)
    status = Column(String, nullable=False)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)
