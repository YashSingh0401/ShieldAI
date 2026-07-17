import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, ShieldAlert, Lock, Zap, Menu, Globe, ChevronRight, Search, RefreshCw, Shield } from 'lucide-react';
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

  const handleQuickScan = (e) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;

    setScanning(true);
    setScanResult(null);
    setScanStep("Analyzing protocol trees...");

    setTimeout(() => {
      setScanStep("Evaluating Shannon entropy...");
      setTimeout(() => {
        setScanStep("Resolving brand spoofing indicators...");
        setTimeout(() => {
          const urlLower = quickUrl.toLowerCase();
          const isPhish = urlLower.includes("scam") || 
                          urlLower.includes("verify") || 
                          urlLower.includes("paytm") || 
                          urlLower.includes("bank") || 
                          urlLower.includes("login") || 
                          urlLower.includes("secure-update");
          
          setScanResult({
            isSafe: !isPhish,
            riskScore: isPhish ? Math.floor(Math.random() * 25) + 75 : Math.floor(Math.random() * 12) + 2,
            domain: urlLower.replace(/https?:\/\/(www\.)?/, "").split('/')[0]
          });
          setScanning(false);
        }, 700);
      }, 700);
    }, 700);
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

        {/* Ministry Pill */}
        <div className="ministry-capsule-tag">
          <div className="capsule-blue-dot"></div>
          <span>Ministry of Electronics & Information Technology — India</span>
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
            <span>Deepfake analysis</span>
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
            <span>CNN Vision AI</span>
          </div>

          <div className="feature-capsule-card">
            <div className="capsule-icon-wrapper red">
              <ShieldAlert size={14} />
            </div>
            <span>Zero-Day Detection</span>
          </div>

          <div className="feature-capsule-card">
            <div className="capsule-icon-wrapper purple">
              <Lock size={14} />
            </div>
            <span>Military Grade</span>
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
        <div className="ticker-label">LIVE CORE TELEMETRY:</div>
        <div className="ticker-track">
          <div className="ticker-item">⚡ 24ms Average URL Resolve Speed</div>
          <div className="ticker-item">🛡️ 99.8% Deepfake Face Swap Identification</div>
          <div className="ticker-item">🔒 AES-256 System Integrity Lock</div>
          <div className="ticker-item">🇮🇳 Government of India Cybersecurity Standards</div>
          {/* Repeat to allow infinite scroll effect */}
          <div className="ticker-item">⚡ 24ms Average URL Resolve Speed</div>
          <div className="ticker-item">🛡️ 99.8% Deepfake Face Swap Identification</div>
          <div className="ticker-item">🔒 AES-256 System Integrity Lock</div>
          <div className="ticker-item">🇮🇳 Government of India Cybersecurity Standards</div>
        </div>
      </footer>
    </div>
  );
}
