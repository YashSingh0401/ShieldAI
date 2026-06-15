import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ImageVerify from './pages/ImageVerify';
import LinkScan from './pages/LinkScan';
import Community from './pages/Community';
import Login from './pages/Login';
import VideoVerify from './pages/VideoVerify';
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
  const [user, setUser] = useState(null);
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

  
  const [videoEnabled, setVideoEnabled] = useState(() => {
    const saved = localStorage.getItem('shield_video_bg_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const isAuthenticated = !!user;

  const handleLogin = (userInfo) => {
    setUser(userInfo);
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handleToggleVideo = () => {
    setVideoEnabled(prev => {
      const nextVal = !prev;
      localStorage.setItem('shield_video_bg_enabled', JSON.stringify(nextVal));
      return nextVal;
    });
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
      {/* Global animated video background loop, conditionally rendered */}
      {videoEnabled && (
        <div className="video-bg-container">
          <video autoPlay loop muted playsInline className="video-bg">
            <source 
              src="https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-blue-and-purple-dots-31830-large.mp4" 
              type="video/mp4" 
            />
          </video>
        </div>
      )}

      {!isAuthenticated ? (
        <Login 
          onLogin={handleLogin} 
          videoEnabled={videoEnabled} 
          onToggleVideo={handleToggleVideo} 
        />
      ) : (
        <div className="app-container">
          {/* Ambient background glow elements */}
          <div className="bg-glow-blob blob-cyan"></div>
          <div className="bg-glow-blob blob-magenta"></div>
          <div className="bg-glow-blob blob-purple"></div>
          
          <Navbar 
            onLogout={handleLogout} 
            user={user} 
            videoEnabled={videoEnabled} 
            onToggleVideo={handleToggleVideo} 
          />
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard history={userHistory} />} />
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
              <Route path="/community" element={<Community />} />
            </Routes>
          </main>
        </div>
      )}
    </Router>
  );
}

export default App;
