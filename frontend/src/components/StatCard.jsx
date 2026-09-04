import React from 'react';
import { useScrollAnimation, useCountUp } from '../hooks/useScrollAnimation';
import './StatCard.css';

export default function StatCard({ title, value, change, icon: Icon, colorClass = 'cyan', className = '' }) {
  const [ref, isVisible] = useScrollAnimation(0.1);
  const animatedValue = useCountUp(value, 1100, isVisible);

  return (
    <div
      ref={ref}
      className={`glass-card stat-card glow-${colorClass} reveal-on-scroll ${isVisible ? 'is-visible' : ''} ${className}`}
    >
      <div className="stat-card-header">
        <span className="stat-title">{title}</span>
        <div className={`stat-icon-wrapper color-${colorClass}`}>
          {Icon && <Icon size={22} />}
        </div>
      </div>

      <div className="stat-card-body">
        <h3 className={`stat-value text-${colorClass}`}>
          {isVisible ? animatedValue : '—'}
        </h3>
      </div>

      {change && (
        <div className="stat-card-footer">
          <span className={`stat-change ${change.startsWith('+') ? 'positive' : 'neutral'}`}>
            {change}
          </span>
          <span className="stat-trend-text">vs last month</span>
        </div>
      )}
    </div>
  );
}
