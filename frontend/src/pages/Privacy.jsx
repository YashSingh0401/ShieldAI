import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { CONTACT_EMAIL } from '../config.js';
import './Legal.css';

export default function Privacy() {
  return (
    <div className="legal-container">
      <div className="glass-card legal-card animate-fade-in">
        <div className="legal-header">
          <ShieldCheck size={28} className="logo-icon" />
          <h1>Privacy Policy</h1>
          <span className="legal-updated">Last updated: August 2026</span>
        </div>

        <p>
          shieldAI ("we", "the service") is a free media-forensics portal that analyzes images,
          videos, audio files, and links for signs of tampering or phishing. This policy explains
          what we collect and why.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Google account profile:</strong> your name, email address, and avatar URL when you sign in with Google. We use it to identify your account and scope your scan history.</li>
          <li><strong>Scan metadata:</strong> for each scan we store the scan type, target (filename or link), risk score, result status, timestamp, and your email so you can view your own history.</li>
          <li><strong>Uploaded files:</strong> files are analyzed in memory (and temporarily on disk during video/audio decoding). They are not shared with third parties and are not used to train models.</li>
          <li><strong>Community reports:</strong> if you submit a scam report or comment, that content (including the author name you type) is stored publicly in the community feed.</li>
        </ul>

        <h2>What we do NOT do</h2>
        <ul>
          <li>We do not sell your data.</li>
          <li>We do not run advertising or third-party tracking pixels.</li>
          <li>We do not access your Google account beyond basic profile information (no Gmail, Drive, or Contacts scopes).</li>
        </ul>

        <h2>Data storage &amp; retention</h2>
        <p>
          Data is stored on our hosting provider's managed database. You can request deletion of
          your account and scan history at any time by emailing us.
        </p>

        <h2>Accuracy disclaimer</h2>
        <p>
          All results are produced by heuristic forensics engines (error-level analysis, lexical
          URL checks, prosody statistics). They are indicators, not proof. A "clean" result does
          not guarantee authenticity, and a flagged result does not prove tampering. Use results
          as one input among several when making decisions.
        </p>

        <h2>Contact</h2>
        <p>
          Questions, data-deletion requests, or abuse reports: <a className="legal-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
