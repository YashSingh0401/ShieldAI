import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ImageVerify from './pages/ImageVerify';
import LinkScan from './pages/LinkScan';
import Login from './pages/Login';
import Landing from './pages/Landing';
import VideoVerify from './pages/VideoVerify';
import AudioVerify from './pages/AudioVerify';
import ScanHistory from './pages/ScanHistory';
import { getStoredUser } from './api/client.js';
import './App.css';

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
  };

  const addHistoryItem = (item) => {
    // Server-side history is persisted by the verify endpoints; this only
    // triggers the Dashboard to refresh with the latest server data.
    setHistoryVersion(v => v + 1);
  };

  return (
    <Router>
      <Routes>
        {/* Public Root Route is ALWAYS the Landing Page */}
        <Route path="/" element={<Landing user={user} />} />
        
        {/* Public Login Route */}
        <Route path="/login" element={<Login onLogin={handleLogin} user={user} />} />

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
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard historyVersion={historyVersion} />} />
                    <Route 
                      path="/verify-image" 
                      element={
                        <ImageVerify 
                          onVerify={(info) => addHistoryItem({ type: 'image', ...info })} 
                        />
                      } 
                    />
                    <Route 
                      path="/verify-video" 
                      element={
                        <VideoVerify 
                          onVerify={(info) => addHistoryItem({ type: 'video', ...info })} 
                        />
                      } 
                    />
                    <Route 
                      path="/scan-link" 
                      element={
                        <LinkScan 
                          onScan={(info) => addHistoryItem({ type: 'url', ...info })} 
                        />
                      } 
                    />
                    <Route 
                      path="/audio-verify" 
                      element={
                        <AudioVerify 
                          onVerify={(info) => addHistoryItem({ type: 'audio', ...info })} 
                        />
                      } 
                    />
                    <Route 
                      path="/history" 
                      element={
                        <ScanHistory />
                      } 
                    />
                    {/* Fallback to dashboard */}
                    <Route path="*" element={<Dashboard historyVersion={historyVersion} />} />
                  </Routes>
                </main>
              </div>
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
