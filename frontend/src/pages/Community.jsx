import React, { useState, useEffect } from 'react';
import { Search, Plus, X, AlertOctagon } from 'lucide-react';
import ReportCard from '../components/ReportCard';
import './Community.css';

export default function Community() {
  const [reports, setReports] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form States
  const [reportType, setReportType] = useState('phishing_link');
  const [title, setTitle] = useState('');
  const [scamContent, setScamContent] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  const fetchReports = async () => {
    try {
      let url = `http://127.0.0.1:8000/reports?report_type=${filterType}`;
      if (searchQuery.trim()) {
        url += `&q=${encodeURIComponent(searchQuery)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error("Failed to load reports from backend:", err);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filterType, searchQuery]);

  const handleUpvote = async (id) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/reports/${id}/upvote`, {
        method: 'POST'
      });
      if (!res.ok) {
        throw new Error("Failed to register upvote on the server");
      }
    } catch (err) {
      console.error("Upvote API error:", err);
      throw err;
    }
  };

  const handleCreateReport = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const payload = {
      report_type: reportType,
      title: title,
      scam_content: scamContent || null,
      description: description,
      location: location || 'Unknown'
    };

    try {
      const res = await fetch('http://127.0.0.1:8000/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const createdReport = await res.json();
        setReports(prev => [createdReport, ...prev]);
        setDrawerOpen(false);

        // Reset Form fields
        setTitle('');
        setScamContent('');
        setDescription('');
        setLocation('');
      } else {
        alert("Failed to submit report. Please verify form details.");
      }
    } catch (err) {
      console.error("Failed to submit report:", err);
      alert("Network error: Could not reach the security backend.");
    }
  };

  const filteredReports = reports;


  return (
    <div className="community-container">
      <header className="page-header community-header animate-fade-in">
        <div>
          <h1 className="page-title">Community Warnings</h1>
          <p className="page-subtitle">Crowdsourced real-time database of active fraud mechanisms and phishing links.</p>
        </div>
        <button onClick={() => setDrawerOpen(true)} className="btn btn-primary btn-sm add-report-btn">
          <Plus size={16} />
          <span>Report A Threat</span>
        </button>
      </header>

      {/* Toolbar Panel */}
      <div className="glass-card toolbar-panel animate-fade-in cascade-1">
        <div className="search-bar-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search keywords, links, or numbers..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input search-input-field"
          />
        </div>
        
        <div className="filter-scroll-wrapper">
          <div className="filter-tags">
            {['all', 'phishing_link', 'scam_call', 'fake_app', 'fraud_website'].map((tag) => (
              <button 
                key={tag}
                onClick={() => setFilterType(tag)}
                className={`filter-btn ${filterType === tag ? 'active' : ''}`}
              >
                {tag === 'all' ? 'All Threats' : tag.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="reports-feed animate-fade-in cascade-2">
        {filteredReports.length > 0 ? (
          <div className="reports-grid-layout">
            {filteredReports.map((report) => (
              <ReportCard 
                key={report.id} 
                report={report} 
                onUpvote={handleUpvote} 
              />
            ))}
          </div>
        ) : (
          <div className="glass-card empty-feed">
            <AlertOctagon size={48} className="empty-feed-icon" />
            <h4>No Threats Found</h4>
            <p>We couldn't find any community warnings matching your filter criteria or search keyword.</p>
          </div>
        )}
      </div>

      {/* Slide-out report creation drawer */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="glass-card drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Report New Threat</h3>
              <button onClick={() => setDrawerOpen(false)} className="drawer-close-btn">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateReport} className="drawer-form">
              <div className="form-group">
                <label className="form-label">Threat Classification</label>
                <select 
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="form-input select-input"
                >
                  <option value="phishing_link">Phishing Link</option>
                  <option value="scam_call">Scam Call</option>
                  <option value="fake_app">Fake App</option>
                  <option value="fraud_website">Fraud Website</option>
                  <option value="other">Other Scam</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Warning Title</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Fake Electricity SMS cut-off" 
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Flagged Target (Link / Phone / APK)</label>
                <input 
                  type="text" 
                  value={scamContent}
                  onChange={(e) => setScamContent(e.target.value)}
                  placeholder="e.g., +91 99999-88888 or http://fraud-link.com" 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Location (City, State)</label>
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Mumbai, MH" 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Scam Mechanism & Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide details about what happens when you click or call, what information they request, etc." 
                  className="form-input textarea-input"
                  rows="4"
                  required
                ></textarea>
              </div>

              <div className="drawer-actions">
                <button type="button" onClick={() => setDrawerOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
