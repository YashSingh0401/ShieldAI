import io
import json
import hashlib
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_pdf_report(
    scan_id: int,
    scan_type: str,
    target: str,
    risk_score: float,
    status: str,
    timestamp: datetime,
    payload: Optional[dict] = None
) -> bytes:
    """
    Generates a professional forensic PDF report using reportlab.
    Returns the binary PDF byte array.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0f172a'),
    )
    subtitle_style = ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748b'),
    )
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
    )
    bold_body = ParagraphStyle(
        'BoldBody',
        parent=body_style,
        fontName='Helvetica-Bold',
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("SHIELDAI FORENSIC AUDIT CERTIFICATE", title_style))
    story.append(Paragraph("Official Tamper-Detection & Deepfake Verification Record", subtitle_style))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#2563eb'), spaceAfter=14))

    # 2. Executive Verdict Box
    is_clean = status.lower() in ("success", "clean", "safe") or risk_score < 40
    verdict_text = "AUTHENTIC / LOW RISK" if is_clean else "CRITICAL TAMPERING / SUSPECT"
    verdict_color = colors.HexColor('#059669') if is_clean else colors.HexColor('#dc2626')
    verdict_bg = colors.HexColor('#ecfdf5') if is_clean else colors.HexColor('#fef2f2')

    verdict_style = ParagraphStyle(
        'Verdict',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=verdict_color,
        alignment=1, # Center
    )

    score_str = f"Composite Threat Index: {int(risk_score)}/100"
    score_style = ParagraphStyle(
        'Score',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor('#1e293b'),
        alignment=1,
    )

    verdict_table = Table(
        [
            [Paragraph(f"VERDICT: {verdict_text}", verdict_style)],
            [Paragraph(score_str, score_style)]
        ],
        colWidths=[530]
    )
    verdict_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), verdict_bg),
        ('BOX', (0, 0), (-1, -1), 1.5, verdict_color),
        ('PADDING', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(verdict_table)
    story.append(Spacer(1, 16))

    # 3. Audit Overview Table
    ts_str = timestamp.strftime('%Y-%m-%d %H:%M:%S UTC') if hasattr(timestamp, 'strftime') else str(timestamp)
    sha_hash = hashlib.sha256(f"{scan_id}:{target}:{ts_str}".encode()).hexdigest()[:24].upper()

    overview_data = [
        [Paragraph("Audit ID:", bold_body), Paragraph(f"SHIELD-{scan_id:06d}", body_style),
         Paragraph("Scan Date:", bold_body), Paragraph(ts_str, body_style)],
        [Paragraph("Asset Type:", bold_body), Paragraph(scan_type.upper(), body_style),
         Paragraph("Algorithm:", bold_body), Paragraph("shieldAI Multi-Heuristic Engine v1.0", body_style)],
        [Paragraph("Asset Target:", bold_body), Paragraph(str(target)[:40], body_style),
         Paragraph("Security Hash:", bold_body), Paragraph(sha_hash, body_style)],
    ]

    overview_table = Table(overview_data, colWidths=[90, 175, 95, 170])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 16))

    # 4. Findings & Anomalies Section
    story.append(Paragraph("Automated Forensic Findings & Anomalies", section_heading))
    anomalies = []
    if payload:
        anomalies = payload.get("anomalies") or []
        if not anomalies and "flags" in payload:
            anomalies = [f.get("text", "") for f in payload.get("flags", [])]

    if anomalies:
        finding_rows = []
        for a in anomalies:
            finding_rows.append([Paragraph("•", bold_body), Paragraph(str(a), body_style)])
        findings_table = Table(finding_rows, colWidths=[20, 510])
        findings_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(findings_table)
    else:
        story.append(Paragraph("No compression discrepancies, synthetic signatures, or structural tampering identified across tested layers.", body_style))

    story.append(Spacer(1, 16))

    # 5. Metadata / Technical Attributes (if present)
    meta_dict = {}
    if payload and isinstance(payload.get("metadata"), dict):
        meta_dict = payload.get("metadata")
    elif payload and isinstance(payload.get("live_meta"), dict):
        meta_dict = payload.get("live_meta")

    if meta_dict:
        story.append(Paragraph("Extracted Hardware & Protocol Indicators", section_heading))
        meta_rows = []
        items = list(meta_dict.items())[:8] # Up to 8 items
        for i in range(0, len(items), 2):
            k1, v1 = items[i]
            k2, v2 = items[i+1] if i+1 < len(items) else ("", "")
            meta_rows.append([
                Paragraph(str(k1), bold_body), Paragraph(str(v1), body_style),
                Paragraph(str(k2), bold_body), Paragraph(str(v2), body_style),
            ])
        if meta_rows:
            meta_table = Table(meta_rows, colWidths=[110, 155, 110, 155])
            meta_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                ('PADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(meta_table)
            story.append(Spacer(1, 16))

    # 6. Legal & Disclaimer Footer
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#94a3b8'), spaceAfter=8))
    footer_text = (
        "<b>Notice:</b> This document was generated automatically by the ShieldAI Verification Portal. "
        "Error Level Analysis (ELA), Shannon Entropy, and deepfake heuristic models estimate manipulation "
        "probabilities based on mathematical artifacts and should be correlated with external evidence."
    )
    story.append(Paragraph(footer_text, subtitle_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
