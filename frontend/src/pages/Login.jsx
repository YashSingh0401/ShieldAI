import React, { useState, useEffect } from 'react';
import { ShieldCheck, Mail, Lock, User, RefreshCw, Video, VideoOff } from 'lucide-react';
import './Login.css';

export default function Login({ onLogin, videoEnabled, onToggleVideo }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleCredentialsSubmit = (e) => {
    e.preventDefault();
    onLogin({ name: isSignUp ? name : email.split('@')[0], email });
  };

  const handleCredentialResponse = (response) => {
    try {
      const token = response.credential;
      // Lightweight client-side base64 JWT payload decoder
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      const payload = JSON.parse(jsonPayload);
      if (payload) {
        onLogin({
          name: payload.name || payload.given_name || "Google User",
          email: payload.email,
          avatar: payload.picture
        });
      }
    } catch (err) {
      console.error("Failed to process Google OAuth JWT token:", err);
      alert("Verification of Google accounts failed.");
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


      {/* Background glow blobs */}
      <div className="bg-glow-blob blob-cyan"></div>
      <div className="bg-glow-blob blob-magenta"></div>
      
      <div className="glass-card login-card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">
            <ShieldCheck size={36} className="logo-icon" />
            <h2>SHIELD<span className="brand-highlight">.AI</span></h2>
          </div>
          <p className="login-subtitle">
            {isSignUp ? 'Create your secure account to start audits' : 'Sign in to access your security control panel'}
          </p>
        </div>

        {/* Google Sign In Button Container */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
          <div id="google-signin-btn-div"></div>
        </div>

        <div className="divider-line">
          <span>or continue with email</span>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleCredentialsSubmit} className="login-form">
          {isSignUp && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div className="input-with-icon">
                <User size={18} className="input-icon-left" />
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe" 
                  className="form-input login-input" 
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon-left" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" 
                className="form-input login-input" 
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon-left" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="form-input login-input" 
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary login-submit-btn">
            {isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <div className="login-footer">
          <span>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            <button onClick={() => setIsSignUp(!isSignUp)} className="toggle-auth-btn">
              {isSignUp ? 'Log In' : 'Sign Up'}
            </button>
          </span>
        </div>
      </div>

      {/* Simulated Google Popup Loading Overlay */}
      {googleLoading && (
        <div className="google-oauth-overlay">
          <div className="glass-card oauth-popup">
            <div className="oauth-spinner"></div>
            <h4>Connecting Google Account</h4>
            <p>Verifying Google OAuth 2.0 signatures and importing account details securely...</p>
          </div>
        </div>
      )}
    </div>
  );
}
