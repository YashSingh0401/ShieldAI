import React, { useState, useEffect } from 'react';
import { Search, Globe, FileImage, Film, Volume2, ShieldAlert, CheckCircle, Filter, RefreshCw } from 'lucide-react';
import { api } from '../api/client.js';
import './ScanHistory.css';

const TYPE_ICONS = {
  url: Globe,
  image: FileImage,
  video: Film,
  audio: Volume2,
};

const TYPE_COLORS = {
  url: 'var(--accent)',
  image: 'var(--tag-magenta-color)',
  video: 'var(--warning)',
  audio: 'var(--tag-purple-color)',
};

export default function ScanHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filterType !== 'all' ? { scan_type: filterType } : {};
      const data = await api.get('/verify/history', params);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch scan history:", err);
      setError(err.message || "Could not load scan history.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [filterType]);

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.target.toLowerCase().includes(term) ||
      log.scan_type.toLowerCase().includes(term) ||
      log.status.toLowerCase().includes(term)
    );
  });

  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="scan-history-container">
      <header className="page-header animate-fade-in">
        <h1 className="page-title">Scan History</h1>
        <p className="page-subtitle">Review all past security audits across image, video, URL, and audio verification services.</p>
      </header>

      <div className="history-controls animate-fade-in cascade-1">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by target, type, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} className="filter-icon" />
          <select
            className="form-input filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="url">URL</option>
            <option value="audio">Audio</option>
          </select>
        </div>

        <button onClick={fetchHistory} className="btn btn-secondary btn-sm" title="Refresh">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="history-table-wrapper animate-fade-in cascade-2">
        {loading ? (
          <div className="history-loading">
            <div className="spinner"></div>
            <span>Loading scan logs...</span>
          </div>
        ) : error ? (
          <div className="history-empty">
            <ShieldAlert size={48} className="empty-icon" />
            <h3>Failed to Load</h3>
            <p>{error}</p>
            <button onClick={fetchHistory} className="btn btn-primary btn-sm" style={{ marginTop: '12px' }}>
              Try Again
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="history-empty">
            <Search size={48} className="empty-icon" />
            <h3>{logs.length === 0 ? 'No Scan History Found' : 'No Results'}</h3>
            <p>
              {logs.length === 0
                ? 'Run your first security scan to start building your audit trail.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Risk Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const TypeIcon = TYPE_ICONS[log.scan_type] || ShieldAlert;
                  return (
                    <tr key={log.id}>
                      <td className="td-timestamp">
                        <span className="timestamp-text">{formatTimestamp(log.timestamp)}</span>
                      </td>
                      <td>
                        <span className="type-badge" style={{ background: `${TYPE_COLORS[log.scan_type] || 'var(--text-muted)'}15`, color: TYPE_COLORS[log.scan_type] || 'var(--text-muted)' }}>
                          <TypeIcon size={14} />
                          <span>{log.scan_type.charAt(0).toUpperCase() + log.scan_type.slice(1)}</span>
                        </span>
                      </td>
                      <td className="td-target">
                        <span className="target-text" title={log.target}>{log.target}</span>
                      </td>
                      <td>
                        <span className={`risk-badge ${log.risk_score < 40 ? 'low' : log.risk_score < 70 ? 'medium' : 'high'}`}>
                          {log.risk_score}%
                        </span>
                      </td>
                      <td>
                        <span className={`status-tag ${log.status === 'success' || log.status === 'Safe' ? 'status-success' : 'status-danger'}`}>
                          {log.status === 'success' || log.status === 'Safe' ? (
                            <><CheckCircle size={12} /> Safe</>
                          ) : (
                            <><ShieldAlert size={12} /> Flagged</>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
