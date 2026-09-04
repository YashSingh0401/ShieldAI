import React, { useEffect, useState } from 'react';
import './RiskScoreMeter.css';

export default function RiskScoreMeter({ 
  score = 0, 
  size = 110, 
  strokeWidth = 9, 
  label = "Risk Index", 
  breakdown = [] 
}) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    let start = 0;
    const end = Math.min(100, Math.max(0, Math.round(score)));
    if (end === 0) {
      setAnimatedScore(0);
      return;
    }

    const duration = 1000;
    const startTime = performance.now();

    const frame = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };
    const reqId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(reqId);
  }, [score]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  // Determine color based on score thresholds
  let strokeColor = 'var(--success, #10b981)';
  let glowColor = 'rgba(16, 185, 129, 0.25)';
  let statusText = 'Low Risk';

  if (score >= 40 && score < 70) {
    strokeColor = 'var(--warning, #f59e0b)';
    glowColor = 'rgba(245, 158, 11, 0.25)';
    statusText = 'Suspicious';
  } else if (score >= 70) {
    strokeColor = 'var(--danger, #ef4444)';
    glowColor = 'rgba(239, 68, 68, 0.25)';
    statusText = 'Critical Risk';
  }

  return (
    <div className="risk-score-meter-wrapper">
      <div 
        className="meter-circle-container" 
        style={{ width: size, height: size }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        tabIndex={0}
      >
        <svg width={size} height={size} className="meter-svg">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            className="meter-track"
          />
          {/* Animated Fill Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={strokeColor}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
              filter: `drop-shadow(0 0 6px ${glowColor})`
            }}
            className="meter-fill"
          />
        </svg>

        {/* Center Score Readout */}
        <div className="meter-content">
          <span className="meter-number" style={{ color: strokeColor }}>
            {animatedScore}
            <span className="meter-percent">%</span>
          </span>
          <span className="meter-status">{statusText}</span>
        </div>

        {/* Interactive Breakdown Tooltip (#12) */}
        {breakdown && breakdown.length > 0 && showTooltip && (
          <div className="score-breakdown-tooltip glass-card">
            <div className="tooltip-header">
              <span className="tooltip-title">Score Calculation Audit</span>
              <span className="tooltip-badge" style={{ background: strokeColor }}>{score}%</span>
            </div>
            <p className="tooltip-sub">Heuristic signal contributions to overall risk:</p>
            <ul className="breakdown-list">
              {breakdown.map((item, idx) => (
                <li key={idx} className="breakdown-item">
                  <span className="factor-dot" style={{ background: strokeColor }}></span>
                  <span className="factor-name">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {label && <span className="meter-label">{label}</span>}
    </div>
  );
}
