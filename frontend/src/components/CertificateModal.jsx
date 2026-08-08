import React, { useState } from 'react';
import { ShieldCheck, X, Printer } from 'lucide-react';
import './CertificateModal.css';

export default function CertificateModal({ result, scanType, onClose }) {
  const [now] = useState(() => new Date().toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));

  const [certId] = useState(() => `SHIELD-${scanType.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`);

  if (!result) return null;

  const riskColor = result.risk_score < 40 ? '#10b981' : result.risk_score < 70 ? '#f59e0b' : '#ef4444';
  const unavailable = result.risk_level === 'Analysis Unavailable';
  const riskLevelColor = unavailable ? '#f59e0b' : riskColor;

  return (
    <div className="certificate-overlay" onClick={onClose}>
      <div className="certificate-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cert-close" onClick={onClose}><X size={20} /></button>

        <div className="certificate-content" id="certificate-content">
          <div className="cert-header">
            <div className="cert-brand">
              <ShieldCheck size={32} />
              <span className="cert-brand-text">Shield<span className="cert-brand-hl">.AI</span></span>
            </div>
            <div className="cert-badge">SECURITY CERTIFICATE</div>
          </div>

          <div className="cert-body">
            <div className="cert-title-row">
              <h2>Verification Certificate</h2>
              <span className="cert-id">{certId}</span>
            </div>

            <div className="cert-status-row" style={{ borderLeftColor: unavailable ? '#f59e0b' : riskColor }}>
              <div className="cert-status-info">
                <span className="cert-label">Status</span>
                <span className="cert-status-text" style={{ color: riskLevelColor }}>
                  {unavailable
                    ? 'INCONCLUSIVE - Analysis Unavailable'
                    : result.is_clean ? 'PASSED - No Tampering Found' : 'FAILED - Tampering Detected'}
                </span>
              </div>
              <div className="cert-risk-section">
                <span className="cert-label">Risk Score</span>
                <span className="cert-risk-value" style={{ color: riskColor }}>{result.risk_score}%</span>
              </div>
            </div>

            <div className="cert-details-grid">
              <div className="cert-detail-item">
                <span className="cert-detail-label">Scan Type</span>
                <span className="cert-detail-value">{scanType.toUpperCase()}</span>
              </div>
              <div className="cert-detail-item">
                <span className="cert-detail-label">File / Target</span>
                <span className="cert-detail-value">{result.filename || result.url || result.domain || 'N/A'}</span>
              </div>
              <div className="cert-detail-item">
                <span className="cert-label">Risk Level</span>
                <span className="cert-detail-value" style={{ color: riskLevelColor }}>{result.risk_level}</span>
              </div>
              <div className="cert-detail-item">
                <span className="cert-detail-label">Timestamp</span>
                <span className="cert-detail-value">{now}</span>
              </div>
              <div className="cert-detail-item">
                <span className="cert-detail-label">Certificate ID</span>
                <span className="cert-detail-value cert-mono">{certId}</span>
              </div>
              <div className="cert-detail-item">
                <span className="cert-detail-label">Issued By</span>
                <span className="cert-detail-value">shieldAI Security Network</span>
              </div>
            </div>

            {result.metadata && (
              <div className="cert-metadata">
                <h3>Analysis Metadata</h3>
                <div className="cert-meta-grid">
                  {Object.entries(result.metadata).map(([key, val]) => (
                    <div key={key} className="cert-meta-row">
                      <span className="cert-meta-key">{key}</span>
                      <span className="cert-meta-val">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.anomalies && result.anomalies.length > 0 && (
              <div className="cert-anomalies">
                <h3>Detected Anomalies</h3>
                <ul>
                  {result.anomalies.map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cert-footer-text">
              <p>This certificate verifies the authenticity analysis performed by shieldAI's security scanning engines.</p>
              <p className="cert-disclaimer">Results are based on computational analysis and should be used as reference only.</p>
            </div>
          </div>
        </div>

        <button className="btn btn-primary cert-print-btn" onClick={() => window.print()}>
          <Printer size={18} /> Print Certificate
        </button>
      </div>
    </div>
  );
}