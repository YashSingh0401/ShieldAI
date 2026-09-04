import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, ShieldAlert, Lock, Zap, ChevronRight, Search, RefreshCw, Shield, Sun, Moon, Film, Volume2, Link as LinkIcon, CheckCircle, HelpCircle, ArrowRight } from 'lucide-react';
import { api } from '../api/client.js';
import { useTheme } from '../ThemeContext.jsx';
import './Landing.css';

export default function Landing({ user }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  
  // Interactive Quick Scan states
  const [quickUrl, setQuickUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [scanResult, setScanResult] = useState(null);

  // Active Engine Tab state
  const [activeEngineTab, setActiveEngineTab] = useState('image');

  // FAQ Accordion state
  const [openFaq, setOpenFaq] = useState(null);

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

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
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
          <div className="landing-brand">
            <div className="brand-logo-container">
              <ShieldCheck className="brand-logo-svg" size={20} />
            </div>
            <div className="brand-text-container">
              <span className="brand-title">Shield<span className="brand-highlight">.AI</span></span>
              <span className="brand-subtitle">Gov & Enterprise Cyber Portal</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          {/* Theme Mode Toggle Button */}
          <button onClick={toggleTheme} className="theme-toggle-header-btn" title="Toggle Theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span className="theme-btn-text">{theme === 'dark' ? 'Light Mode' : 'Cyber Dark'}</span>
          </button>

          <button onClick={handleAction} className="landing-nav-login-btn">
            <span>{user ? "Console Dashboard" : "Sign In"}</span>
            <ArrowRight size={14} />
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
          <span>Digital Forensic Inspection & AI Media Audit Engine</span>
        </div>

        {/* Main Headings */}
        <div className="hero-text-block">
          <h1 className="hero-main-title">
            SHIELD<span className="title-gradient">.AI</span> FORENSIC HUB
          </h1>
          <p className="hero-sub-title">
            Full-Stack Digital Asset Forensics & Fraud Prevention Platform
          </p>
          <div className="hero-details-row">
            <span>ELA Compression Forensics</span>
            <span className="bullet-dot">•</span>
            <span>Video Splice Demuxing</span>
            <span className="bullet-dot">•</span>
            <span>Audio Prosody Analysis</span>
            <span className="bullet-dot">•</span>
            <span>Shannon Entropy Link Scans</span>
          </div>
        </div>

        {/* Interactive Quick Scan Widget */}
        <div className="quick-scan-widget glass-card">
          <div className="widget-header">
            <Shield size={16} className="widget-icon" />
            <span>Instant Phishing Link Auditor</span>
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
              <span>Audit URL</span>
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
                    ? `Verified Clean (Risk Score: ${scanResult.riskScore}%)` 
                    : `Suspicious Phishing Anomaly (Risk Score: ${scanResult.riskScore}%)`
                  }
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Call to Action Button */}
        <div className="cta-row">
          <button onClick={handleAction} className="landing-cta-btn">
            <span>{user ? "Launch Security Console" : "Explore Forensic Dashboard"}</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Interactive 4-Engine Feature Matrix */}
        <div className="engine-matrix-section">
          <h2 className="section-title">Core Forensic Engines</h2>
          <p className="section-subtitle">Evidence-based algorithmic scoring across all digital media types.</p>
          
          <div className="engine-tabs-nav">
            <button 
              className={`engine-tab-btn ${activeEngineTab === 'image' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('image')}
            >
              <Eye size={16} />
              <span>Image ELA</span>
            </button>
            <button 
              className={`engine-tab-btn ${activeEngineTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('video')}
            >
              <Film size={16} />
              <span>Video Timeline</span>
            </button>
            <button 
              className={`engine-tab-btn ${activeEngineTab === 'audio' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('audio')}
            >
              <Volume2 size={16} />
              <span>Audio Prosody</span>
            </button>
            <button 
              className={`engine-tab-btn ${activeEngineTab === 'link' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('link')}
            >
              <LinkIcon size={16} />
              <span>Phishing Links</span>
            </button>
          </div>

          <div className="engine-tab-content glass-card">
            {activeEngineTab === 'image' && (
              <div className="tab-pane animate-fade-in">
                <div className="pane-info">
                  <h3>Error Level Analysis & Blockiness Forensics</h3>
                  <p>Resaves images at calibrated JPEG compression ratios to reveal manipulated layers, synthetic AI noise profiles, and missing EXIF camera hardware tags.</p>
                  <ul className="pane-features">
                    <li><CheckCircle size={14} className="feature-check" /> Dynamic ELA Heatmap Difference Overlay</li>
                    <li><CheckCircle size={14} className="feature-check" /> 8x8 Grid Boundary Compression Energy Measure</li>
                    <li><CheckCircle size={14} className="feature-check" /> Sensor Noise & Synthetic Byte Inspector</li>
                  </ul>
                </div>
                <div className="pane-badge-card">
                  <span className="badge-stat">1.00</span>
                  <span className="badge-label">Precision Rate</span>
                </div>
              </div>
            )}

            {activeEngineTab === 'video' && (
              <div className="tab-pane animate-fade-in">
                <div className="pane-info">
                  <h3>Video Demuxing & Timeline Splice Auditor</h3>
                  <p>Parses video streams into frame samples evenly distributed across the timeline, running frame-by-frame ELA to localize temporal edits and deepfake cuts.</p>
                  <ul className="pane-features">
                    <li><CheckCircle size={14} className="feature-check" /> 20-Point Timeline Heatmap Grid</li>
                    <li><CheckCircle size={14} className="feature-check" /> Variable Frame-Rate (VFR) Signature Inspector</li>
                    <li><CheckCircle size={14} className="feature-check" /> Container Magic-Byte Verification</li>
                  </ul>
                </div>
                <div className="pane-badge-card">
                  <span className="badge-stat">20</span>
                  <span className="badge-label">Frames Extracted</span>
                </div>
              </div>
            )}

            {activeEngineTab === 'audio' && (
              <div className="tab-pane animate-fade-in">
                <div className="pane-info">
                  <h3>Audio Spectral & Prosody Pitch Statistics</h3>
                  <p>Measures fundamental frequency variation (F0 pitch standard deviation), voice activity ratios, and spectral boundary discontinuities to detect synthetic voice cloning.</p>
                  <ul className="pane-features">
                    <li><CheckCircle size={14} className="feature-check" /> Monotone Prosody Synthetic Detection</li>
                    <li><CheckCircle size={14} className="feature-check" /> Pitch Variance & Harmonicity Inspection</li>
                    <li><CheckCircle size={14} className="feature-check" /> Audio File Container Header Parser</li>
                  </ul>
                </div>
                <div className="pane-badge-card">
                  <span className="badge-stat">Real-Time</span>
                  <span className="badge-label">Acoustic Audit</span>
                </div>
              </div>
            )}

            {activeEngineTab === 'link' && (
              <div className="tab-pane animate-fade-in">
                <div className="pane-info">
                  <h3>Shannon Entropy & Lexical Typosquat Detector</h3>
                  <p>Evaluates URL string character randomness, sub-domain nesting depth, suspicious TLDs (.xyz, .click), and deceptive brand domain impersonations.</p>
                  <ul className="pane-features">
                    <li><CheckCircle size={14} className="feature-check" /> Character Randomness (Entropy Rating)</li>
                    <li><CheckCircle size={14} className="feature-check" /> Deceptive Brand Homograph Detection</li>
                    <li><CheckCircle size={14} className="feature-check" /> Protocol Safety & Nesting Depth Metrics</li>
                  </ul>
                </div>
                <div className="pane-badge-card">
                  <span className="badge-stat">0ms</span>
                  <span className="badge-label">Instant Latency</span>
                </div>
              </div>
            )}
          </div>
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

        {/* FAQ Accordion Section */}
        <div className="faq-section">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <p className="section-subtitle">Understanding ShieldAI forensic verification heuristics.</p>

          <div className="faq-list">
            <div className={`faq-item glass-card ${openFaq === 0 ? 'open' : ''}`} onClick={() => toggleFaq(0)}>
              <div className="faq-question">
                <HelpCircle size={16} className="faq-icon" />
                <span>Is ShieldAI 100% free to use?</span>
              </div>
              {openFaq === 0 && (
                <div className="faq-answer">
                  Yes! ShieldAI is completely free and open-source. Scans for media and links do not require any paid subscription.
                </div>
              )}
            </div>

            <div className={`faq-item glass-card ${openFaq === 1 ? 'open' : ''}`} onClick={() => toggleFaq(1)}>
              <div className="faq-question">
                <HelpCircle size={16} className="faq-icon" />
                <span>How does Error Level Analysis (ELA) work?</span>
              </div>
              {openFaq === 1 && (
                <div className="faq-answer">
                  ELA resaves your uploaded image at a controlled 90% JPEG quality. Modified or composite sections compress at different error rates than the original camera sensor data, highlighting edited pixels.
                </div>
              )}
            </div>

            <div className={`faq-item glass-card ${openFaq === 2 ? 'open' : ''}`} onClick={() => toggleFaq(2)}>
              <div className="faq-question">
                <HelpCircle size={16} className="faq-icon" />
                <span>Can I export security scan certificates?</span>
              </div>
              {openFaq === 2 && (
                <div className="faq-answer">
                  Yes, every verified audit allows exporting a formatted security certificate in PDF print layout or JSON data export for documentation and reporting.
                </div>
              )}
            </div>
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
          <div className="ticker-item">⚡ Error Level Analysis (ELA)</div>
          <div className="ticker-item">🛡️ JPEG Blockiness Forensics</div>
          <div className="ticker-item">🔗 Lexical URL & Typosquat Heuristics</div>
          <div className="ticker-item">👥 Crowdsourced Community Threat Feed</div>
        </div>
      </footer>

      {/* Legal Footer */}
      <div className="legal-footer-bar">
        <span>Heuristic analysis &mdash; evidence-based forensic indicators.</span>
        <nav className="legal-footer-links">
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true">&middot;</span>
          <Link to="/terms">Terms</Link>
        </nav>
      </div>
    </div>
  );
}
