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

const INITIAL_HISTORY = [
  { id: 1, type: 'url', target: 'http://billing-power-pay.com', result: 'High Risk (Phishing)', risk: 85, status: 'danger', time: '2 hours ago' },
  { id: 2, type: 'image', target: 'nikon_d850_landscape.jpg', result: 'Authentic (No ELA discrepancy)', risk: 8, status: 'success', time: '5 hours ago' },
  { id: 3, type: 'video', target: 'deepfake_speech_interview.mp4', result: 'AI Deepfake (GAN Face Swap)', risk: 89, status: 'danger', time: '12 hours ago' },
  { id: 4, type: 'url', target: 'https://github.com/login', result: 'Safe (Verified Domain)', risk: 4, status: 'success', time: '1 day ago' },
  { id: 5, type: 'image', target: 'invoice_draft_photoshop.jpg', result: 'Modified (EXIF Software flag)', risk: 78, status: 'danger', time: '2 days ago' },
  { id: 6, type: 'url', target: 'http://paytm-security-kyc.net', result: 'High Risk (Typosquatting)', risk: 90, status: 'danger', time: '3 days ago' },
];

function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [userHistory, setUserHistory] = useState(() => {
    const saved = localStorage.getItem('shield_user_history');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse user history", e);
      }
    }
    return INITIAL_HISTORY;
  });

  useEffect(() => {
    localStorage.setItem('shield_user_history', JSON.stringify(userHistory));
  }, [userHistory]);

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
    const newItem = {
      id: Date.now(),
      time: 'Just now',
      ...item
    };
    setUserHistory(prev => [newItem, ...prev]);
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
                    <Route path="/dashboard" element={<Dashboard history={userHistory} />} />
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
                    <Route path="*" element={<Dashboard history={userHistory} />} />
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
