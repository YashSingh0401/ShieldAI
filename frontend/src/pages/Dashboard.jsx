import React, { useState, useEffect } from 'react';
import { ShieldCheck, Activity, Globe, FileImage, ShieldAlert, CheckCircle2, Film, Server, Cpu, Database, Volume2 } from 'lucide-react';
import StatCard from '../components/StatCard';
import { api } from '../api/client.js';
import './Dashboard.css';

export default function Dashboard({ historyVersion = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/verify/history')
      .then((data) => {
        if (!cancelled) {
          setLogs(Array.isArray(data) ? data : []);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch scan history:', err);
          setError(err.message || 'Could not load scan history.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [historyVersion]);

  const safeHistory = Array.isArray(logs) ? logs : [];
  const totalScans = safeHistory.length;
  const threatsIntercepted = safeHistory.filter(item => item.status === 'danger' || item.risk_score >= 50).length;

  const verifiedMedia = safeHistory.filter(item => item.scan_type === 'image' || item.scan_type === 'video').length;

  const avgRisk = totalScans > 0
    ? safeHistory.reduce((sum, item) => sum + item.risk_score, 0) / totalScans
    : 0;
  const safetyIndex = totalScans > 0
    ? (100 - avgRisk).toFixed(1) + '%'
    : '100%';

  const urlScansCount = safeHistory.filter(item => item.scan_type === 'url').length;
  const imgScansCount = safeHistory.filter(item => item.scan_type === 'image').length;
  const videoScansCount = safeHistory.filter(item => item.scan_type === 'video').length;

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
    { name: 'Video Container Scanner', desc: 'Frame compression timeline', icon: Film },
    { name: 'Audio Prosody Analyzer', desc: 'Synthetic voice heuristics', icon: Volume2 },
    { name: 'Database Connection', desc: 'Scan history storage', icon: Database }
  ];

  const formatTime = (ts) => {
    if (!ts) return 'recent';
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } catch {
      return 'recent';
    }
  };

  const recentActivity = safeHistory.slice(0, 7).map((log) => ({
    type: log.scan_type,
    target: log.target,
    result: log.status === 'danger' ? `Flagged (${Math.round(log.risk_score)}% risk)` : 'Safe',
    status: log.status === 'danger' ? 'danger' : 'success',
    time: formatTime(log.timestamp),
  }));

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
          icon={Activity} 
          colorClass="accent" 
          className="animate-fade-in cascade-1"
        />
        <StatCard 
          title="Threats Intercepted" 
          value={threatsIntercepted.toLocaleString()} 
          icon={ShieldAlert} 
          colorClass="danger" 
          className="animate-fade-in cascade-2"
        />
        <StatCard 
          title="Verified Media" 
          value={verifiedMedia.toLocaleString()} 
          icon={FileImage} 
          colorClass="purple" 
          className="animate-fade-in cascade-3"
        />
        <StatCard 
          title="Safety Index" 
          value={safetyIndex} 
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
              <p>All statistics are computed from your verified scan history.</p>
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
            {loading ? (
              <div className="empty-feed-state">
                <p>Loading scans…</p>
                <span>Fetching your audit trail.</span>
              </div>
            ) : error ? (
              <div className="empty-feed-state">
                <p>Failed to load</p>
                <span>{error}</span>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="empty-feed-state">
                <p>No scans yet</p>
                <span>Run your first scan to see results here.</span>
              </div>
            ) : (
              <div className="activity-list">
                {recentActivity.map((act, idx) => (
                  <div key={idx} className={`activity-item status-${act.status}`}>
                    <div className="activity-icon-col">
                      {act.type === 'url' && <Globe size={14} />}
                      {act.type === 'image' && <FileImage size={14} />}
                      {act.type === 'video' && <Film size={14} />}
                      {act.type === 'audio' && <Volume2 size={14} />}
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
