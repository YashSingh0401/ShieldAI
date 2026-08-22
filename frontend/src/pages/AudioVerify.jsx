import React, { useState, useRef } from 'react';
import { Upload, Volume2, ShieldAlert, CheckCircle, ChevronRight, Play, Pause, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import CertificateModal from '../components/CertificateModal';
import QuotaReachedCard from '../components/QuotaReachedCard';
import { FREE_DAILY_MEDIA_SCANS } from '../config.js';
import './AudioVerify.css';

export default function AudioVerify({ onVerify }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState(null);
  const [quotaReached, setQuotaReached] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const audioRef = useRef(null);

  const exportJSON = () => {
    if (!result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `shieldAI_audio_report_${result.filename.replace(/\.[^/.]+$/, "")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleFile = async (file) => {
    if (!file) return;

    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setIsPlaying(false);

    setLoading(true);
    setLoadingStep(0);
    setResult(null);
    setQuotaReached(false);

    const steps = [
      setTimeout(() => setLoadingStep(1), 300),
      setTimeout(() => setLoadingStep(2), 650),
    ];

    try {
      const data = await api.upload('/verify/audio', file);
      steps.forEach(clearTimeout);
      setLoadingStep(2);
      setResult(data);
      setLoading(false);

      if (onVerify) {
        onVerify({
          target: data.filename,
          result: data.risk_level,
          risk: data.risk_score,
          status: data.is_clean ? 'success' : 'danger',
        });
      }
    } catch (err) {
      steps.forEach(clearTimeout);
      if (err.status === 402 && err.body?.detail?.code === 'quota_exceeded') {
        setQuotaReached(true);
        setLoading(false);
        return;
      }
      console.error("Audio verification failed:", err);
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
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="audio-verify-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Audio Verify</h1>
        <p className="page-subtitle">Analyse audio files for voice cloning, pitch anomalies, and synthetic speech patterns.</p>
      </header>

      <div className="verify-layout">
        <div className="upload-column animate-fade-in cascade-2">
          <div
            className={`glass-card drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <div className="drop-zone-content">
              <Volume2 size={48} className="upload-icon" />
              <h3>Drag & Drop Audio Here</h3>
              <p>Supports MP3 / WAV up to 50MB</p>

              <div className="file-input-wrapper">
                <label className="btn btn-primary" htmlFor="audio-upload">
                  Select Audio File
                </label>
                <input
                  type="file"
                  id="audio-upload"
                  accept="audio/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {loading && (
            <div className="glass-card loading-card">
              <div className="spinner"></div>
              <h3>Analyzing Audio Stream</h3>
              <div className="loading-steps">
                <div className={`step-item ${loadingStep >= 0 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Extracting sample rate and format headers...
                </div>
                <div className={`step-item ${loadingStep >= 1 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Running pitch variation and spectral analysis...
                </div>
                <div className={`step-item ${loadingStep >= 2 ? 'active' : ''}`}>
                  <ChevronRight size={14} /> Compiling voice clone probability report...
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className={`glass-card result-summary-card ${result.is_clean ? 'clean' : 'tampered'}`}>
              <div className="summary-header">
                {result.risk_level === 'Analysis Unavailable' ? (
                  <>
                    <AlertTriangle className="status-icon" size={24} style={{ color: 'var(--amber, #f59e0b)' }} />
                    <div>
                      <h4>Analysis Unavailable</h4>
                      <span className="sub">Audio decoding failed — metadata-only result</span>
                    </div>
                  </>
                ) : result.is_clean ? (
                  <>
                    <CheckCircle className="status-icon success-color" size={24} />
                    <div>
                      <h4>{result.risk_level}</h4>
                      <span className="sub">Natural prosody, no synthetic speech indicators</span>
                    </div>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="status-icon danger-color" size={24} />
                    <div>
                      <h4>{result.risk_level}</h4>
                      <span className="sub">Speech pattern anomalies detected</span>
                    </div>
                  </>
                )}
              </div>

              <div className="score-block">
                <span className="score-label">{result.risk_level === 'Analysis Unavailable' ? 'Risk Score:' : 'Voice Clone Probability:'}</span>
                <span className={`score-value ${result.is_clean ? 'success-color' : 'danger-color'}`}>
                  {result.risk_level === 'Analysis Unavailable' ? result.risk_score : (result.voice_clone_probability || result.risk_score)}%
                </span>
              </div>

              <div className="score-block">
                <span className="score-label">Pitch Variation:</span>
                <span className={`score-value ${result.pitch_variation < 15 ? 'danger-color' : 'success-color'}`}>
                  {result.pitch_variation}%
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="visualizer-column animate-fade-in cascade-3">
          {audioUrl ? (
            <div className="glass-card viewer-card">
              <div className="viewer-header">
                <h3>Audio Player & Visualizer</h3>
                <span className="scanned-filename">{result ? result.filename : 'audio file'}</span>
              </div>

              <div className="audio-player-wrapper">
                <div className="audio-visualizer">
                  <div className="visualizer-bars">
                    {Array.from({ length: 60 }).map((_, i) => {
                      const barHeight = result
                        ? Math.max(8, 60 + Math.sin(i * 0.4 + result.pitch_variation) * 40 + (Math.sin(i * 1.5) * 10))
                        : 30 + Math.sin(i * 0.8) * 20;
                      const barColor = result && !result.is_clean
                        ? 'rgba(239, 68, 68, 0.6)'
                        : 'rgba(79, 70, 229, 0.6)';
                      return (
                        <div
                          key={i}
                          className="visualizer-bar"
                          style={{
                            height: `${barHeight}%`,
                            background: barColor,
                            animationDelay: `${i * 0.02}s`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />

                <div className="audio-controls">
                  <button onClick={togglePlay} className="btn-player-action">
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <div className="audio-track-info">
                    <span className="audio-filename">{result ? result.filename : 'Selected file'}</span>
          {quotaReached && !loading && (
            <QuotaReachedCard limit={FREE_DAILY_MEDIA_SCANS} />
          )}

          {result && (
                      <span className="audio-meta">{result.sample_rate} Hz &middot; {result.pitch_status}</span>
                    )}
                  </div>
                </div>
              </div>

              {result && (
                <>
                  {result.compression_warnings && result.compression_warnings.length > 0 && (
                    <div className="anomalies-section">
                      <h4>Compression Warnings</h4>
                      <ul className="anomalies-list">
                        {result.compression_warnings.map((w, idx) => (
                          <li key={idx}><span className="bullet"></span> {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.anomalies && result.anomalies.length > 0 && (
                    <div className="anomalies-section">
                      <h4>Analysis Findings</h4>
                      <ul className="anomalies-list">
                        {result.anomalies.map((a, idx) => (
                          <li key={idx}><span className="bullet"></span> {a}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="metadata-section">
                    <h4>Audio Properties</h4>
                    <div className="metadata-grid">
                      <div className="meta-row">
                        <span className="meta-key">Sample Rate</span>
                        <span className="meta-value">{result.sample_rate} Hz</span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-key">Pitch Variation</span>
                        <span className="meta-value">{result.pitch_variation}%</span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-key">Pitch Status</span>
                        <span className={`meta-value ${result.pitch_variation < 15 ? 'danger-color' : ''}`}>
                          {result.pitch_status}
                        </span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-key">Voice Clone Probability</span>
                        <span className="meta-value">{result.voice_clone_probability}%</span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-key">Sample Rate Anomaly</span>
                        <span className={`meta-value ${result.sample_rate_anomaly ? 'danger-color' : 'success-color'}`}>
                          {result.sample_rate_anomaly ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="export-actions-group">
                    <button onClick={exportJSON} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                      Export JSON Report
                    </button>
                    <button onClick={() => setShowCert(true)} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                      Export PDF Certificate
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="glass-card viewer-placeholder">
              <Volume2 size={64} className="placeholder-icon" />
              <h3>Audio Analysis Idle</h3>
              <p>Drop an audio file or select one to begin spectral analysis and voice clone detection.</p>
            </div>
          )}
        </div>
      </div>

      {showCert && result && (
        <CertificateModal
          result={result}
          scanType="audio"
          onClose={() => setShowCert(false)}
        />
      )}
    </div>
  );
}
