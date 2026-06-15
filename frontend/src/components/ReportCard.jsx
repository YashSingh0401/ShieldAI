import React, { useState, useEffect } from 'react';
import { ThumbsUp, MapPin, Calendar, MessageSquare } from 'lucide-react';
import './ReportCard.css';

const TYPE_MAP = {
  phishing_link: { label: 'Phishing Link', class: 'tag-cyan' },
  scam_call: { label: 'Scam Call', class: 'tag-rose' },
  fake_app: { label: 'Fake App', class: 'tag-magenta' },
  fraud_website: { label: 'Fraud Website', class: 'tag-amber' },
  other: { label: 'Other', class: 'tag-purple' }
};

export default function ReportCard({ report, onUpvote }) {
  const [upvoted, setUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(report.upvotes || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleUpvote = async (e) => {
    e.stopPropagation();
    if (upvoted) return;

    try {
      setUpvoted(true);
      setUpvoteCount(prev => prev + 1);
      if (onUpvote) {
        await onUpvote(report.id);
      }
    } catch (err) {
      // Rollback on error
      setUpvoted(false);
      setUpvoteCount(prev => prev - 1);
      console.error("Failed to upvote:", err);
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/reports/${report.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    if (showComments) {
      fetchComments();
    }
  }, [showComments]);

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!author.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, content })
      });
      if (res.ok) {
        setContent('');
        fetchComments();
      } else {
        alert("Failed to submit comment.");
      }
    } catch (err) {
      console.error("Error submitting comment:", err);
      alert("Network error: failed to submit comment.");
    } finally {
      setSubmitting(false);
    }
  };

  const typeInfo = TYPE_MAP[report.report_type] || TYPE_MAP.other;
  const formattedDate = new Date(report.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="glass-card report-card">
      <div className="report-card-header">
        <span className={`category-tag ${typeInfo.class}`}>{typeInfo.label}</span>
        <div className="report-meta">
          <span className="meta-item"><MapPin size={14} /> {report.location || 'Unknown'}</span>
          <span className="meta-item"><Calendar size={14} /> {formattedDate}</span>
        </div>
      </div>

      <div className="report-card-content">
        <h4 className="report-title">{report.title}</h4>
        
        {report.scam_content && (
          <div className="scam-indicator">
            <span className="scam-label">Flagged Item:</span>
            <code className="scam-content-val">{report.scam_content}</code>
          </div>
        )}
        
        <p className="report-desc">{report.description}</p>
      </div>

      <div className="report-card-footer">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleUpvote} 
            className={`upvote-btn ${upvoted ? 'upvoted' : ''}`}
            disabled={upvoted}
          >
            <ThumbsUp size={16} />
            <span>{upvoteCount} {upvoteCount === 1 ? 'Upvote' : 'Upvotes'}</span>
          </button>

          <button 
            onClick={() => setShowComments(!showComments)}
            className="upvote-btn"
          >
            <MessageSquare size={16} />
            <span>Discussion</span>
          </button>
        </div>
        
        <span className="report-id">Ref: #{report.id}</span>
      </div>

      {showComments && (
        <div className="comments-section">
          <div className="comments-title">
            <span>Community Discussion</span>
            {loadingComments && <span className="no-comments">Loading...</span>}
          </div>

          <div className="comments-list">
            {comments.length === 0 ? (
              <div className="no-comments">No discussion threads started yet. Be the first to comment!</div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="comment-item">
                  <div className="comment-header">
                    <span className="comment-author">{comment.author}</span>
                    <span className="comment-date">
                      {new Date(comment.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="comment-body">{comment.content}</div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handlePostComment} className="comment-form">
            <div className="comment-form-row">
              <input 
                type="text" 
                placeholder="Name" 
                value={author} 
                onChange={(e) => setAuthor(e.target.value)}
                className="comment-input author-input"
                required
                disabled={submitting}
              />
              <input 
                type="text" 
                placeholder="Type your comment..." 
                value={content} 
                onChange={(e) => setContent(e.target.value)}
                className="comment-input content-input"
                required
                disabled={submitting}
              />
              <button 
                type="submit" 
                className="comment-submit-btn" 
                disabled={submitting}
              >
                {submitting ? 'Sending...' : 'Post'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
