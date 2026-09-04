import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import './OnboardingModal.css';

const STEPS = [
  {
    badge: "Welcome",
    title: "Welcome to ShieldAI",
    subtitle: "Your autonomous multi-engine forensic security auditor.",
    description: "ShieldAI safeguards your media and communications by auditing images, video containers, voice audio, and URLs for deceptive deepfakes and cyber attacks.",
    icon: Shield,
    color: "var(--accent)"
  },
  {
    badge: "Personalize",
    title: "Select Your Primary Role",
    subtitle: "Tailor the interface to your investigative workflow.",
    description: "Choose how you intend to use ShieldAI to optimize forensic reports and verification depth.",
    options: [
      { id: 'journalist', label: 'Journalist / Fact-Checker', desc: 'Verify source authenticity and deepfake imagery.' },
      { id: 'researcher', label: 'Security Researcher', desc: 'Audit malicious URLs, phishing domains, and synthetic files.' },
      { id: 'curious', label: 'Individual / Citizen', desc: 'Scan suspicious links and deceptive media effortlessly.' }
    ]
  },
  {
    badge: "Get Started",
    title: "You're Ready to Audit",
    subtitle: "Everything is set up and all detection engines are live.",
    description: "Start by analyzing an image for compression anomalies, scanning a suspicious URL, or inspecting a video container.",
    quickLinks: [
      { to: '/verify-image', label: 'Verify an Image', icon: '🖼️' },
      { to: '/scan-link', label: 'Scan a Phishing URL', icon: '🌐' },
      { to: '/verify-video', label: 'Audit a Video', icon: '🎬' }
    ]
  }
];

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState('researcher');

  useEffect(() => {
    const hasSeen = localStorage.getItem('shield_onboarded');
    if (!hasSeen) {
      // Small timeout so page loads smoothly first
      const timer = setTimeout(() => setIsOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem('shield_onboarded', 'true');
    localStorage.setItem('shield_role', selectedRole);
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(c => c + 1);
    } else {
      handleComplete();
    }
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-modal-card glass-card">
        {/* Close Button */}
        <button 
          className="modal-close-btn" 
          onClick={handleComplete} 
          title="Skip onboarding"
        >
          <X size={18} />
        </button>

        {/* Step Indicator Dots */}
        <div className="step-dots">
          {STEPS.map((_, idx) => (
            <div 
              key={idx} 
              className={`step-dot ${idx === currentStep ? 'active' : idx < currentStep ? 'done' : ''}`}
            />
          ))}
        </div>

        {/* Header */}
        <div className="modal-header-section">
          <span className="step-badge">{step.badge} ({currentStep + 1}/3)</span>
          <h2 className="modal-step-title">{step.title}</h2>
          <p className="modal-step-subtitle">{step.subtitle}</p>
        </div>

        {/* Step Content */}
        <div className="modal-body-content">
          {currentStep === 0 && (
            <div className="welcome-step-body">
              <div className="welcome-icon-orbit">
                <Shield size={44} className="welcome-shield" />
                <span className="welcome-sparkle">
                  <Sparkles size={14} />
                </span>
              </div>
              <p className="welcome-description">{step.description}</p>
            </div>
          )}

          {currentStep === 1 && (
            <div className="role-selection-grid">
              {step.options.map(opt => (
                <div 
                  key={opt.id}
                  className={`role-option-card ${selectedRole === opt.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRole(opt.id)}
                >
                  <div className="role-radio">
                    {selectedRole === opt.id && <CheckCircle2 size={16} />}
                  </div>
                  <div className="role-text-col">
                    <span className="role-title">{opt.label}</span>
                    <span className="role-desc">{opt.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentStep === 2 && (
            <div className="ready-step-body">
              <p className="ready-description">{step.description}</p>
              <div className="quick-start-links">
                {step.quickLinks.map((link, idx) => (
                  <Link 
                    key={idx} 
                    to={link.to} 
                    className="quick-start-btn btn btn-secondary"
                    onClick={handleComplete}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer-actions">
          {currentStep > 0 ? (
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentStep(c => c - 1)}
            >
              Back
            </button>
          ) : (
            <button 
              type="button" 
              className="btn btn-text btn-sm"
              onClick={handleComplete}
              style={{ color: 'var(--text-muted)' }}
            >
              Skip Intro
            </button>
          )}

          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleNext}
          >
            <span>{currentStep === STEPS.length - 1 ? 'Launch Console' : 'Continue'}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
