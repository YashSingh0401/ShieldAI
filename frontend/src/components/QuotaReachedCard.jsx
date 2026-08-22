import { Clock } from 'lucide-react';

export default function QuotaReachedCard({ limit = 10 }) {
  return (
    <div className="glass-card result-summary-card clean" style={{ borderColor: 'var(--amber, #f59e0b)' }}>
      <div className="summary-header">
        <Clock size={24} style={{ color: 'var(--amber, #f59e0b)', flexShrink: 0 }} />
        <div>
          <h4>Daily Scan Limit Reached</h4>
          <span className="sub">
            You've used all {limit} free media scans for today. Your allowance resets at midnight UTC.
          </span>
        </div>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '12px', lineHeight: 1.5 }}>
        Link scans remain unlimited. ShieldAI is completely free &mdash; this daily cap only keeps
        the free service fast and available for everyone.
      </div>
    </div>
  );
}
