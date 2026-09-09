import React, { useState, useEffect, useParams } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ShieldAlert, CheckCircle, Filter, RefreshCw, User,
  Settings, Trash2, EyeOff, Eye, ArrowRight, ArrowLeft, Menu,
  MapPin, Clock, BarChart2, Table, LayoutDashboard,
  Globe, FileImage, Film, Volume2
} from 'lucide-react';
import { api } from '../api/client.js';
import './Admin.css';

const USERS_PER_PAGE = 20;
const SCANS_PER_PAGE = 20;

export default function Admin() {
  const navigate = useNavigate();
  const { email: paramEmail } = useParams();

  // --- State (React hooks order: must be first) ---
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(USERS_PER_PAGE);
  const [usersSearch, setUsersSearch] = useState('');
  const [scansPage, setScansPage] = useState(1);
  const [scansPageSize, setScansPageSize] = useState(SCANS_PER_PAGE);
  const [scansSearch, setScansSearch] = useState('');
  const [scansFilterType, setScansFilterType] = useState('all');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [users, setUsersState] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);

  const [scanHistory, setScanHistoryState] = useState([]);
  const [scansTotal, setScansTotal] = useState(0);

  // --- Computed ---
  const userList = users && users.items ? users.items : [];

  // --- Fetch Users ---
  const fetchUsers = async () => {
    try {
      const params = {
        q: usersSearch || undefined,
        limit: usersPageSize,
        offset: (usersPage - 1) * usersPageSize,
      };
      const data = await api.get('/admin/users', params);
      setUsersState(data.items || []);
      setUsersTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    }
  };

  // --- Fetch Scan History ---
  const fetchScans = async () => {
    try {
      const params = {
        q: scansSearch || undefined,
        scan_type: scansFilterType !== 'all' ? scansFilterType : undefined,
        user_email: paramEmail,
        limit: scansPageSize,
        offset: (scansPage - 1) * scansPageSize,
      };
      const data = await api.get('/admin/scan-history', params);
      setScanHistoryState(data.items || []);
      setScansTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch scan history:", err);
      setError(err.message || 'Could not load scan history.');
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchScans();
  }, [usersPage, usersPageSize, usersSearch, scansPage, scansPageSize, scansSearch, scansFilterType, paramEmail]);

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

  const handleUserClick = (userEmail) => {
    navigate(`/admin/users/${userEmail}`);
  };

  const handlePageChangeUsers = (page) => setUsersPage(page);
  const handlePageChangeScans = (page) => setScansPage(page);
  const handlePageSizeUsers = (size) => {
    setUsersPageSize(size);
    setUsersPage(1);
  };
  const handlePageSizeScans = (size) => {
    setScansPageSize(size);
    setScansPage(1);
  };

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Panel</h1>
          <p>Loading admin dashboard...</p>
        </div>
        <div className="admin-content">
          <div className="spinner" style={{ textAlign: 'center', padding: '20px' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <p>Secure administration console</p>
      </div>

      {error && (
        <div className="admin-error">
          <ShieldAlert size={24} /> <span>{error}</span>
        </div>
      )}

      <div className="admin-content">

        {/* === Users Overview Section === */}
        <div className="admin-section">
          <div className="section-header">
            <h2>Users Overview</h2>
            <div className="section-actions">
              <Search
                className="admin-search-small"
                onChange={(e) => setUsersSearch(e.target.value)}
                placeholder="Search users..."
              />
              <select
                className="admin-filter-small"
                value={usersPageSize}
                onChange={(e) => {
                  const size = parseInt(e.target.value);
                  handlePageSizeUsers(size);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          {usersTotal === 0 ? (
            <div className="empty-state">
              <ShieldAlert size={32} className="empty-icon" />
              <h3>No users found</h3>
              <p>No registered users match your criteria.</p>
            </div>
          ) : (
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Total Scans</th>
                    <th>Threats Flagged</th>
                    <th>Last Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userList.map((u) => {
                    const totalScans = u.total_scans || 0;
                    const threats = u.threats_flagged || 0;
                    const lastActive = u.last_active ? new Date(u.last_active).toLocaleDateString() : 'Never';
                    return (
                      <tr key={u.email} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td>
                          <span className="email-text" title={u.email}>{u.email}</span>
                        </td>
                        <td>
                          <span className="name-text" title={u.name || ''}>{u.name || u.email.split('@')[0]}</span>
                        </td>
                        <td>
                          <span className="number-badge">{totalScans}</span>
                        </td>
                        <td>
                          <span className="number-badge danger">{threats}</span>
                        </td>
                        <td>{lastActive}</td>
                        <td>
                          <button
                            onClick={() => handleUserClick(u.email)}
                            className="btn btn-text btn-xs"
                            style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                          >
                            <Eye size={12} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {usersTotal > 0 && (
                <div className="pagination-users">
                  <button
                    onClick={() => handlePageChangeUsers(Math.max(1, usersPage - 1))}
                    className="btn btn-text btn-sm"
                    style={{ marginRight: '4px' }}
                    disabled={usersPage <= 1}
                  >
                    <ArrowLeft size={12} /> Prev
                  </button>
                  <span>
                    Page {usersPage} of {Math.ceil(usersTotal / usersPageSize) || 1}
                  </span>
                  <button
                    onClick={() => handlePageChangeUsers(usersPage + 1)}
                    className="btn btn-text btn-sm"
                    style={{ marginLeft: '4px' }}
                    disabled={usersPage >= Math.ceil(usersTotal / usersPageSize) || usersPage <= 0}
                  >
                    Next <ArrowRight size={12} />
                  </button>
                  <select
                    className="form-input filter-select"
                    value={usersPageSize}
                    onChange={(e) => handlePageSizeUsers(parseInt(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* === All Scan Activity Section === */}
        <div className="admin-section" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <h2>All Scan Activity</h2>
            <div className="section-actions-small">
              <select
                className="admin-filter-small"
                value={scansFilterType}
                onChange={(e) => setScansFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="url">URL</option>
                <option value="audio">Audio</option>
              </select>
              <Search
                className="admin-search-small"
                onChange={(e) => setScansSearch(e.target.value)}
                placeholder="Search scans..."
              />
            </div>
          </div>
          {scansTotal === 0 ? (
            <div className="empty-state">
              <ShieldAlert size={32} className="empty-icon" />
              <h3>No scans found</h3>
              <p>No scan records match your criteria.</p>
            </div>
          ) : (
            <div className="scans-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Type</th>
                    <th>Target</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scanHistory.map((log) => {
                    const TypeIcon = {
                      url: Globe,
                      image: FileImage,
                      video: Film,
                      audio: Volume2,
                    }[log.scan_type] || ShieldAlert;
                    const TypeColor = {
                      url: 'var(--accent)',
                      image: 'var(--tag-magenta-color)',
                      video: 'var(--warning)',
                      audio: 'var(--tag-purple-color)',
                    }[log.scan_type] || 'var(--text-muted)';
                    const riskClass = log.risk_score < 40 ? 'low' : log.risk_score < 70 ? 'medium' : 'high';
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="td-timestamp">
                          <span className="timestamp-text">{formatTimestamp(log.timestamp)}</span>
                        </td>
                        <td>
                          <span className="email-small" title={log.user_email}>
                            {log.user_email?.split('@')[0] || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="type-badge" style={{ background: `${TypeColor}15`, color: TypeColor }}>
                            <TypeIcon size={12} />
                            <span>{log.scan_type.charAt(0).toUpperCase() + log.scan_type.slice(1)}</span>
                          </span>
                        </td>
                        <td className="td-target">
                          <span className="target-text" title={log.target}>{log.target}</span>
                        </td>
                        <td>
                          <span className={`risk-badge ${riskClass}`}>
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
              {scansTotal > 0 && (
                <div className="pagination-scans">
                  <button
                    onClick={() => handlePageChangeScans(Math.max(1, scansPage - 1))}
                    className="btn btn-text btn-sm"
                    style={{ marginRight: '4px' }}
                    disabled={scansPage <= 1}
                  >
                    <ArrowLeft size={12} /> Prev
                  </button>
                  <span>
                    Page {scansPage} of {Math.ceil(scansTotal / scansPageSize) || 1}
                  </span>
                  <button
                    onClick={() => handlePageChangeScans(scansPage + 1)}
                    className="btn btn-text btn-sm"
                    style={{ marginLeft: '4px' }}
                    disabled={scansPage >= Math.ceil(scansTotal / scansPageSize) || scansPage <= 0}
                  >
                    Next <ArrowRight size={12} />
                  </button>
                  <select
                    className="form-input filter-select"
                    value={scansPageSize}
                    onChange={(e) => handlePageSizeScans(parseInt(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* === User Detail Section (when email param exists) === */}
        {paramEmail && (
          <div className="admin-section" style={{ marginTop: '24px' }}>
            <div className="section-header">
              <h2>User Detail: {paramEmail}</h2>
            </div>
            <div className="user-detail-loading" style={{ textAlign: 'center', padding: '20px' }}>
              <span>Loading user details...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}