import React, { useState } from 'react';
import { Upload, FileImage, ShieldAlert, CheckCircle, Info, Sliders, ChevronRight, Globe, Download, Columns, Layers, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import CertificateModal from '../components/CertificateModal';
import RiskScoreMeter from '../components/RiskScoreMeter';
import './ImageVerify.css';

export default function ImageVerify({ onVerify }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState(null);
  const [opacity, setOpacity] = useState(50);
  const [compareMode, setCompareMode] = useState('overlay'); // 'overlay' | 'split'
  const [splitSlider, setSplitSlider] = useState(50);
  const [batchQueue, setBatchQueue] = useState([]);
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
    toast.success("JSON report exported successfully!");
  };

  const exportPDF = async () => {
    if (result && result.scan_id) {
      const toastId = toast.loading("Generating official forensic PDF certificate...");
      try {
        const token = localStorage.getItem('shield_session_token');
        const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
        const res = await fetch(`${API_BASE}/verify/report/${result.scan_id}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error("Failed to generate PDF");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shieldAI_forensic_report_${result.scan_id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Forensic PDF report downloaded!", { id: toastId });
        return;
      } catch (e) {
        toast.dismiss(toastId);
      }
    }
    setShowCert(true);
  };

  const verifyImageUrl = async (url) => {
    if (!url || !url.trim()) return;

    setLoading(true);
    setLoadingStep(0);
    setResult(null);

    const steps = [
      setTimeout(() => setLoadingStep(1), 400),
      setTimeout(() => setLoadingStep(2), 900)
    ];

    try {
      const data = await api.post('/verify/image-url', { url: url.trim() });
      steps.forEach(clearTimeout);
      setLoadingStep(2);
      setResult(data);
      setLoading(false);
      toast.success(
        data.is_clean ? "Remote image verified: Clean source" : `Tampering detected (${data.risk_score}% risk)`,
        { icon: data.is_clean ? '🛡️' : '⚠️' }
      );

      if (onVerify) {
        onVerify({
          target: data.filename || url,
          result: data.risk_level,
          risk: data.risk_score,
          status: data.is_clean ? 'success' : 'danger'
        });
      }
    } catch (err) {
      steps.forEach(clearTimeout);
      console.error("Image URL verification failed:", err);
      toast.error(err.message || "Failed to analyze image from URL.");
      setLoading(false);
    }
  };

  const verifyImage = async (file) => {
    if (!file) return;

    setLoading(true);
    setLoadingStep(0);
    setResult(null);

    // Optional real-time WebSocket progress tracking (non-blocking)
    let ws = null;
    try {
      const wsUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/^http/, 'ws');
      ws = new WebSocket(`${wsUrl}/ws/scan-progress`);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'image', filename: file.name }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.progress !== undefined) {
            setLoadingStep(data.progress);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // Graceful fallback to timer steps
    }

    const steps = [
      setTimeout(() => setLoadingStep(1), 300),
      setTimeout(() => setLoadingStep(2), 650)
    ];

    try {
      const data = await api.upload('/verify/image', file);
      if (ws) ws.close();
      steps.forEach(clearTimeout);
      setLoadingStep(2);
      setResult(data);
      setLoading(false);
      toast.success(
        data.is_clean ? "Image verified: Clean source" : `Tampering detected (${data.risk_score}% risk)`,
        { icon: data.is_clean ? '🛡️' : '⚠️' }
      );

      if (onVerify) {
        onVerify({
          target: data.filename,
          result: data.risk_level,
          risk: data.risk_score,
          status: data.is_clean ? 'success' : 'danger'
        });
      }
    } catch (err) {
      if (ws) ws.close();
      steps.forEach(clearTimeout);
      console.error("Image verification failed:", err);
      toast.error(err.message || "Network error: Could not connect to the security backend.");
      setLoading(false);
    }
  };

  const processBatchFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

    if (fileList.length === 1) {
      verifyImage(fileList[0]);
      return;
    }

    // Initialize Batch Queue
    const initialQueue = Array.from(fileList).map((f, i) => ({
      id: `${f.name}-${i}-${Date.now()}`,
      file: f,
      name: f.name,
      status: i === 0 ? 'scanning' : 'queued', // queued | scanning | clean | danger | error
      result: null
    }));
    setBatchQueue(initialQueue);
    toast(`Queued ${fileList.length} files for batch scan`, { icon: '📁' });

    for (let i = 0; i < initialQueue.length; i++) {
      const item = initialQueue[i];
      setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'scanning' } : q));

      try {
        const data = await api.upload('/verify/image', item.file);
        const itemStatus = data.is_clean ? 'clean' : 'danger';
        setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: itemStatus, result: data } : q));

        if (i === 0) {
          setResult(data);
        }

        if (onVerify) {
          onVerify({
            target: data.filename,
            result: data.risk_level,
            risk: data.risk_score,
            status: itemStatus
          });
        }
      } catch {
        setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error' } : q));
      }
    }
    toast.success("Batch audit completed!");
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processBatchFiles(e.dataTransfer.files);
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
          {/* Tab Switcher */}
          <div className="tab-switch-group" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('upload')}
            >
              <Upload size={14} /> Upload File
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'url' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('url')}
            >
              <Globe size={14} /> Scan from URL
            </button>
          </div>

          {activeTab === 'upload' ? (
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
                <p>Supports JPEG / PNG / WebP up to 50MB</p>
                
                <div className="file-input-wrapper">
                  <label className="btn btn-primary" htmlFor="file-upload">
                    Select Local File
                  </label>
                  <input 
                    type="file" 
                    id="file-upload" 
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processBatchFiles(e.target.files);
                      }
                    }}
                    style={{ display: 'none' }} 
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Globe size={20} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>Scan Image from Public URL</h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                Paste any direct image URL (JPEG, PNG, WebP) to fetch and audit forensic tampering without downloading to disk.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyImageUrl(imageUrlInput);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com/photo.jpg"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !imageUrlInput.trim()}
                >
                  {loading ? 'Auditing Asset...' : 'Audit Remote Image'}
                </button>
              </form>
            </div>
          )}


          {/* Batch File Queue Card */}
          {batchQueue.length > 0 && (
            <div className="glass-card" style={{ padding: '16px 20px', marginTop: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  📁 Batch Audit Queue ({batchQueue.filter(q => q.status === 'clean' || q.status === 'danger').length}/{batchQueue.length})
                </span>
                <button 
                  type="button" 
                  className="btn btn-text btn-sm" 
                  onClick={() => setBatchQueue([])}
                  style={{ fontSize: '0.75rem', padding: '2px 6px', color: 'var(--text-muted)' }}
                >
                  Clear Queue
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {batchQueue.map((item, idx) => (
                  <div 
                    key={item.id || idx}
                    onClick={() => item.result && setResult(item.result)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: item.result ? 'var(--bg-widget-subtle)' : 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      cursor: item.result ? 'pointer' : 'default',
                      fontSize: '0.8rem'
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {item.name}
                    </span>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      {item.status === 'queued' && <span style={{ color: 'var(--text-muted)' }}>⏳ Queued</span>}
                      {item.status === 'scanning' && <span style={{ color: 'var(--accent)' }}>🔄 Scanning...</span>}
                      {item.status === 'clean' && <span style={{ color: 'var(--emerald)' }}>✅ Clean ({item.result?.risk_score}%)</span>}
                      {item.status === 'danger' && <span style={{ color: 'var(--rose)' }}>⚠️ Risk ({item.result?.risk_score}%)</span>}
                      {item.status === 'error' && <span style={{ color: 'var(--rose)' }}>❌ Error</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              
              <div className="score-block" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span className="score-label" style={{ fontSize: '0.85rem' }}>Image Integrity Risk Score:</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hover meter to inspect heuristic audit factors</span>
                </div>
                <RiskScoreMeter 
                  score={result.risk_score} 
                  size={96}
                  strokeWidth={8}
                  label=""
                  breakdown={result.anomalies && result.anomalies.length > 0 ? result.anomalies : ["Uniform ELA compression profile", "Standard pixel density distribution"]}
                />
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
                      <span className="sub">Noise signature and metadata indicators</span>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle className="status-icon success-color" size={24} />
                    <div>
                      <h4>Natural Capture</h4>
                      <span className="sub">No synthetic generation indicators found</span>
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

          {/* Engine D — PRNU Camera Fingerprint */}
          {result && result.prnu && (
            <div className={`glass-card result-summary-card ${result.prnu.prnu_risk > 30 ? 'tampered' : 'clean'}`} style={{ marginTop: '16px' }}>
              <div className="summary-header">
                {result.prnu.prnu_risk > 30 ? <ShieldAlert className="status-icon danger-color" size={24} /> : <CheckCircle className="status-icon success-color" size={24} />}
                <div>
                  <h4>PRNU Camera Analysis</h4>
                  <span className="sub">Sensor pattern noise fingerprint (Engine D)</span>
                </div>
              </div>
              <div className="score-block">
                <span className="score-label">PRNU Risk:</span>
                <span className={`score-value ${result.prnu.prnu_risk > 30 ? 'danger-color' : 'success-color'}`}>{result.prnu.prnu_risk}%</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', marginTop: '8px' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Noise Std:</span> <span style={{ fontWeight: 600 }}>{result.prnu.noise_std ?? '—'}</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Anisotropy:</span> <span style={{ fontWeight: 600 }}>{result.prnu.spatial_anisotropy ?? '—'}</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>DCT Entropy:</span> <span style={{ fontWeight: 600 }}>{result.prnu.dct_histogram_entropy ?? '—'}</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Level:</span> <span>{result.prnu.prnu_risk > 30 ? 'Synthetic Suspect' : 'Camera Consistent'}</span></div>
              </div>
              {result.prnu.prnu_signals && result.prnu.prnu_signals.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                  <ul style={{ paddingLeft: '16px', margin: 0 }}>
                    {result.prnu.prnu_signals.map((s, i) => <li key={i} style={{ marginBottom: '2px' }}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Engine G — Watermark / C2PA */}
          {result && result.watermark && (
            <div className={`glass-card result-summary-card ${result.watermark.watermark_detected ? 'tampered' : 'clean'}`} style={{ marginTop: '16px' }}>
              <div className="summary-header">
                {result.watermark.watermark_detected ? <ShieldAlert className="status-icon danger-color" size={24} /> : <CheckCircle className="status-icon success-color" size={24} />}
                <div>
                  <h4>Watermark / C2PA</h4>
                  <span className="sub">Invisible AI credentials (Engine G)</span>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '12px', background: result.watermark.watermark_detected ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)', color: result.watermark.watermark_detected ? 'var(--rose)' : 'var(--emerald)', fontWeight: 700 }}>
                  {result.watermark.watermark_detected ? 'DETECTED' : 'NONE'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                {result.watermark.watermark_type && <div><span style={{ color: 'var(--text-muted)' }}>Type:</span> {result.watermark.watermark_type}</div>}
                {result.watermark.ai_tool_identified && <div><span style={{ color: 'var(--text-muted)' }}>AI Tool:</span> <strong>{result.watermark.ai_tool_identified}</strong></div>}
                <div><span style={{ color: 'var(--text-muted)' }}>Confidence:</span> {result.watermark.confidence || 0}%</div>
              </div>
              {result.watermark.watermark_signals && result.watermark.watermark_signals.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                  <ul style={{ paddingLeft: '16px', margin: 0 }}>
                    {result.watermark.watermark_signals.map((s, i) => <li key={i} style={{ marginBottom: '2px' }}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Engine A — CLIP Coherence */}
          {result && result.clip_coherence && (
            <div className={`glass-card result-summary-card ${result.clip_coherence.is_incoherent ? 'tampered' : 'clean'}`} style={{ marginTop: '16px' }}>
              <div className="summary-header">
                {result.clip_coherence.is_incoherent ? <ShieldAlert className="status-icon danger-color" size={24} /> : <CheckCircle className="status-icon success-color" size={24} />}
                <div>
                  <h4>CLIP Semantic Coherence</h4>
                  <span className="sub">Vision-language sanity probes (Engine A)</span>
                </div>
                {!result.clip_coherence.clip_available && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '3px 7px', borderRadius: '10px', background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>OFFLINE</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <div style={{ fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Coherence:</span> <strong>{result.clip_coherence.coherence_score}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Incoherence Risk:</span> <strong style={{ color: result.clip_coherence.incoherence_risk > 50 ? 'var(--rose)' : 'var(--emerald)' }}>{result.clip_coherence.incoherence_risk}%</strong></div>
                </div>
                <RiskScoreMeter score={Math.round(result.clip_coherence.coherence_score * 100)} size={72} strokeWidth={6} label="Coherence" breakdown={result.clip_coherence.clip_signals} />
              </div>
              {result.clip_coherence.clip_signals && result.clip_coherence.clip_signals.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                  <ul style={{ paddingLeft: '16px', margin: 0 }}>
                    {result.clip_coherence.clip_signals.map((s, i) => <li key={i} style={{ marginBottom: '2px' }}>{s}</li>)}
                  </ul>
                  {result.clip_coherence.probe_results && result.clip_coherence.probe_results.length > 0 && (
                    <details style={{ marginTop: '6px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>Probe breakdown ({result.clip_coherence.probe_results.length})</summary>
                      <ul style={{ paddingLeft: '16px', margin: '6px 0 0' }}>
                        {result.clip_coherence.probe_results.slice(0,6).map((p, i) => <li key={i} style={{ fontSize: '0.75rem' }}>[{p.type}] {p.probe} → {p.similarity}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visualizer Column */}
        <div className="visualizer-column animate-fade-in cascade-3">
          {result ? (
            <div className="glass-card viewer-card">
              <div className="viewer-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3>ELA Comparison Console</h3>
                  {/* Mode Selector Toggle */}
                  <div style={{ display: 'inline-flex', background: 'var(--bg-muted)', padding: '2px', borderRadius: '6px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${compareMode === 'overlay' ? 'btn-primary' : 'btn-text'}`}
                      style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      onClick={() => setCompareMode('overlay')}
                      title="Overlay ELA Transparency"
                    >
                      <Layers size={13} style={{ marginRight: '4px' }} /> Overlay
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${compareMode === 'split' ? 'btn-primary' : 'btn-text'}`}
                      style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      onClick={() => setCompareMode('split')}
                      title="Side-by-Side Split Diff Slider"
                    >
                      <Columns size={13} style={{ marginRight: '4px' }} /> Split Diff
                    </button>
                  </div>
                </div>

                {compareMode === 'overlay' ? (
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
                ) : (
                  <div className="opacity-slider-group">
                    <Sliders size={16} className="slider-icon" />
                    <span className="slider-label">Split Position: {splitSlider}%</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={splitSlider}
                      onChange={(e) => setSplitSlider(e.target.value)}
                      className="opacity-range"
                    />
                  </div>
                )}
              </div>

              <div className="viewer-display">
                {compareMode === 'overlay' ? (
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
                ) : (
                  <div className="image-stack split-diff-stack" style={{ position: 'relative', overflow: 'hidden' }}>
                    {/* Base Clean Image */}
                    <img 
                      src={result.original} 
                      alt="Original Source" 
                      className="viewer-base-image"
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                    {/* Cropped ELA Layer on Top */}
                    <div 
                      style={{ 
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: `${splitSlider}%`,
                        overflow: 'hidden',
                        borderRight: '2px solid var(--accent)',
                        boxShadow: '4px 0 16px rgba(56, 189, 248, 0.4)'
                      }}
                    >
                      <img 
                        src={result.ela} 
                        alt="ELA Forensic Analysis" 
                        style={{ 
                          width: '100%',
                          minWidth: '100%',
                          height: 'auto',
                          display: 'block',
                          maxWidth: 'none'
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="display-legend">
                  {compareMode === 'overlay' ? (
                    <>
                      <span>← Original Image</span>
                      <span>Tampered ELA Highlights (glowing zones indicate pixel changes) →</span>
                    </>
                  ) : (
                    <>
                      <span>◀ Left: Forensic ELA Spectrum ({splitSlider}%)</span>
                      <span>Right: Original Capture ▶</span>
                    </>
                  )}
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
