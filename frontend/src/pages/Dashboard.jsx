import React from 'react';
import { ShieldCheck, Activity, Globe, FileImage, ShieldAlert, CheckCircle2, Film, Server, Cpu, Database } from 'lucide-react';
import StatCard from '../components/StatCard';
import './Dashboard.css';

export default function Dashboard({ history = [] }) {
  const safeHistory = Array.isArray(history) ? history : [];
  const totalScans = safeHistory.length;
  const threatsIntercepted = safeHistory.filter(item => item.status === 'danger' || item.risk >= 50).length;
  
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
    { name: 'Threats Blocked', count: threatsIntercepted, pct: pctThreats, color: 'var(--danger-gradient)' },
    { name: 'Secure Assets Cleared', count: totalScans - threatsIntercepted, pct: pctClean, color: 'var(--success-gradient)' },
    { name: 'Web URL Audits', count: urlScansCount, pct: pctUrls, color: 'var(--accent-gradient)' },
    { name: 'Media ELA Scans', count: imgScansCount, pct: pctImages, color: 'linear-gradient(90deg, #ec4899 0%, #f43f5e 100%)' },
    { name: 'Video Deepfake Checks', count: videoScansCount, pct: pctVideos, color: 'linear-gradient(90deg, #8b5cf6 0%, #d946ef 100%)' },
  ];

  const systemStatus = [
    { name: 'Image ELA Analyzer', desc: 'Error level analysis module', icon: Cpu },
    { name: 'AI Generation Detector', desc: 'Pixel noise variance checks', icon: Server },
    { name: 'URL Heuristics Engine', desc: 'Domain and entropy analysis', icon: Globe },
    { name: 'Video Container Scanner', desc: 'GAN face-swap detection', icon: Film },
    { name: 'Database Connection', desc: 'SQLite storage synchronized', icon: Database },
    { name: 'Authentication Service', desc: 'OAuth 2.0 ready', icon: ShieldCheck }
  ];

  return (
    <div className="dashboard-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your security scans, threat activity, and system status.</p>
      </header>

      <div className="stats-grid">
        <StatCard 
          title="Total Scans" 
          value={totalScans.toLocaleString()} 
          change="+18%" 
          icon={Activity} 
          colorClass="accent" 
          className="animate-fade-in cascade-1"
        />
        <StatCard 
          title="Threats Intercepted" 
          value={threatsIntercepted.toLocaleString()} 
          change="+24%" 
          icon={ShieldAlert} 
          colorClass="danger" 
          className="animate-fade-in cascade-2"
        />
        <StatCard 
          title="Verified Media" 
          value={verifiedMedia.toLocaleString()} 
          change="+12%" 
          icon={FileImage} 
          colorClass="purple" 
          className="animate-fade-in cascade-3"
        />
        <StatCard 
          title="Safety Index" 
          value={safetyIndex} 
          change="+0.8%" 
          icon={ShieldCheck} 
          colorClass="success" 
          className="animate-fade-in cascade-4"
        />
      </div>

      <div className="dashboard-grid-layout">
        
        <div className="glass-card sys-diagnostics-card animate-fade-in cascade-2">
          <div className="card-header">
            <h3>System Status</h3>
            <span className="card-subtitle">Active validation services</span>
          </div>
          
          <div className="diagnostics-grid">
            {systemStatus.map((service, idx) => {
              const ServiceIcon = service.icon;
              return (
                <div key={idx} className="diagnostics-item">
                  <div className="diag-icon-wrapper">
                    <ServiceIcon size={16} />
                  </div>
                  <div className="diag-info">
                    <span className="diag-name">{service.name}</span>
                    <span className="diag-desc">{service.desc}</span>
                  </div>
                  <div className="diag-badge">
                    <span className="diag-dot"></span>
                    <span className="diag-status-text">Online</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card chart-card animate-fade-in cascade-3">
          <div className="card-header">
            <h3>Scan Breakdown</h3>
            <span className="card-subtitle">Distribution across categories</span>
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
                      style={{ width: `${item.pct}%`, background: item.color }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="security-quote">
              <CheckCircle2 size={18} className="quote-icon" />
              <p>Community filters verified <strong>12 new reports</strong> in your area today.</p>
            </div>
          </div>
        </div>

        <div className="glass-card live-feed-card animate-fade-in cascade-4">
          <div className="card-header">
            <div className="feed-header-title">
              <span className="live-dot"></span>
              <h3>Recent Activity</h3>
            </div>
            <span className="card-subtitle">Latest scan results</span>
          </div>

          <div className="feed-body">
            {safeHistory.length === 0 ? (
              <div className="empty-feed-state">
                <p>No scans yet</p>
                <span>Run your first scan to see results here.</span>
              </div>
            ) : (
              <div className="activity-list">
                {safeHistory.slice(0, 7).map((act, idx) => (
                  <div key={idx} className={`activity-item status-${act.status}`}>
                    <div className="activity-icon-col">
                      {act.type === 'url' && <Globe size={14} />}
                      {act.type === 'image' && <FileImage size={14} />}
                      {act.type === 'video' && <Film size={14} />}
                    </div>
                    <div className="activity-info-col">
                      <span className="activity-target">{act.target}</span>
                      <span className="activity-result">{act.result}</span>
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
