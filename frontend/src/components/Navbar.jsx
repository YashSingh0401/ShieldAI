import React from 'react';
import { Link as RouterLink, NavLink } from 'react-router-dom';
import { LayoutDashboard, ShieldCheck, Link, ShieldAlert, LogOut, User, Film, Volume2, History } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ onLogout, user }) {


  return (
    <nav className="navbar-container">
      <RouterLink to="/" className="navbar-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <ShieldCheck className="brand-logo" size={24} />
        <span className="brand-text">Shield<span className="brand-highlight">.AI</span></span>
      </RouterLink>
      
      <div className="navbar-menu">
        <span className="nav-section-label">Services</span>
        
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
          <span className="menu-text">Image Verify</span>
        </NavLink>

        <NavLink 
          to="/verify-video" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Film size={18} />
          <span className="menu-text">Video Verify</span>
        </NavLink>
        
        <NavLink 
          to="/scan-link" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Link size={18} />
          <span className="menu-text">Link Scan</span>
        </NavLink>

        <NavLink 
          to="/audio-verify" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Volume2 size={18} />
          <span className="menu-text">Audio Verify</span>
        </NavLink>

        <NavLink 
          to="/history" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <History size={18} />
          <span className="menu-text">Scan History</span>
        </NavLink>
      </div>

      <div className="navbar-footer">


        {user && (
          <div className="user-profile-widget">
            <div className="user-avatar">
              <User size={14} />
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email || 'Authenticated'}</span>
            </div>
          </div>
        )}

        <button onClick={onLogout} className="btn-logout">
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
