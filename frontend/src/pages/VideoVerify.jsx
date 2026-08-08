import React, { useState, useRef } from 'react';
import { Upload, Film, ShieldAlert, CheckCircle, ChevronRight, Sliders, Play, RotateCw, Pause, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import CertificateModal from '../components/CertificateModal';
import './VideoVerify.css';

export default function VideoVerify({ onVerify }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
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
  };

  const exportPDF = () => {
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

    const steps = [
      setTimeout(() => setLoadingStep(1), 300),
      setTimeout(() => setLoadingStep(2), 650),
      setTimeout(() => setLoadingStep(3), 1000)
    ];

    try {
      const data = await api.upload('/verify/video', file);
      steps.forEach(clearTimeout);
      setLoadingStep(3);
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
      console.error("Video verification failed:", err);
      alert(err.message || "Network error: Could not connect to the security backend.");
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
              <h3>Analyzing Video Stream</h3>
              <div className="loading-steps">
                <div className={`step-item ${loadingStep >= 0 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Demuxing video container formats...
                </div>
                <div className={`step-item ${loadingStep >= 1 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Evaluating frame-rate consistency...
                </div>
                <div className={`step-item ${loadingStep >= 2 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Detecting frame-level compression anomalies...
                </div>
                <div className={`step-item ${loadingStep >= 3 ? 'active' : ''}`}>
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
