import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShieldCheck, Link, Users, ShieldAlert, LogOut, User, Video, VideoOff, Film } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ onLogout, user, videoEnabled, onToggleVideo }) {
  return (
    <nav className="navbar-container">
      <div className="navbar-brand">
        <ShieldCheck className="brand-logo" size={28} />
        <span className="brand-text">SHIELD<span className="brand-highlight">.AI</span></span>
      </div>
      
      <div className="navbar-menu">
        <NavLink 
          to="/" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
          end
        >
          <LayoutDashboard size={20} />
          <span className="menu-text">Dashboard</span>
        </NavLink>
        
        <NavLink 
          to="/verify-image" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <ShieldAlert size={20} />
          <span className="menu-text">Image Verify</span>
        </NavLink>

        <NavLink 
          to="/verify-video" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Film size={20} />
          <span className="menu-text">Video Verify</span>
        </NavLink>
        
        <NavLink 
          to="/scan-link" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Link size={20} />
          <span className="menu-text">Link Scan</span>
        </NavLink>
        
        <NavLink 
          to="/community" 
          className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
        >
          <Users size={20} />
          <span className="menu-text">Community</span>
        </NavLink>
      </div>

      <div className="navbar-footer">
        {user && (
          <div className="user-profile-widget">
            <div className="user-avatar">
              <User size={16} />
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email || 'Authenticated'}</span>
            </div>
          </div>
        )}
        
        <div className="system-status">
          <span className="status-indicator online"></span>
          <span className="status-text">Shield Protection Active</span>
        </div>



        <button onClick={onLogout} className="btn-logout">
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
