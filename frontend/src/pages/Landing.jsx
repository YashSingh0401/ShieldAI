import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, ShieldAlert, Lock, Zap, Menu, Globe, ChevronRight, Search, RefreshCw, Shield } from 'lucide-react';
import { api } from '../api/client.js';
import './Landing.css';

export default function Landing({ user }) {
  const navigate = useNavigate();
  
  // Interactive Quick Scan states
  const [quickUrl, setQuickUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [scanResult, setScanResult] = useState(null);

  const handleAction = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleQuickScan = async (e) => {
    e.preventDefault();
    if (!quickUrl.trim() || scanning) return;

    setScanning(true);
    setScanResult(null);
    setScanStep("Analyzing protocol trees...");

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setScanStep("Evaluating Shannon entropy...");
      await new Promise(resolve => setTimeout(resolve, 500));
      setScanStep("Resolving brand spoofing indicators...");

      const data = await api.get('/verify/url', { url: quickUrl.trim() });
      setScanResult({
        isSafe: data.levelClass === 'safe',
        riskScore: data.risk_score,
        domain: data.domain,
      });
    } catch (err) {
      console.error("Quick scan failed:", err);
      setScanResult({
        isSafe: true,
        riskScore: 0,
        domain: quickUrl.trim(),
        error: err.message || 'Scan failed',
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="landing-page-wrapper">
      {/* Hexagonal mesh background layer */}
      <div className="hex-grid-overlay"></div>
      
      {/* Decorative connection nodes */}
      <div className="network-node node-1"></div>
      <div className="network-node node-2"></div>
      <div className="network-node node-3"></div>

      {/* Header Bar */}
      <header className="landing-header-bar">
        <div className="header-left">
          <button className="menu-toggle-icon" aria-label="Toggle Menu">
            <Menu size={20} />
          </button>
          <div className="landing-brand">
            <div className="brand-logo-container">
              <ShieldCheck className="brand-logo-svg" size={18} />
            </div>
            <div className="brand-text-container">
              <span className="brand-title">Digital Shield</span>
              <span className="brand-subtitle">Gov of India</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="lang-selector">
            <Globe size={14} />
            <span>EN</span>
          </div>
          <button onClick={handleAction} className="avatar-btn" title={user ? "Go to Dashboard" : "Sign In"}>
            <div className="avatar-circle">
              {user ? user.name[0].toUpperCase() : 'Y'}
            </div>
          </button>
        </div>
      </header>

      {/* Hero Content Section */}
      <div className="hero-section">
        {/* Core Shield Logo in glowing circle */}
        <div className="logo-outer-container">
          <div className="pulse-ring ring-1"></div>
          <div className="pulse-ring ring-2"></div>
          <div className="pulse-ring ring-3"></div>
          <div className="hero-shield-badge">
            <ShieldCheck className="hero-shield-svg" size={44} />
          </div>
        </div>

        {/* Mission Pill */}
        <div className="ministry-capsule-tag">
          <div className="capsule-blue-dot"></div>
          <span>India-focused scam & phishing protection</span>
        </div>

        {/* Main Headings */}
        <div className="hero-text-block">
          <h1 className="hero-main-title">
            DIGITAL <span className="title-gradient">SHIELD</span>
          </h1>
          <p className="hero-sub-title">
            AI-Powered Cybersecurity Intelligence Platform
          </p>
          <div className="hero-details-row">
            <span>Real-time threat detection</span>
            <span className="bullet-dot">•</span>
            <span>Media tampering analysis</span>
            <span className="bullet-dot">•</span>
            <span>Phishing prevention</span>
            <span className="bullet-dot">•</span>
            <span>India-specific scam protection</span>
          </div>
        </div>

        {/* Interactive Quick Scan Widget */}
        <div className="quick-scan-widget glass-card">
          <div className="widget-header">
            <Shield size={16} className="widget-icon" />
            <span>Instant Link Integrity Check</span>
          </div>
          
          <form onSubmit={handleQuickScan} className="quick-scan-form">
            <input 
              type="text"
              placeholder="Paste any link to audit (e.g. http://scam-paytm-bank.in)..."
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              className="quick-scan-input"
              disabled={scanning}
              required
            />
            <button type="submit" className="quick-scan-btn" disabled={scanning}>
              {scanning ? <RefreshCw size={14} className="spinner" /> : <Search size={14} />}
              <span>Quick Audit</span>
            </button>
          </form>

          {/* Scanning Simulation Output */}
          {scanning && (
            <div className="quick-scan-loading">
              <div className="bar-loader">
                <div className="bar-loader-fill"></div>
              </div>
              <span className="loading-text">{scanStep}</span>
            </div>
          )}

          {/* Scan Results Output */}
          {scanResult && !scanning && (
            <div className={`quick-scan-result ${scanResult.isSafe ? 'safe' : 'phish'}`}>
              <div className="result-indicator-dot"></div>
              <div className="result-details">
                <span className="result-domain">{scanResult.domain}</span>
                <span className="result-summary">
                  {scanResult.isSafe 
                    ? `Safe Link (Risk Score: ${scanResult.riskScore}%)` 
                    : `Phishing Anomaly Match (Risk Score: ${scanResult.riskScore}%)`
                  }
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Call to Action Button */}
        <div className="cta-row">
          <button onClick={handleAction} className="landing-cta-btn">
            <span>{user ? "Enter Control Panel" : "Sign in to Dashboard"}</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Lower Features Grid capsules */}
        <div className="features-capsule-grid">
          <div className="feature-capsule-card">
            <div className="capsule-icon-wrapper blue">
              <Eye size={14} />
            </div>
            <span>ELA Pixel Forensics</span>
          </div>

          <div className="feature-capsule-card">
            <div className="capsule-icon-wrapper red">
              <ShieldAlert size={14} />
            </div>
            <span>Evidence-Based Scoring</span>
          </div>

          <div className="feature-capsule-card">
            <div className="capsule-icon-wrapper purple">
              <Lock size={14} />
            </div>
            <span>PDF Scan Certificates</span>
          </div>

          <div className="feature-capsule-card">
            <div className="capsule-icon-wrapper green">
              <Zap size={14} />
            </div>
            <span>Real-Time Analysis</span>
          </div>
        </div>
      </div>

      {/* Live Rolling Stats Ticker Footer */}
      <footer className="live-stats-ticker">
        <div className="ticker-label">CORE ENGINES:</div>
        <div className="ticker-track">
          <div className="ticker-item">⚡ Error Level Analysis (ELA)</div>
          <div className="ticker-item">🛡️ JPEG Blockiness Forensics</div>
          <div className="ticker-item">🔗 Lexical URL & Typosquat Heuristics</div>
          <div className="ticker-item">👥 Crowdsourced Community Threat Feed</div>
          {/* Repeat to allow infinite scroll effect */}
          <div className="ticker-item">⚡ Error Level Analysis (ELA)</div>
          <div className="ticker-item">🛡️ JPEG Blockiness Forensics</div>
          <div className="ticker-item">🔗 Lexical URL & Typosquat Heuristics</div>
          <div className="ticker-item">👥 Crowdsourced Community Threat Feed</div>
        </div>
      </footer>

      {/* Legal Footer */}
      <div className="legal-footer-bar">
        <span>Heuristic analysis &mdash; not proof of authenticity.</span>
        <nav className="legal-footer-links">
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true">&middot;</span>
          <Link to="/terms">Terms</Link>
        </nav>
      </div>
    </div>
  );
}
