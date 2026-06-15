import React from 'react';
import { ShieldCheck, Activity, Globe, FileImage, ShieldAlert, CheckCircle2, Film, Server, Cpu, Database, Wifi } from 'lucide-react';
import StatCard from '../components/StatCard';
import './Dashboard.css';

export default function Dashboard({ history = [] }) {
  const safeHistory = Array.isArray(history) ? history : [];
  const totalScans = safeHistory.length;
  const threatsIntercepted = safeHistory.filter(item => item.status === 'danger' || item.risk >= 50).length;
  
  // Dynamic media count including images and videos
  const verifiedMedia = safeHistory.filter(item => item.type === 'image' || item.type === 'video').length;
  
  const avgRisk = totalScans > 0 
    ? safeHistory.reduce((sum, item) => sum + item.risk, 0) / totalScans 
    : 0;
  const safetyIndex = totalScans > 0 
    ? (100 - avgRisk).toFixed(1) + '%' 
    : '100%';

  const urlScansCount = safeHistory.filter(item => item.type === 'url').length;
  const imgScansCount = safeHistory.filter(item => item.type === 'image').length;
  const videoScansCount = safeHistory.filter(item => item.type === 'video').length;
  
  const pctThreats = totalScans > 0 ? Math.round((threatsIntercepted / totalScans) * 100) : 0;
  const pctClean = totalScans > 0 ? Math.round(((totalScans - threatsIntercepted) / totalScans) * 100) : 0;
  const pctUrls = totalScans > 0 ? Math.round((urlScansCount / totalScans) * 100) : 0;
  const pctImages = totalScans > 0 ? Math.round((imgScansCount / totalScans) * 100) : 0;
  const pctVideos = totalScans > 0 ? Math.round((videoScansCount / totalScans) * 100) : 0;

  const categoryBreakdown = [
    { name: 'Threats Blocked', count: threatsIntercepted, pct: pctThreats, color: 'linear-gradient(90deg, var(--rose), var(--magenta))' },
    { name: 'Secure Assets Cleared', count: totalScans - threatsIntercepted, pct: pctClean, color: 'linear-gradient(90deg, var(--emerald), #00d2ff)' },
    { name: 'Web URL Audits', count: urlScansCount, pct: pctUrls, color: 'linear-gradient(90deg, var(--cyan), var(--purple))' },
    { name: 'Media ELA Scans', count: imgScansCount, pct: pctImages, color: 'linear-gradient(90deg, var(--magenta), var(--indigo))' },
    { name: 'Video Deepfake Checks', count: videoScansCount, pct: pctVideos, color: 'linear-gradient(90deg, var(--purple), var(--rose))' },
  ];

  const systemStatus = [
    { name: 'Image ELA Analyzer', desc: 'Neural stats module enabled', status: 'ONLINE', icon: Cpu },
    { name: 'AI Generation Detector', desc: 'Pixel noise variance checks', status: 'ONLINE', icon: Server },
    { name: 'URL Heuristics Engine', desc: 'Shannon Entropy scanner online', status: 'ONLINE', icon: Globe },
    { name: 'Video Container Scanner', desc: 'GAN face-swap boundary mapper', status: 'ONLINE', icon: Film },
    { name: 'Relational Database', desc: 'SQLite storage synchronized', status: 'CONNECTED', icon: Database },
    { name: 'Google OAuth 2.0 Auth', desc: 'External ID token verified', status: 'ACTIVE', icon: ShieldCheck }
  ];

  return (
    <div className="dashboard-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Command Telemetry Board</h1>
        <p className="page-subtitle">Real-time fraud verification engines, deepfake timelines, and crowdsourced reporting audits.</p>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard 
          title="Total Scans Executed" 
          value={totalScans.toLocaleString()} 
          change="+18%" 
          icon={Activity} 
          colorClass="cyan" 
          className="animate-fade-in cascade-1"
        />
        <StatCard 
          title="Threats Intercepted" 
          value={threatsIntercepted.toLocaleString()} 
          change="+24%" 
          icon={ShieldAlert} 
          colorClass="rose" 
          className="animate-fade-in cascade-2"
        />
        <StatCard 
          title="Verified Media Assets" 
          value={verifiedMedia.toLocaleString()} 
          change="+12%" 
          icon={FileImage} 
          colorClass="magenta" 
          className="animate-fade-in cascade-3"
        />
        <StatCard 
          title="Global Safety Index" 
          value={safetyIndex} 
          change="+0.8%" 
          icon={ShieldCheck} 
          colorClass="emerald" 
          className="animate-fade-in cascade-4"
        />
      </div>

      {/* Main Layout Splits */}
      <div className="dashboard-grid-layout">
        
        {/* Col 1: System Status Diagnostics */}
        <div className="glass-card sys-diagnostics-card animate-fade-in cascade-2">
          <div className="card-header">
            <h3>Engine Diagnostic Grid</h3>
            <span className="card-subtitle">Active local & API validation services</span>
          </div>
          
          <div className="diagnostics-grid">
            {systemStatus.map((service, idx) => {
              const ServiceIcon = service.icon;
              return (
                <div key={idx} className="diagnostics-item">
                  <div className="diag-icon-wrapper">
                    <ServiceIcon size={18} />
                  </div>
                  <div className="diag-info">
                    <span className="diag-name">{service.name}</span>
                    <span className="diag-desc">{service.desc}</span>
                  </div>
                  <div className="diag-badge-glow">
                    <span className="live-pulse"></span>
                    <span className="diag-status-text">{service.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 2: Breakdown Statistics */}
        <div className="glass-card chart-card animate-fade-in cascade-3">
          <div className="card-header">
            <h3>Scam Category Telemetry</h3>
            <span className="card-subtitle">Distribution of community reported cases</span>
          </div>
          
          <div className="chart-body">
            <div className="bar-chart-container">
              {categoryBreakdown.map((item, idx) => (
                <div key={idx} className="chart-bar-row">
                  <div className="bar-label-group">
                    <span className="bar-name">{item.name}</span>
                    <span className="bar-val">{item.count} ({item.pct}%)</span>
                  </div>
                  <div className="bar-track">
                    <div 
                      className="bar-fill" 
                      style={{ 
                        width: `${item.pct}%`, 
                        background: item.color,
                        boxShadow: `0 0 10px rgba(0, 240, 255, 0.2)`
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="security-quote">
              <CheckCircle2 size={20} className="quote-icon" />
              <p>Community filters verified <strong>12 new reports</strong> in your area today. Verify links before interacting.</p>
            </div>
          </div>
        </div>

        {/* Col 3: Live Feed */}
        <div className="glass-card live-feed-card animate-fade-in cascade-4">
          <div className="card-header">
            <div className="feed-header-title">
              <span className="live-pulse pulse-red"></span>
              <h3>Live Protection Feed</h3>
            </div>
            <span className="card-subtitle">Recent automated analysis results</span>
          </div>

          <div className="feed-body">
            {safeHistory.length === 0 ? (
              <div className="empty-feed-state">
                <Wifi size={32} className="empty-feed-icon" />
                <p>Telemetry stream active</p>
                <span>Run audits or check community logs to populate the feed.</span>
              </div>
            ) : (
              <div className="activity-list">
                {safeHistory.slice(0, 7).map((act, idx) => (
                  <div key={idx} className={`activity-item status-${act.status}`}>
                    <div className="activity-icon-col">
                      {act.type === 'url' && <Globe size={16} />}
                      {act.type === 'image' && <FileImage size={16} />}
                      {act.type === 'video' && <Film size={16} />}
                    </div>
                    <div className="activity-info-col">
                      <span className="activity-target">{act.target}</span>
                      <span className="activity-result">{act.result} (Score: {act.risk}%)</span>
                    </div>
                    <span className="activity-time">{act.time || 'recent'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
