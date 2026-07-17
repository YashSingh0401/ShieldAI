import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, ThumbsUp, ChevronDown, ChevronUp, User, X, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';
import './ReportCard.css';

export default function ReportCard({ report, onUpvote, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState(null);

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const data = await api.get(`/reports/${report.id}/comments`);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    if (expanded) {
      fetchComments();
    }
  }, [expanded, report.id]);

  const handleUpvote = async () => {
    try {
      await api.post(`/reports/${report.id}/upvote`);
      if (onUpvote) onUpvote(report.id);
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !commentAuthor.trim()) {
      setCommentError('Both name and comment are required');
      return;
    }
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const data = await api.post(`/reports/${report.id}/comments`, {
        author: commentAuthor.trim(),
        content: newComment.trim(),
      });
      setComments(prev => [...prev, data]);
      setNewComment('');
      setCommentAuthor('');
    } catch (err) {
      setCommentError(err.message || 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const typeIcons = {
    phishing_link: '🔗',
    scam_call: '📞',
    fake_app: '📱',
    fraud_website: '🌐',
    other: '⚠️',
  };

  const typeLabels = {
    phishing_link: 'Phishing Link',
    scam_call: 'Scam Call',
    fake_app: 'Fake App',
    fraud_website: 'Fraud Website',
    other: 'Other',
  };

  return (
    <article className={`report-card ${expanded ? 'expanded' : ''}`}>
      <div className="card-header">
        <div className="report-meta">
          <span className="report-type-badge">
            <span className="type-icon">{typeIcons[report.report_type] || '⚠️'}</span>
            <span className="type-label">{typeLabels[report.report_type] || report.report_type}</span>
          </span>
          <span className="report-location">{report.location || 'Unknown location'}</span>
        </div>
        <button 
          className="expand-toggle" 
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      <div className="card-content">
        <h3 className="report-title">{report.title}</h3>
        <p className="report-description">{report.description}</p>
        {report.scam_content && (
          <div className="scam-content">
            <strong>Contact/Link: </strong>
            <code>{report.scam_content}</code>
          </div>
        )}

        <div className="card-footer">
          <button className="upvote-btn" onClick={handleUpvote}>
            <ThumbsUp size={16} /> {report.upvotes} Upvotes
          </button>
          <span className="report-time">{formatDate(report.created_at)}</span>
        </div>
      </div>

      {/* Discussion Board - Collapsible */}
      <div className="discussion-board" style={{ display: expanded ? 'block' : 'none' }}>
        <div className="discussion-header">
          <MessageSquare size={18} />
          <span>Community Discussion ({comments.length})</span>
        </div>

        {/* Comments List */}
        <div className="comments-list">
          {loadingComments ? (
            <div className="comments-loading">
              <Loader2 size={20} className="spinning" />
              <span>Loading discussion...</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="no-comments">
              <p>No comments yet. Be the first to share insights!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="comment">
                <div className="comment-avatar">
                  <User size={20} />
                </div>
                <div className="comment-body">
                  <div className="comment-header">
                    <strong className="comment-author">{comment.author}</strong>
                    <span className="comment-time">{formatDate(comment.created_at)}</span>
                  </div>
                  <p className="comment-content">{comment.content}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Comment Form */}
        <form onSubmit={handleSubmitComment} className="comment-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="Your name"
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              maxLength={50}
              className="form-input"
              required
            />
            <textarea
              placeholder="Share your analysis, warning, or experience..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              maxLength={2000}
              rows={3}
              className="form-input form-textarea"
              required
            />
          </div>
          {commentError && <div className="comment-error">{commentError}</div>}
          <button 
            type="submit" 
            className="btn btn-primary submit-comment-btn"
            disabled={submittingComment || !newComment.trim() || !commentAuthor.trim()}
          >
            {submittingComment ? (
              <>
                <Loader2 size={16} className="spinning" />
                Posting...
              </>
            ) : (
              <>
                <Send size={16} />
                Post Comment
              </>
            )}
          </button>
        </form>
      </div>
    </article>
  );
}