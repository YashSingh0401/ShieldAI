import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import CyberBackground from './components/CyberBackground';
import OnboardingModal from './components/OnboardingModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Dashboard from './pages/Dashboard';
import ImageVerify from './pages/ImageVerify';
import LinkScan from './pages/LinkScan';
import Login from './pages/Login';
import Landing from './pages/Landing';
import VideoVerify from './pages/VideoVerify';
import AudioVerify from './pages/AudioVerify';
import ScanHistory from './pages/ScanHistory';
import Profile from './pages/Profile';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import ErrorBoundary from './components/ErrorBoundary';
import Admin from './pages/Admin.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import { AdminRoute } from './components/AdminRoute.jsx';
import { getStoredUser } from './api/client.js';
import './App.css';

/** Wraps every page in a page-enter div so route changes animate in */
function AnimatedRoutes({ user, addHistoryItem, historyVersion }) {
  const location = useLocation();
  useKeyboardShortcuts();

  return (
    <>
      <OnboardingModal />
      <div className="page-enter" key={location.pathname}>
        <Routes location={location}>
          <Route path="/dashboard" element={<Dashboard historyVersion={historyVersion} />} />
          <Route
            path="/verify-image"
            element={<ImageVerify onVerify={(info) => addHistoryItem({ type: 'image', ...info })} />}
          />
          <Route
            path="/verify-video"
            element={<VideoVerify onVerify={(info) => addHistoryItem({ type: 'video', ...info })} />}
          />
          <Route
            path="/scan-link"
            element={<LinkScan onScan={(info) => addHistoryItem({ type: 'url', ...info })} />}
          />
          <Route
            path="/audio-verify"
            element={<AudioVerify onVerify={(info) => addHistoryItem({ type: 'audio', ...info })} />}
          />
          <Route path="/history" element={<ScanHistory />} />
          <Route path="/profile" element={<Profile user={user} />} />
          <Route path="*" element={<Dashboard historyVersion={historyVersion} />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [historyVersion, setHistoryVersion] = useState(0);

  const isAuthenticated = !!user;

  const handleLogin = (userInfo) => {
    setUser(userInfo);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('shield_session_token');
    localStorage.removeItem('shield_user');
    localStorage.removeItem('shield_admin_token');
    localStorage.removeItem('shield_admin_user');
  };

  const addHistoryItem = (item) => {
    setHistoryVersion(v => v + 1);
  };

  return (
    <ErrorBoundary>
      <Router>
        <CyberBackground />
        <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'blur(16px)',
            fontSize: '0.85rem',
            fontWeight: '500',
            padding: '12px 16px',
            zIndex: 99999,
          },
          success: {
            iconTheme: {
              primary: 'var(--success)',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--danger)',
              secondary: '#ffffff',
            },
          },
        }}
      />
      <Routes>
        {/* Public Root Route is ALWAYS the Landing Page */}
        <Route path="/" element={<Landing user={user} />} />
        
        {/* Public Login Route */}
        <Route path="/login" element={<Login onLogin={handleLogin} user={user} />} />
        
        {/* Admin Login Route - Gmail only */}
        <Route path="/admin-login" element={<AdminLogin />} />

        {/* Admin Portal Routes - Guarded by AdminRoute */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <div className="app-container">
                <Navbar onLogout={handleLogout} user={user} />
                <main className="main-content">
                  <Admin />
                </main>
              </div>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users/:email"
          element={
            <AdminRoute>
              <div className="app-container">
                <Navbar onLogout={handleLogout} user={user} />
                <main className="main-content">
                  <Admin />
                </main>
              </div>
            </AdminRoute>
          }
        />
        
        {/* Public Legal Routes */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Protected Console Workspace Routes */}
        <Route
          path="/*"
          element={
            !isAuthenticated ? (
              <Login onLogin={handleLogin} user={user} />
            ) : (
              <div className="app-container">
                <Navbar onLogout={handleLogout} user={user} />
                <main className="main-content">
                  <AnimatedRoutes
                    user={user}
                    addHistoryItem={addHistoryItem}
                    historyVersion={historyVersion}
                  />
                </main>
              </div>
            )
          }
        />
        </Routes>
        </Router>
        </ErrorBoundary>
  );
}

export default App;