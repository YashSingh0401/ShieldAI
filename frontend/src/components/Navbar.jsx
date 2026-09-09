import React, { useState } from 'react';
import { Link as RouterLink, NavLink } from 'react-router-dom';
import { LayoutDashboard, ShieldCheck, Link, ShieldAlert, LogOut, User, Film, Volume2, History, Sun, Moon, Activity, Menu, X } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import './Navbar.css';

export default function Navbar({ onLogout, user }) {
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile Top Header Bar with Brand & Hamburger */}
      <div className="mobile-top-bar">
        <RouterLink to="/" className="mobile-brand" onClick={closeMobile}>
          <ShieldCheck className="brand-logo" size={22} />
          <span className="brand-text">Shield<span className="brand-highlight">.AI</span></span>
        </RouterLink>
        <button 
          className="mobile-menu-btn" 
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle Navigation Menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Backdrop overlay for mobile drawer */}
      {mobileOpen && <div className="mobile-backdrop" onClick={closeMobile}></div>}

      <nav className={`navbar-container ${mobileOpen ? 'mobile-drawer-open' : ''}`}>
        <RouterLink to="/" className="navbar-brand" style={{ textDecoration: 'none', color: 'inherit' }} onClick={closeMobile}>
          <div className="brand-icon-wrapper">
            <ShieldCheck className="brand-logo" size={25} />
            <span className="brand-pulse-dot"></span>
          </div>
          <div className="brand-text-block">
            <span className="brand-text">Shield<span className="brand-highlight">.AI</span></span>
            <span className="brand-version">V.4.1 HUD</span>
          </div>
        </RouterLink>
      
      <div className="navbar-menu">
        <span className="nav-section-label">Engines & Console</span>
        
        <NavLink 
          to="/dashboard" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
          end
        >
          <LayoutDashboard size={18} />
          <span className="menu-text">Dashboard</span>
        </NavLink>
        
        <NavLink 
          to="/verify-image" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <ShieldAlert size={18} />
          <span className="menu-text">Image Forensics</span>
        </NavLink>

        <NavLink 
          to="/verify-video" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Film size={18} />
          <span className="menu-text">Video Audit</span>
        </NavLink>
        
        <NavLink 
          to="/scan-link" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Link size={18} />
          <span className="menu-text">Phishing Scan</span>
        </NavLink>

        <NavLink 
          to="/audio-verify" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Volume2 size={18} />
          <span className="menu-text">Audio Prosody</span>
        </NavLink>

        <NavLink 
          to="/history" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <History size={18} />
          <span className="menu-text">Audit Logs</span>
        </NavLink>
      </div>

      <div className="navbar-footer">
        {/* System Health Status */}
        <div className="system-status-pill">
          <Activity size={13} className="status-pulse-icon" />
          <span>All Engines Live</span>
        </div>

        {/* Theme Mode Toggle Button */}
        <button onClick={toggleTheme} className="btn-theme-toggle" title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light Theme' : 'Cyber Dark'}</span>
        </button>

        {user && user.email && user.email.toLowerCase() === 'yashwardhans782@gmail.com' && (
          <RouterLink to="/admin" className="menu-item admin-menu-item" style={{ color: 'var(--danger)' }}>
            <ShieldCheck size={18} />
            <span className="menu-text">Admin Panel</span>
            <span className="admin-badge">ADMIN</span>
          </RouterLink>
        )}
        {user && (
          <RouterLink to="/profile" className="user-profile-widget" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="user-avatar">
              <User size={14} />
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email || 'Authenticated'}</span>
            </div>
          </RouterLink>
        )}

        <button onClick={onLogout} className="btn-logout">
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
    </>
  );
}
