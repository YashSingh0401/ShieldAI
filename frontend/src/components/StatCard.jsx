import React from 'react';
import './StatCard.css';

export default function StatCard({ title, value, change, icon: Icon, colorClass = 'cyan', className = '' }) {
  return (
    <div className={`glass-card stat-card glow-${colorClass} ${className}`}>
      <div className="stat-card-header">
        <span className="stat-title">{title}</span>
        <div className={`stat-icon-wrapper color-${colorClass}`}>
          {Icon && <Icon size={22} />}
        </div>
      </div>
      
      <div className="stat-card-body">
        <h3 className="stat-value">{value}</h3>
      </div>
      
      {change && (
        <div className="stat-card-footer">
          <span className={`stat-change ${change.startsWith('+') ? 'positive' : 'neutral'}`}>
            {change}
          </span>
          <span className="stat-trend-text"> vs last month</span>
        </div>
      )}
    </div>
  );
}
