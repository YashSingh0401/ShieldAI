import React, { useState } from 'react';
import { Upload, FileImage, ShieldAlert, CheckCircle, Info, Sliders, ChevronRight } from 'lucide-react';
import { api } from '../api/client.js';
import CertificateModal from '../components/CertificateModal';
import './ImageVerify.css';

export default function ImageVerify({ onVerify }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState(null);
  const [opacity, setOpacity] = useState(50);
  const [showCert, setShowCert] = useState(false);

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
    setShowCert(true);
  };

  const verifyImage = async (file) => {
    if (!file) return;

    setLoading(true);
    setLoadingStep(0);
    setResult(null);

    const steps = [
      setTimeout(() => setLoadingStep(1), 300),
      setTimeout(() => setLoadingStep(2), 650)
    ];

    try {
      const data = await api.upload('/verify/image', file);
      steps.forEach(clearTimeout);
      setLoadingStep(2);
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
    } catch (err) {
      steps.forEach(clearTimeout);
      console.error("Image verification failed:", err);
      alert(err.message || "Network error: Could not connect to the security backend.");
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
              <p>Upload a file to inspect metadata logs and view the ELA grid overlay.</p>
            </div>
          )}
        </div>

      </div>

      {showCert && result && (
        <CertificateModal
          result={result}
          scanType="image"
          onClose={() => setShowCert(false)}
        />
      )}
    </div>
  );
}
