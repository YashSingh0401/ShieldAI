import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Shield, Globe, Search, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import CertificateModal from '../components/CertificateModal';
import './LinkScan.css';

export default function LinkScan({ onScan }) {
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showCert, setShowCert] = useState(false);

  const exportJSON = () => {
    if (!result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `shieldAI_url_report_${result.domain}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success("JSON report exported successfully!");
  };

  const exportPDF = () => {
    setShowCert(true);
  };

  const calculateRisk = async (url) => {
    setLoading(true);
    setResult(null);

    try {
      const data = await api.get('/verify/url', { url });
      setResult(data);
      setLoading(false);
      toast.success(
        data.levelClass === 'safe'
          ? "Domain verified: Clean & safe protocol"
          : `Risk detected: ${data.risk_level}`,
        { icon: data.levelClass === 'safe' ? '🛡️' : '⚠️' }
      );

      if (onScan) {
        onScan({
          target: data.url,
          result: data.risk_level,
          risk: data.risk_score,
          status: data.levelClass === 'safe' ? 'success' : data.levelClass === 'suspicious' ? 'warning' : 'danger'
        });
      }
    } catch (err) {
      console.error("URL scan failed:", err);
      toast.error(err.message || "Network error: Could not connect to the security backend.");
      setLoading(false);
    }
  };

  const handleScan = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    calculateRisk(urlInput);
  };

  const loadSample = (sampleUrl) => {
    setUrlInput(sampleUrl);
    calculateRisk(sampleUrl);
  };

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const riskPercent = result ? result.risk_score : 0;
  const strokeDashoffset = circumference - (riskPercent / 100) * circumference;

  return (
    <div className="link-scan-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Link Safety Auditor</h1>
        <p className="page-subtitle">Inspect URLs in real-time for phishing patterns, high character entropy, and domain typosquatting.</p>
      </header>

      {/* Preloaded samples */}
      <div className="samples-panel animate-fade-in cascade-1">
        <span className="samples-label">Test Sample Scans:</span>
        <button onClick={() => loadSample('https://github.com/microsoft/vscode')} className="btn btn-secondary btn-sm">
          Clean GitHub Repo
        </button>
        <button onClick={() => loadSample('http://paytm-kyc-verify-update.in/auth')} className="btn btn-secondary btn-sm sample-warning">
          Typosquatting Paytm HTTP
        </button>
        <button onClick={() => loadSample('https://auth-session-secure-382a.xyz/login')} className="btn btn-secondary btn-sm sample-danger">
          Obfuscated XYZ Phish
        </button>
      </div>

      <div className="scan-layout">
        
        {/* Search Panel */}
        <div className="glass-card scan-panel animate-fade-in cascade-2">
          <form onSubmit={handleScan} className="scan-form">
            <div className="search-wrapper">
              <Globe size={20} className="input-globe-icon" />
              <input 
                type="text" 
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter link to verify (e.g., http://scam-link.net)"
                className="form-input scan-input"
                required
              />
              <button type="submit" className="btn btn-primary scan-submit" disabled={loading}>
                {loading ? <RefreshCw size={16} className="btn-spinner" /> : <Search size={16} />}
                <span>Scan URL</span>
              </button>
            </div>
          </form>

          {loading && (
            <div className="scan-loading">
              <div className="spinner"></div>
              <h3>Analyzing URL lexical properties...</h3>
              <p>Computing Shannon entropy coefficients, looking up brand directories, and resolving domain trees...</p>
            </div>
          )}

          {!loading && !result && (
            <div className="scan-instructions">
              <Shield size={40} className="inst-icon" />
              <h4>Enter a link above to start audit</h4>
              <p>The auditor will evaluate protocol integrity, host depth, low-cost registration signatures, and malicious brand associations instantly.</p>
            </div>
          )}

          {/* Results Details Column (if scanned) */}
          {result && !loading && (
            <div className="scan-details">
              <div className="details-header">
                <h4>Lexical Analysis Report</h4>
                <div className="url-badge">
                  <Globe size={12} />
                  <span>{result.domain}</span>
                </div>
              </div>

              <div className="heuristics-list">
                {result.flags.map((flag, idx) => (
                  <div key={idx} className={`heuristic-flag-item flag-${flag.type}`}>
                    <div className="flag-dot"></div>
                    <p className="flag-text">{flag.text}</p>
                  </div>
                ))}
              </div>

              <div className="entropy-info-box">
                <div className="entropy-header">
                  <span>Shannon Entropy Index</span>
                  <span className="entropy-value">{result.entropy}</span>
                </div>
                <div className="entropy-meter-track">
                  <div 
                    className="entropy-meter-fill"
                    style={{ 
                      width: `${Math.min((parseFloat(result.entropy) / 5) * 100, 100)}%`,
                      backgroundColor: result.risk_score > 50 ? 'var(--rose)' : 'var(--cyan)'
                    }}
                  ></div>
                </div>
                <span className="entropy-explainer">
                  Entropy measures randomness. Higher values (&gt; 3.8) are common in generated domain hacks or obfuscated paths.
                </span>
              </div>

              {/* Engine E — Semantic Phish */}
              {result.semantic_phish && (
                <div style={{ marginTop: '16px', padding: '14px', borderRadius: '10px', background: result.semantic_phish.phish_score > 40 ? 'rgba(244,63,94,0.06)' : 'rgba(16,185,129,0.04)', border: `1px solid ${result.semantic_phish.phish_score > 40 ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: result.semantic_phish.phish_score > 40 ? 'var(--rose)' : 'var(--emerald)' }}>Semantic Phish Analysis (Engine E)</h4>
                    <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '10px', background: result.semantic_phish.phish_score > 40 ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)', fontWeight: 700 }}>{result.semantic_phish.phish_score}% PHISH SCORE</span>
                  </div>
                  <ul style={{ margin: '0', paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {result.semantic_phish.phish_signals.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {/* Engine H — Threat Intel */}
              {result.threat_intel && (
                <div style={{ marginTop: '16px', padding: '14px', borderRadius: '10px', background: 'var(--bg-widget-subtle)', border: '1px solid var(--border)', textAlign: 'left' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>Threat Intelligence (Engine H)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', marginBottom: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Cert Age:</span>{' '}
                      <span style={{ fontWeight: 700, color: result.threat_intel.cert_recent ? 'var(--rose)' : 'var(--emerald)' }}>
                        {result.threat_intel.cert_age_days != null ? `${result.threat_intel.cert_age_days}d` : '—'}
                      </span>
                      {result.threat_intel.cert_recent && <span style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(244,63,94,0.15)', color: 'var(--rose)' }}>RECENT &lt;7d</span>}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>URLhaus:</span>{' '}
                      <span style={{ fontWeight: 700, color: result.threat_intel.urlhaus?.status === 'listed' ? 'var(--rose)' : 'var(--emerald)' }}>
                        {result.threat_intel.urlhaus?.status === 'listed' ? `${result.threat_intel.urlhaus?.count ?? 0} hits` : result.threat_intel.urlhaus?.status || 'clean'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>PhishTank:</span>{' '}
                      <span style={{ fontWeight: 700 }}>{result.threat_intel.phishtank || 'unknown'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Domain:</span> <span style={{ fontWeight: 600 }}>{result.threat_intel.domain}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                    <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.5 }}>
                      {(result.threat_intel.intel_signals || []).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  {(result.live_meta?.ip_address || result.live_meta?.http_status) && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                      {result.live_meta.ip_address && <span style={{ marginRight: '12px' }}>IP: {result.live_meta.ip_address}</span>}
                      {result.live_meta.http_status && <span>HTTP: {result.live_meta.http_status}</span>}
                      {result.live_meta.redirects > 0 && <span style={{ marginLeft: '12px' }}>Redirects: {result.live_meta.redirects}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dial Score Panel */}
        <div className="dial-panel-column animate-fade-in cascade-3">
          {result && !loading ? (
            <div className="glass-card dial-card">
              <div className="dial-header">
                <h3>Verification Score</h3>
              </div>

              <div className="dial-display">
                <svg className="svg-dial" width="160" height="160" viewBox="0 0 120 120">
                  <circle 
                    className="dial-track" 
                    cx="60" 
                    cy="60" 
                    r={radius} 
                    strokeWidth="8"
                  />
                  <circle 
                    className={`dial-progress path-${result.levelClass}`}
                    cx="60" 
                    cy="60" 
                    r={radius} 
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="dial-text-overlay">
                  <span className="dial-score-num">{result.risk_score}%</span>
                  <span className="dial-score-label">RISK RATING</span>
                </div>
              </div>

              <div className="dial-status-info">
                <div className={`status-badge-glow bg-${result.levelClass}`}>
                  {result.levelClass === 'safe' && <ShieldCheck size={18} />}
                  {result.levelClass === 'suspicious' && <ShieldAlert size={18} />}
                  {result.levelClass === 'phishing' && <ShieldAlert size={18} />}
                  <span>{result.risk_level}</span>
                </div>
                <p className="status-brief">
                  {result.levelClass === 'safe' && 'This link shows no indicators of malicious templates or deceptive paths. Safe to navigate.'}
                  {result.levelClass === 'suspicious' && 'Moderate security risks detected. Avoid submitting credentials or billing info.'}
                  {result.levelClass === 'phishing' && 'High threat match: Highly matches known fraudulent templates or phishing campaigns. DO NOT navigate.'}
                </p>
              </div>

              {/* Export Buttons */}
              <div className="export-actions-group" style={{ display: 'flex', gap: '12px', marginTop: '20px', width: '100%', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                <button onClick={exportJSON} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                  Export JSON
                </button>
                <button onClick={exportPDF} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  Export PDF
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card dial-placeholder">
              <Shield size={48} className="dial-placeholder-icon" />
              <h3>Integrity Evaluator</h3>
              <p>Risk percentage, security classification, and threat assessments will display here post-analysis.</p>
            </div>
          )}
        </div>

      </div>

      {showCert && result && (
        <CertificateModal
          result={result}
          scanType="url"
          onClose={() => setShowCert(false)}
        />
      )}
    </div>
  );
}
