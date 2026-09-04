import React, { useState, useEffect } from 'react';
import { User, Shield, ShieldAlert, ShieldCheck, Activity, Award, Clock, RefreshCw } from 'lucide-react';
import { api } from '../api/client.js';
import RiskScoreMeter from '../components/RiskScoreMeter';
import toast from 'react-hot-toast';
import './Profile.css';

export default function Profile({ user }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const data = await api.get('/user/profile');
      setProfileData(data);
    } catch (err) {
      // 401 = session expired — don't spam toast, fallback to local stats
      if (err.status === 401) {
        console.warn("Profile telemetry requires fresh login", err);
      } else {
        console.error("Failed to load profile telemetry", err);
      }
      // keep fallback data (quota unlimited, 0 scans) — don't show red toast
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="profile-container">
        <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading Auditor Credentials & Stats...</p>
        </div>
      </div>
    );
  }

  const quota = profileData?.quota || { limit: 999999, used_today: 0, remaining_today: 999999 };
  const stats = profileData?.stats || { total_scans: 0, threats_flagged: 0, clean_verified: 0, by_type: {} };
  const isUnlimited = quota.limit >= 900000;
  const quotaPercent = isUnlimited ? 0 : Math.round((quota.used_today / quota.limit) * 100);

  return (
    <div className="profile-container animate-fade-in">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Auditor Profile</h1>
          <p className="page-subtitle">Personal credentials, operational quotas, and security telemetry history.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchProfile} title="Refresh Telemetry">
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <div className="profile-layout-grid">
        {/* User Identity Card */}
        <div className="glass-card profile-identity-card">
          <div className="profile-avatar-large">
            <User size={48} className="profile-avatar-icon" />
            <span className="profile-status-indicator"></span>
          </div>

          <h2 className="profile-user-name">{profileData?.name || user?.name || 'Security Auditor'}</h2>
          <span className="profile-user-email">{profileData?.email || user?.email}</span>

          <div className="profile-role-badge">
            <Award size={14} />
            <span>{localStorage.getItem('shield_role') ? localStorage.getItem('shield_role').toUpperCase() : 'VERIFIED AUDITOR'}</span>
          </div>

          <div className="profile-quota-widget">
            <div className="quota-widget-header">
              <span>Daily Media Quota (UTC)</span>
              <span className="quota-fraction">{isUnlimited ? "Unlimited" : `${quota.used_today} / ${quota.limit}`}</span>
            </div>
            <div className="quota-progress-track">
              <div 
                className="quota-progress-bar" 
                style={{ 
                  width: `${isUnlimited ? 100 : Math.min(100, quotaPercent)}%`,
                  background: isUnlimited ? 'var(--success)' : quotaPercent >= 100 ? 'var(--rose)' : quotaPercent >= 70 ? 'var(--warning)' : 'var(--accent)'
                }}
              />
            </div>
            <span className="quota-reset-hint">
              <Clock size={12} /> {isUnlimited ? "No daily cap — unlimited scans" : `${quota.remaining_today} scans remaining today`}
            </span>
          </div>
        </div>

        {/* Security Telemetry Stats Column */}
        <div className="profile-stats-col">
          <div className="profile-stats-grid">
            <div className="glass-card stat-tile">
              <div className="stat-tile-header">
                <Activity size={18} className="stat-icon-cyan" />
                <span className="stat-label">Total Audits</span>
              </div>
              <span className="stat-value">{stats.total_scans}</span>
              <span className="stat-desc">Lifetime processed artifacts</span>
            </div>

            <div className="glass-card stat-tile">
              <div className="stat-tile-header">
                <ShieldAlert size={18} className="stat-icon-rose" />
                <span className="stat-label">Threats Intercepted</span>
              </div>
              <span className="stat-value text-rose">{stats.threats_flagged}</span>
              <span className="stat-desc">Deceptive / tampered files</span>
            </div>

            <div className="glass-card stat-tile">
              <div className="stat-tile-header">
                <ShieldCheck size={18} className="stat-icon-emerald" />
                <span className="stat-label">Verified Authentic</span>
              </div>
              <span className="stat-value text-emerald">{stats.clean_verified}</span>
              <span className="stat-desc">Passed cryptographic check</span>
            </div>
          </div>

          {/* Breakdown By Type */}
          <div className="glass-card profile-type-breakdown-card">
            <h3 className="breakdown-card-title">Audits by Engine Pipeline</h3>
            <div className="type-breakdown-bars">
              {[
                { type: 'image', label: 'Image Forensics (ELA)', icon: '🖼️' },
                { type: 'url', label: 'Phishing URL Analysis', icon: '🌐' },
                { type: 'video', label: 'Video Container Audit', icon: '🎬' },
                { type: 'audio', label: 'Audio Prosody Check', icon: '🎙️' }
              ].map(item => {
                const count = stats.by_type?.[item.type] || 0;
                const pct = stats.total_scans > 0 ? Math.round((count / stats.total_scans) * 100) : 0;
                return (
                  <div key={item.type} className="breakdown-type-row">
                    <div className="row-info">
                      <span className="row-label">{item.icon} {item.label}</span>
                      <span className="row-count">{count} scans ({pct}%)</span>
                    </div>
                    <div className="type-track">
                      <div className="type-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
