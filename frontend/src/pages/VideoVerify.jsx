import React, { useState, useRef } from 'react';
import { Upload, Film, ShieldAlert, CheckCircle, ChevronRight, Sliders, Play, RotateCw, Pause, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import CertificateModal from '../components/CertificateModal';
import './VideoVerify.css';

export default function VideoVerify({ onVerify }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [wsProgress, setWsProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [showCert, setShowCert] = useState(false);
  const videoRef = useRef(null);

  const exportJSON = () => {
    if (!result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `shieldAI_video_report_${result.filename.replace(/\.[^/.]+$/, "")}.json`);
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

  const verifyVideo = async (file) => {
    if (!file) return;

    setLoading(true);
    setLoadingStep(0);
    setResult(null);
    setIsPlaying(false);

    // Create preview URL for uploaded video
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    // Connect to real-time WebSocket progress stream
    let ws = null;
    try {
      const wsUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/^http/, 'ws');
      ws = new WebSocket(`${wsUrl}/ws/scan-progress`);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'video', filename: file.name }));
      };
      ws.onmessage = (event) => {
        try {
          const telemetry = JSON.parse(event.data);
          setWsProgress(telemetry);
        } catch {
          // ignore
        }
      };
    } catch {
      // Graceful fallback to static timeout steps
    }

    const steps = [
      setTimeout(() => setLoadingStep(1), 300),
      setTimeout(() => setLoadingStep(2), 650),
      setTimeout(() => setLoadingStep(3), 1000)
    ];

    try {
      const data = await api.upload('/verify/video', file);
      if (ws) ws.close();
      steps.forEach(clearTimeout);
      setLoadingStep(3);
      setResult(data);
      setLoading(false);
      setWsProgress(null);
      toast.success(
        data.is_clean ? "Video verified: Clean container & timeline" : `Tampering detected (${data.risk_score}% risk)`,
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
      setWsProgress(null);
      console.error("Video verification failed:", err);
      toast.error(err.message || "Network error: Could not connect to the security backend.");
      setLoading(false);
    }
  };

  const toggleVideoPlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
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
      verifyVideo(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="video-verify-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Video Deepfake Auditor</h1>
        <p className="page-subtitle">Scan video frames for compression anomalies, double encoding, and timeline splicing.</p>
      </header>

      <div className="verify-layout">
        
        {/* Left Column: Upload Zone */}
        <div className="upload-column animate-fade-in cascade-2">
          <div 
            className={`glass-card drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <div className="drop-zone-content">
              <Film size={48} className="upload-icon" />
              <h3>Drag & Drop Video Here</h3>
              <p>Supports MP4 / WebM / AVI up to 50MB</p>
              
              <div className="file-input-wrapper">
                <label className="btn btn-primary" htmlFor="video-upload">
                  Select Local Video
                </label>
                <input 
                  type="file" 
                  id="video-upload" 
                  accept="video/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      verifyVideo(e.target.files[0]);
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
              <h3>{wsProgress ? wsProgress.stage : "Analyzing Video Stream"}</h3>
              
              {/* Dynamic Telemetry Progress Bar */}
              {wsProgress && (
                <div style={{ width: '100%', margin: '12px 0 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <span>Live Stream Telemetry</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{wsProgress.progress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${wsProgress.progress}%`, 
                        height: '100%', 
                        background: 'var(--accent-gradient)', 
                        transition: 'width 0.3s ease' 
                      }} 
                    />
                  </div>
                </div>
              )}

              <div className="loading-steps">
                <div className={`step-item ${(wsProgress ? wsProgress.progress >= 20 : loadingStep >= 0) ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Demuxing video container formats...
                </div>
                <div className={`step-item ${(wsProgress ? wsProgress.progress >= 45 : loadingStep >= 1) ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Evaluating frame-rate consistency...
                </div>
                <div className={`step-item ${(wsProgress ? wsProgress.progress >= 70 : loadingStep >= 2) ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Detecting frame-level compression anomalies...
                </div>
                <div className={`step-item ${(wsProgress ? wsProgress.progress >= 90 : loadingStep >= 3) ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Correlating risk values...
                </div>
              </div>
            </div>
          )}

          {/* Results Summary Info Panel */}
          {result && (
            <div className={`glass-card result-summary-card ${result.is_clean ? 'clean' : 'tampered'}`}>
              <div className="summary-header">
                {result.risk_level === 'Analysis Unavailable' ? (
                  <>
                    <AlertTriangle className="status-icon" size={24} style={{ color: 'var(--amber, #f59e0b)' }} />
                    <div>
                      <h4>Analysis Unavailable</h4>
                      <span className="sub">Frame decoding failed — metadata-only result</span>
                    </div>
                  </>
                ) : result.is_clean ? (
                  <>
                    <CheckCircle className="status-icon success-color" size={24} />
                    <div>
                      <h4>No Tampering Detected</h4>
                      <span className="sub">Consistent compression profile across segments</span>
                    </div>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="status-icon danger-color" size={24} />
                    <div>
                      <h4>Tampering Suspected</h4>
                      <span className="sub">Elevated compression signature in timeline segments</span>
                    </div>
                  </>
                )}
              </div>
              
              <div className="score-block">
                <span className="score-label">Tampering Risk Score:</span>
                <span className={`score-value ${result.is_clean ? 'success-color' : 'danger-color'}`}>
                  {result.risk_score}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Visualizer */}
        <div className="visualizer-column animate-fade-in cascade-3">
          {result ? (
            <div className="glass-card viewer-card">
              <div className="viewer-header">
                <h3>Integrity Analysis Visualizer</h3>
                <span className="scanned-filename">{result.filename}</span>
              </div>

              {/* Video Player */}
              <div className="video-player-mockup">
                <div className="player-screen">
                  {videoUrl ? (
                    <>
                      <video 
                        ref={videoRef}
                        src={videoUrl}
                        className="real-video-player"
                        onEnded={() => setIsPlaying(false)}
                        controls
                      />
                      <div className={`scan-overlay-mesh ${result.is_clean ? 'mesh-green' : 'mesh-red'}`}></div>
                    </>
                  ) : (
                    <>
                      <div className={`scan-overlay-mesh ${result.is_clean ? 'mesh-green' : 'mesh-red'}`}></div>
                      <Film size={64} className="player-film-icon" />
                    </>
                  )}
                  <button onClick={toggleVideoPlay} className="btn-player-action">
                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                  </button>
                  <span className="player-status-badge">
                    {isPlaying ? 'PLAYING' : 'READY'}
                  </span>
                </div>
                <div className="player-controls">
                  <div className="timeline-scrubber-track">
                    <div className="scrubber-progress" style={{ width: isPlaying ? '100%' : '0%' }}></div>
                  </div>
                  <div className="controls-row">
                    <span className="time-val">00:00 / {result.metadata["Duration"]}</span>
                    <span className="fps-val">{result.metadata["Frame Rate"]}</span>
                  </div>
                </div>
              </div>

              {/* Timeline Segment Integrity Map */}
              <div className="timeline-integrity-section">
                <div className="section-header">
                  <h4>Timeline Integrity Segment Map</h4>
                  <span className="subtitle">Segment analysis (20 frame blocks)</span>
                </div>
                <div className="timeline-grid-blocks">
                  {result.timeline.map((block, idx) => (
                    <div 
                      key={idx} 
                      className={`timeline-block block-${block.status}`}
                      title={`Segment #${idx + 1} - Risk: ${block.risk}%`}
                      style={{ 
                        boxShadow: block.status === 'danger' ? '0 0 10px var(--rose)' : 'none' 
                      }}
                    ></div>
                  ))}
                </div>
                <div className="timeline-legend">
                  <span className="legend-item"><span className="legend-dot dot-green"></span> Clean Segment</span>
                  <span className="legend-item"><span className="legend-dot dot-red"></span> Spliced / Re-encoded Segment</span>
                </div>
              </div>

              {/* Anomalies List */}
              {!result.is_clean && result.anomalies && (
                <div className="anomalies-section">
                  <h4>Identified Splicing Signatures</h4>
                  <ul className="anomalies-list">
                    {result.anomalies.map((anom, idx) => (
                      <li key={idx}><span className="bullet"></span> {anom}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Engine F — Temporal Coherence */}
              {result.temporal_coherence && (
                <div className="anomalies-section" style={{ background: result.temporal_coherence.temporal_risk > 40 ? 'rgba(244,63,94,0.04)' : 'rgba(16,185,129,0.04)', borderColor: result.temporal_coherence.temporal_risk > 40 ? 'rgba(244,63,94,0.12)' : 'rgba(16,185,129,0.12)' }}>
                  <h4 style={{ color: result.temporal_coherence.temporal_risk > 40 ? 'var(--rose)' : 'var(--emerald)' }}>Temporal Coherence (Engine F)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', marginBottom: '10px', marginTop: '6px' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Temporal Risk:</span> <strong style={{ color: result.temporal_coherence.temporal_risk > 40 ? 'var(--rose)' : 'var(--emerald)' }}>{result.temporal_coherence.temporal_risk}%</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Jitter Score:</span> <strong>{result.temporal_coherence.jitter_score ?? '—'}</strong> <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>&gt;8.0 suspect</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Luma Var:</span> <strong>{result.temporal_coherence.luma_variance ?? '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Median SSIM:</span> <strong>{result.temporal_coherence.median_ssim ?? '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Min SSIM:</span> <strong style={{ color: (result.temporal_coherence.min_ssim ?? 1) < 0.85 ? 'var(--rose)' : 'var(--emerald)' }}>{result.temporal_coherence.min_ssim ?? '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Block Var:</span> <strong>{result.temporal_coherence.blockiness_variance ?? '—'}</strong></div>
                  </div>
                  {result.temporal_coherence.frame_ssim_drops && result.temporal_coherence.frame_ssim_drops.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>SSIM Drop Chart (per-frame, higher = stable)</div>
                      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '48px', background: 'var(--bg-muted)', borderRadius: '6px', padding: '6px' }}>
                        {result.temporal_coherence.frame_ssim_drops.map((v, i) => {
                          const h = Math.max(4, Math.round(v * 100 * 0.4));
                          const col = v < 0.85 ? 'var(--rose)' : v < 0.92 ? 'var(--amber, #f59e0b)' : 'var(--emerald)';
                          return <div key={i} title={`Frame ${i+1}: SSIM ${v}`} style={{ flex: 1, height: `${h}%`, background: col, borderRadius: '2px', minWidth: '2px' }} />;
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}><span>Frame 1</span><span>Frame {result.temporal_coherence.frame_ssim_drops.length}</span></div>
                    </div>
                  )}
                  <ul className="anomalies-list">
                    {(result.temporal_coherence.temporal_signals || []).map((s, i) => <li key={i}><span className="bullet"></span> {s}</li>)}
                  </ul>
                </div>
              )}

              {/* Metadata Panel */}
              <div className="metadata-section">
                <h4>Demuxer Codec Properties</h4>
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
              <Film size={64} className="placeholder-icon" />
              <h3>Stream Audit Idle</h3>
              <p>Select a video sample or drop a file to demux streams, check variable frame-rates, and construct a segment anomaly map.</p>
            </div>
          )}
        </div>

      </div>
      {showCert && result && (
        <CertificateModal
          result={result}
          scanType="video"
          onClose={() => setShowCert(false)}
        />
      )}
    </div>
  );
}
