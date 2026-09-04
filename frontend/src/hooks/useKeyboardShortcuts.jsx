import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let lastKey = '';
    let lastTime = 0;

    const handleKeyDown = (e) => {
      // Ignore keystrokes when typing into form elements
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput) return;

      const key = e.key.toLowerCase();
      const now = Date.now();

      // Two-key chord navigation (e.g. Press 'G' then 'I')
      if (lastKey === 'g' && now - lastTime < 1000) {
        if (key === 'd') {
          navigate('/dashboard');
          toast("Dashboard (G D)", { icon: '📊', duration: 1500 });
        } else if (key === 'i') {
          navigate('/verify-image');
          toast("Image Forensics (G I)", { icon: '🖼️', duration: 1500 });
        } else if (key === 'v') {
          navigate('/verify-video');
          toast("Video Audit (G V)", { icon: '🎬', duration: 1500 });
        } else if (key === 'l' || key === 'u') {
          navigate('/scan-link');
          toast("URL Scan (G L)", { icon: '🌐', duration: 1500 });
        } else if (key === 'a') {
          navigate('/audio-verify');
          toast("Audio Prosody (G A)", { icon: '🎙️', duration: 1500 });
        } else if (key === 'h') {
          navigate('/history');
          toast("Audit Logs (G H)", { icon: '📜', duration: 1500 });
        }
        lastKey = '';
        return;
      }

      if (key === 'g') {
        lastKey = 'g';
        lastTime = now;
        return;
      }

      // Quick help cheatsheet toast
      if (key === '?') {
        toast((t) => (
          <div style={{ textAlign: 'left', fontSize: '0.8rem', lineHeight: 1.5 }}>
            <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--accent)' }}>Keyboard Navigation Chords:</strong>
            <div><kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>G</kbd> + <kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>D</kbd> : Dashboard</div>
            <div><kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>G</kbd> + <kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>I</kbd> : Image Verify</div>
            <div><kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>G</kbd> + <kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>V</kbd> : Video Verify</div>
            <div><kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>G</kbd> + <kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>L</kbd> : URL Scanner</div>
            <div><kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>G</kbd> + <kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>A</kbd> : Audio Verify</div>
            <div><kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>G</kbd> + <kbd style={{ background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: '3px' }}>H</kbd> : Audit Logs</div>
          </div>
        ), { duration: 6000 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);
}
