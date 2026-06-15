import io
import base64
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from PIL import Image

from .database import engine, get_db
from .models import Base, ScamReport, ScamComment
from .schemas import ScamReportCreate, ScamReportResponse, ScamReportUpvoteResponse, ScamCommentCreate, ScamCommentResponse
from .cv_engine import perform_ela, extract_exif, detect_ai_generation
from .url_engine import analyze_url
from .video_engine import analyze_video

# Auto-initialize database tables in SQLite
Base.metadata.create_all(bind=engine)

app = FastAPI(title="shieldAI API Server", version="1.0.0")

# Enable CORS for the local React development servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/verify/image")
async def verify_image(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        
        # 1. Safely parse EXIF tags
        metadata = extract_exif(image_bytes)
        
        # 2. Compute image compression anomalies via ELA
        ela_b64, risk_score, anomalies = perform_ela(image_bytes)

        # 3. Detect AI generation
        is_ai_generated, ai_probability, ai_indicators = detect_ai_generation(image_bytes, file.filename, metadata)
        
        # 3. Get original image format to formulate correct base64 data-URL
        try:
            img = Image.open(io.BytesIO(image_bytes))
            fmt = img.format.lower() if img.format else "jpeg"
        except Exception:
            fmt = "jpeg"
            
        original_b64 = f"data:image/{fmt};base64," + base64.b64encode(image_bytes).decode('utf-8')
        
        # 4. Correlate software markers and write warning logs
        has_exif = len(metadata) > 0 and "error" not in metadata
        
        # Inject standard placeholder metadata fields if empty
        formatted_metadata = {
            "Camera Model": "None",
            "Creator Software": "In-Camera Firmware",
            "Capture DateTime": "Unknown",
            "GPS Coordinates": "None"
        }
        if has_exif:
            # Map common EXIF fields to user-readable fields
            formatted_metadata = {
                "Camera Model": metadata.get("Model", "Unknown"),
                "Creator Software": metadata.get("Software", "Unknown"),
                "Capture DateTime": metadata.get("DateTime", "Unknown"),
                "ISO Speed Rating": metadata.get("ISOSpeedRatings", "Unknown"),
                "Focal Length": metadata.get("FocalLength", "Unknown"),
                "GPS Coordinates": "None"
            }
            if "GPSInfo" in metadata:
                formatted_metadata["GPS Coordinates"] = "Coordinates Extracted"

        is_clean = risk_score < 40
        if not is_clean:
            anomalies.append("Non-uniform compression thresholds (high ELA brightness around central object).")
            
        software = metadata.get("Software", "")
        if any(tool in software.lower() for tool in ["photoshop", "gimp", "adobe", "canva", "pixlr"]):
            is_clean = False
            risk_score = max(risk_score, 75)
            anomalies.append(f"Software flag indicates file modification ({software}).")
            
        risk_level = "Safe" if is_clean else "Critical Tampering Detected"
        
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
            "ai_indicators": ai_indicators
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {str(e)}")

@app.get("/verify/url")
def verify_url(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="URL query parameter is required")
    return analyze_url(url)

@app.post("/verify/video")
async def verify_video(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        return analyze_video(file.filename, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Video processing failed: {str(e)}")

@app.post("/reports", response_model=ScamReportResponse)
def create_report(report: ScamReportCreate, db: Session = Depends(get_db)):
    db_report = ScamReport(
        report_type=report.report_type,
        title=report.title,
        scam_content=report.scam_content,
        description=report.description,
        location=report.location
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

@app.get("/reports", response_model=List[ScamReportResponse])
def get_reports(
    report_type: str = "all",
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ScamReport)
    
    if report_type != "all":
        query = query.filter(ScamReport.report_type == report_type)
        
    if q:
        search_filter = (
            ScamReport.title.ilike(f"%{q}%") |
            ScamReport.description.ilike(f"%{q}%") |
            ScamReport.scam_content.ilike(f"%{q}%") |
            ScamReport.location.ilike(f"%{q}%")
        )
        query = query.filter(search_filter)
        
    # Newest reports first
    return query.order_by(ScamReport.created_at.desc()).all()

@app.post("/reports/{report_id}/upvote", response_model=ScamReportUpvoteResponse)
def upvote_report(report_id: int, db: Session = Depends(get_db)):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    db_report.upvotes += 1
    db.commit()
    db.refresh(db_report)
    return db_report

@app.get("/reports/{report_id}/comments", response_model=List[ScamCommentResponse])
def get_comments(report_id: int, db: Session = Depends(get_db)):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    return db.query(ScamComment).filter(ScamComment.report_id == report_id).order_by(ScamComment.created_at.asc()).all()

@app.post("/reports/{report_id}/comments", response_model=ScamCommentResponse)
def create_comment(report_id: int, comment: ScamCommentCreate, db: Session = Depends(get_db)):
    db_report = db.query(ScamReport).filter(ScamReport.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    db_comment = ScamComment(
        report_id=report_id,
        author=comment.author,
        content=comment.content
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

