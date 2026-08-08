import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { api, setToken, setStoredUser } from '../api/client.js';
import './Login.css';

export default function Login({ onLogin, user }) {
  const navigate = useNavigate();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState('Connecting Google Account');
  const [loadingMessage, setLoadingMessage] = useState('Verifying your account details securely...');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleCredentialResponse = async (response) => {
    setAuthError('');
    setLoadingTitle('Connecting Google Account');
    setLoadingMessage('Verifying your Google token securely...');
    setGoogleLoading(true);
    try {
      const data = await api.post('/auth/google', { credential: response.credential });
      setToken(data.token);
      setStoredUser(data.user);
      onLogin(data.user);
      setGoogleLoading(false);
      navigate('/dashboard');
    } catch (err) {
      console.error("Google authentication failed:", err);
      setAuthError(err.message || "Verification of Google accounts failed.");
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const initGoogleOAuth = () => {
      /* global google */
      if (typeof google !== 'undefined') {
        try {
          const client_id = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1028308412850-dummyclientid.apps.googleusercontent.com";
          
          google.accounts.id.initialize({
            client_id: client_id,
            callback: handleCredentialResponse
          });

          google.accounts.id.renderButton(
            document.getElementById("google-signin-btn-div"),
            { 
              theme: "filled_blue", 
              size: "large",
              width: 360,
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

    // Set up polling checks in case the external script finishes loading asynchronously
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
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">
            <ShieldCheck size={32} className="logo-icon" />
            <h1 className="login-title">Shield<span className="brand-highlight">.AI</span></h1>
          </div>
          <p className="login-subtitle">
            Sign in with Google to access your security control panel
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
          <div id="google-signin-btn-div"></div>
        </div>

        {authError && (
          <div style={{ color: 'var(--rose)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '12px' }}>
            {authError}
          </div>
        )}
      </div>

      {googleLoading && (
        <div className="google-oauth-overlay">
          <div className="oauth-popup">
            <div className="spinner"></div>
            <h4>{loadingTitle}</h4>
            <p>{loadingMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
