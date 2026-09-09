/* global google */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, ShieldAlert, Zap } from 'lucide-react';
import { api, setToken, setStoredUser } from '../api/client.js';
import './AdminLogin.css';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState('Connecting Google Account');
  const [loadingMessage, setLoadingMessage] = useState('Verifying admin account...');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('shield_admin_user');
    if (stored) {
      const user = JSON.parse(stored);
      if (user.email === 'yashwardhans782@gmail.com') {
        setToken(user.token);
        setStoredUser(user);
        navigate('/admin');
      } else {
        localStorage.removeItem('shield_admin_user');
        localStorage.removeItem('shield_user');
        setAuthError('Only yashwardhans782@gmail.com can access Admin Panel');
        navigate('/login');
      }
    }
  }, [navigate]);

  const handleCredentialResponse = async (response) => {
    setAuthError('');
    setLoadingTitle('Connecting Google Account');
    setLoadingMessage('Verifying admin token securely...');
    setGoogleLoading(true);
    try {
      const data = await api.post('/admin/login', { credential: response.credential });
      localStorage.setItem('shield_admin_token', data.token);
      localStorage.setItem('shield_admin_user', JSON.stringify(data.user));
      setToken(data.token);
      setStoredUser(data.user);
      navigate('/admin');
    } catch (err) {
      console.error("Admin login failed:", err);
      setAuthError(err.message || 'Admin login failed. Only yashwardhans782@gmail.com is authorized.');
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const initGoogleOAuth = () => {
      if (typeof google !== 'undefined') {
        try {
          const client_id = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1028308412850-dummyclientid.apps.googleusercontent.com";
          
          google.accounts.id.initialize({
            client_id: client_id,
            callback: handleCredentialResponse
          });

          google.accounts.id.renderButton(
            document.getElementById("google-signin-btn-admin-div"),
            { 
              theme: "filled_blue", 
              size: "large",
              width: 340,
              text: "signin_with",
              shape: "rectangular"
            }
          );
        } catch (err) {
          console.error("Google Identity Services render error:", err);
        }
      }
    };

    initGoogleOAuth();

    const pollTimer = setInterval(() => {
      if (typeof google !== 'undefined') {
        initGoogleOAuth();
        clearInterval(pollTimer);
      }
    }, 500);

    return () => clearInterval(pollTimer);
  }, []);

  return (
    <div className="login-page-container">
      <div className="login-card glass-card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">
            <ShieldCheck size={36} className="logo-icon" />
            <h1 className="login-title">Shield<span className="brand-highlight">.AI</span></h1>
          </div>
          <p className="login-subtitle">Admin Authentication</p>
        </div>

        <div className="login-oauth-wrapper">
          <div id="google-signin-btn-admin-div"></div>
        </div>

        {authError && (
          <div className="auth-error-banner">
            {authError}
          </div>
        )}

        <div className="divider-line">Or use stored session</div>

        {googleLoading && (
          <div className="google-oauth-overlay">
            <div className="oauth-popup glass-card">
              <div className="spinner"></div>
              <h4>{loadingTitle}</h4>
              <p>{loadingMessage}</p>
            </div>
          </div>
        )}

        {!googleLoading && (
          <div className="login-features">
            <div className="login-feature-item">
              <ShieldCheck size={14} className="feature-icon" />
              <span>Gmail-only admin access</span>
            </div>
            <div className="login-feature-item">
              <Zap size={14} className="feature-icon" />
              <span>Single authorized account</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}