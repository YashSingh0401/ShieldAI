import React, { useState } from 'react';
import { Upload, FileImage, ShieldAlert, CheckCircle, Info, Sliders, ChevronRight } from 'lucide-react';
import './ImageVerify.css';

// Base64 Mocks for the ELA Demo
const MOCK_ORIGINAL_CLEAN = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=60";
const MOCK_ELA_CLEAN = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' style='background:%23040409;'><path d='M10 80 Q 95 10 180 80 T 360 80' stroke='rgba(0,240,255,0.03)' stroke-width='4' fill='none'/><circle cx='300' cy='200' r='120' stroke='rgba(189,0,255,0.05)' stroke-dasharray='5,5' stroke-width='1.5' fill='none'/></svg>";

const MOCK_ORIGINAL_TAMPERED = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=60";
const MOCK_ELA_TAMPERED = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' style='background:%23040409;'><circle cx='320' cy='150' r='45' fill='rgba(0,240,255,0.45)' filter='blur(15px)'/><circle cx='320' cy='150' r='30' fill='rgba(255,255,255,0.9)'/><path d='M 250 150 L 390 150 M 320 80 L 320 220' stroke='rgba(208,0,255,0.7)' stroke-width='2' stroke-dasharray='4,4'/></svg>";

export default function ImageVerify({ onVerify }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState(null);
  const [opacity, setOpacity] = useState(50); // slider opacity

  const exportJSON = () => {
    if (!result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `shieldAI_image_report_${result.filename.replace(/\.[^/.]+$/, "")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportPDF = () => {
    window.print();
  };

  const mockVerify = (isClean) => {
    setLoading(true);
    setLoadingStep(0);
    setResult(null);

    // Simulate analysis timeline steps
    setTimeout(() => {
      setLoadingStep(1);
      setTimeout(() => {
        setLoadingStep(2);
        setTimeout(() => {
          setLoading(false);
          if (isClean) {
            const resultObj = {
              is_clean: true,
              filename: "nikon_d850_landscape.jpg",
              has_exif: true,
              risk_score: 8,
              risk_level: "Safe",
              metadata: {
                "Camera Model": "Nikon D850",
                "Creator Software": "In-Camera Firmware",
                "Capture DateTime": "2026:05:22 14:10:45",
                "ISO Speed Rating": "ISO 64",
                "Exposure Program": "Aperture Priority",
                "Focal Length": "24.0 mm",
                "GPS Coordinates": "None"
              },
              original: MOCK_ORIGINAL_CLEAN,
              ela: MOCK_ELA_CLEAN,
              is_ai_generated: false,
              ai_probability: 8,
              ai_indicators: []
            };
            setResult(resultObj);
            if (onVerify) {
              onVerify({
                target: resultObj.filename,
                result: resultObj.risk_level,
                risk: resultObj.risk_score,
                status: 'success'
              });
            }
          } else {
            const resultObj = {
              is_clean: false,
              filename: "spliced_ufo_lake.jpg",
              has_exif: true,
              risk_score: 82,
              risk_level: "Critical Tampering Detected",
              metadata: {
                "Camera Model": "Canon EOS 5D",
                "Creator Software": "Adobe Photoshop 24.1 (Windows)",
                "Capture DateTime": "2026:04:12 11:22:04",
                "ISO Speed Rating": "ISO 400",
                "Exposure Program": "Manual",
                "Focal Length": "50.0 mm",
                "GPS Coordinates": "40.7128° N, 74.0060° W"
              },
              original: MOCK_ORIGINAL_TAMPERED,
              ela: MOCK_ELA_TAMPERED,
              anomalies: [
                "Software flag indicates file modification (Adobe Photoshop CC).",
                "Non-uniform compression thresholds (high ELA brightness around central object).",
                "Exif timestamps mismatch with file modification headers."
              ],
              is_ai_generated: true,
              ai_probability: 72,
              ai_indicators: [
                "Total absence of camera hardware metadata headers",
                "Extremely low sensor noise variance (indicates synthetic rendering)"
              ]
            };
            setResult(resultObj);
            if (onVerify) {
              onVerify({
                target: resultObj.filename,
                result: resultObj.risk_level,
                risk: resultObj.risk_score,
                status: 'danger'
              });
            }
          }
        }, 1000);
      }, 1000);
    }, 800);
  };

  const verifyImage = async (file) => {
    if (!file) return;

    setLoading(true);
    setLoadingStep(0);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const steps = [
      setTimeout(() => setLoadingStep(1), 300),
      setTimeout(() => setLoadingStep(2), 650)
    ];

    try {
      const res = await fetch("http://127.0.0.1:8000/verify/image", {
        method: "POST",
        body: formData
      });

      steps.forEach(clearTimeout);
      setLoadingStep(2);

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setLoading(false);

        if (onVerify) {
          onVerify({
            target: data.filename,
            result: data.risk_level,
            risk: data.risk_score,
            status: data.is_clean ? 'success' : 'danger'
          });
        }
      } else {
        const errorText = await res.text();
        console.error("API error:", errorText);
        alert("Integrity scan failed: Server responded with an error.");
        setLoading(false);
      }
    } catch (err) {
      steps.forEach(clearTimeout);
      console.error("Image verification failed:", err);
      alert("Network error: Could not connect to the security backend.");
      setLoading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      verifyImage(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="image-verify-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Image Authentication</h1>
        <p className="page-subtitle">Analyze compression error levels (ELA) and extract original metadata headers.</p>
      </header>

      {/* Demo Selector Buttons */}
      <div className="demo-selector animate-fade-in cascade-1">
        <span className="demo-label">Verify Sample Demos:</span>
        <button onClick={() => mockVerify(true)} className="btn btn-secondary btn-sm">
          Clean Photo (Camera EXIF)
        </button>
        <button onClick={() => mockVerify(false)} className="btn btn-secondary btn-sm highlight-tamper">
          Manipulated Image (Photoshop Spliced)
        </button>
      </div>

      <div className="verify-layout">
        
        {/* Upload Column */}
        <div className="upload-column animate-fade-in cascade-2">
          <div 
            className={`glass-card drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <div className="drop-zone-content">
              <Upload size={48} className="upload-icon" />
              <h3>Drag & Drop Image Here</h3>
              <p>Supports JPEG / PNG up to 15MB</p>
              
              <div className="file-input-wrapper">
                <label className="btn btn-primary" htmlFor="file-upload">
                  Select Local File
                </label>
                <input 
                  type="file" 
                  id="file-upload" 
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      verifyImage(e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }} 
                />
              </div>
            </div>
          </div>


          {/* Verification Progress Loading */}
          {loading && (
            <div className="glass-card loading-card">
              <div className="spinner"></div>
              <h3>Analyzing Security Integrity</h3>
              <div className="loading-steps">
                <div className={`step-item ${loadingStep >= 0 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Extracting EXIF and Header Tables...
                </div>
                <div className={`step-item ${loadingStep >= 1 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Running Error Level Analysis (ELA)...
                </div>
                <div className={`step-item ${loadingStep >= 2 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Correlating risk values...
                </div>
              </div>
            </div>
          )}

          {/* Results Summary Info Panel */}
          {result && (
            <div className={`glass-card result-summary-card ${result.is_clean ? 'clean' : 'tampered'}`}>
              <div className="summary-header">
                {result.is_clean ? (
                  <>
                    <CheckCircle className="status-icon success-color" size={24} />
                    <div>
                      <h4>Asset Verified Authentic</h4>
                      <span className="sub">Consistent pixel compression profile</span>
                    </div>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="status-icon danger-color" size={24} />
                    <div>
                      <h4>Tampering Detected</h4>
                      <span className="sub">Compression differences indicating editing</span>
                    </div>
                  </>
                )}
              </div>
              
              <div className="score-block">
                <span className="score-label">Image Integrity Risk Score:</span>
                <span className={`score-value ${result.is_clean ? 'success-color' : 'danger-color'}`}>
                  {result.risk_score}%
                </span>
              </div>
            </div>
          )}

          {/* AI Generation Detector Panel */}
          {result && (
            <div className={`glass-card result-summary-card ${result.is_ai_generated ? 'tampered' : 'clean'}`} style={{ marginTop: '16px' }}>
              <div className="summary-header">
                {result.is_ai_generated ? (
                  <>
                    <ShieldAlert className="status-icon danger-color" size={24} />
                    <div>
                      <h4>AI Generation Detected</h4>
                      <span className="sub">Synthetic rendering / GAN noise pattern matched</span>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle className="status-icon success-color" size={24} />
                    <div>
                      <h4>Natural Capture Verified</h4>
                      <span className="sub">Matches physical camera sensor properties</span>
                    </div>
                  </>
                )}
              </div>
              
              <div className="score-block">
                <span className="score-label">AI Generation Probability:</span>
                <span className={`score-value ${result.is_ai_generated ? 'danger-color' : 'success-color'}`}>
                  {result.ai_probability || 0}%
                </span>
              </div>

              {result.ai_indicators && result.ai_indicators.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>AI Detection Indicators:</span>
                  <ul style={{ paddingLeft: '16px', margin: 0 }}>
                    {result.ai_indicators.map((ind, idx) => (
                      <li key={idx} style={{ marginBottom: '2px' }}>{ind}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visualizer Column */}
        <div className="visualizer-column animate-fade-in cascade-3">
          {result ? (
            <div className="glass-card viewer-card">
              <div className="viewer-header">
                <h3>ELA Comparison Console</h3>
                <div className="opacity-slider-group">
                  <Sliders size={16} className="slider-icon" />
                  <span className="slider-label">Overlay ELA: {opacity}%</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={opacity}
                    onChange={(e) => setOpacity(e.target.value)}
                    className="opacity-range"
                  />
                </div>
              </div>

              <div className="viewer-display">
                <div className="image-stack">
                  {/* Original Base Image */}
                  <img 
                    src={result.original} 
                    alt="Original" 
                    className="viewer-base-image"
                  />
                  {/* ELA Transparency Overlay Layer */}
                  <div 
                    className="viewer-ela-layer"
                    style={{ 
                      opacity: opacity / 100,
                      backgroundImage: `url(${result.ela})`
                    }}
                  ></div>
                </div>
                <div className="display-legend">
                  <span>← Original Image</span>
                  <span>Tampered ELA Highlights (glowing zones indicate pixel changes) →</span>
                </div>
              </div>

              {/* AI Generation Detector Section */}
              <div className="anomalies-section" style={{
                background: result.is_ai_generated ? 'rgba(244, 63, 94, 0.03)' : 'rgba(16, 185, 129, 0.03)',
                borderColor: result.is_ai_generated ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: result.is_ai_generated ? 'var(--rose)' : 'var(--emerald)',
                marginTop: '16px'
              }}>
                <h4 style={{ color: result.is_ai_generated ? 'var(--rose)' : 'var(--emerald)', marginBottom: '8px' }}>
                  AI Generation Analysis: {result.is_ai_generated ? 'Synthetic Rendering Match' : 'Authentic/Natural Source'}
                </h4>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)' }}>
                  AI Probability: <span style={{ color: result.is_ai_generated ? 'var(--rose)' : 'var(--emerald)' }}>{result.ai_probability || 0}%</span>
                </div>
                {result.ai_indicators && result.ai_indicators.length > 0 && (
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                    <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>AI Signatures Found:</span>
                    <ul style={{ paddingLeft: '16px', margin: 0 }}>
                      {result.ai_indicators.map((ind, idx) => (
                        <li key={idx} style={{ marginBottom: '2px', color: 'var(--text-secondary)' }}>{ind}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Anomalies List */}
              {!result.is_clean && result.anomalies && (
                <div className="anomalies-section">
                  <h4>Flagged Integrity Risks</h4>
                  <ul className="anomalies-list">
                    {result.anomalies.map((anom, idx) => (
                      <li key={idx}><span className="bullet"></span> {anom}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metadata Panel */}
              <div className="metadata-section">
                <h4>EXIF Metadata Header Tree</h4>
                <div className="metadata-grid">
                  {Object.entries(result.metadata).map(([key, val]) => (
                    <div key={key} className="meta-row">
                      <span className="meta-key">{key}</span>
                      <span className="meta-value">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Buttons */}
              <div className="export-actions-group" style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                <button onClick={exportJSON} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                  Export JSON Report
                </button>
                <button onClick={exportPDF} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  Export PDF Certificate
                </button>
              </div>


            </div>
          ) : (
            <div className="glass-card viewer-placeholder">
              <FileImage size={64} className="placeholder-icon" />
              <h3>Visualizer Inactive</h3>
              <p>Upload a file or select a mock sample to inspect metadata logs and view the ELA grid overlay.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
