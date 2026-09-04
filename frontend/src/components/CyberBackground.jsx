import React, { useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext';
import './CyberBackground.css';

export default function CyberBackground() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mouse coordinates tracking (global window tracking)
    const mouse = {
      x: null,
      y: null,
      radius: 130,
    };

    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    // Handle high-DPI resize
    const handleResize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      initParticles();
    };

    // Particles configuration
    let particles = [];

    const isDark = theme !== 'light';
    const palette = isDark
      ? [
          { r: 56, g: 189, b: 248 },  // Sky Cyan
          { r: 99, g: 102, b: 241 },  // Indigo
          { r: 168, g: 85, b: 247 },  // Purple
          { r: 16, g: 185, b: 129 },  // Emerald / Clean Cyber
        ]
      : [
          { r: 37, g: 99, b: 235 },   // Royal Blue
          { r: 99, g: 102, b: 241 },  // Indigo
          { r: 139, g: 92, b: 246 },  // Violet
          { r: 5, g: 150, b: 105 },   // Teal
        ];

    const initParticles = () => {
      particles = [];
      // Calculate particle count dynamically based on screen resolution (capped between 30 and 70)
      const count = Math.min(Math.max(Math.floor((width * height) / 28000), 28), 65);

      for (let i = 0; i < count; i++) {
        const color = palette[Math.floor(Math.random() * palette.length)];
        const speedMultiplier = prefersReducedMotion ? 0.08 : 0.45;

        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * speedMultiplier,
          vy: (Math.random() - 0.5) * speedMultiplier,
          radius: Math.random() * 2 + 1.2,
          color,
          alpha: Math.random() * 0.45 + (isDark ? 0.35 : 0.25),
          baseAlpha: Math.random() * 0.45 + (isDark ? 0.35 : 0.25),
          pulseSpeed: Math.random() * 0.02 + 0.008,
          pulseAngle: Math.random() * Math.PI * 2,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Render loop
    const maxLinkDistance = 140;
    let isTabVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animate = () => {
      if (isTabVisible) {
        ctx.clearRect(0, 0, width, height);

        // Update and draw particles
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];

          if (!prefersReducedMotion) {
            p.x += p.vx;
            p.y += p.vy;

            // Bounce smoothly off boundaries
            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            // Subtle pulsing of particle brightness
            p.pulseAngle += p.pulseSpeed;
            p.alpha = p.baseAlpha + Math.sin(p.pulseAngle) * 0.15;

            // Mouse repulsion & interaction
            if (mouse.x !== null && mouse.y !== null) {
              const dx = mouse.x - p.x;
              const dy = mouse.y - p.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance < mouse.radius && distance > 0) {
                const force = (mouse.radius - distance) / mouse.radius;
                const angle = Math.atan2(dy, dx);
                p.x -= Math.cos(angle) * force * 1.8;
                p.y -= Math.sin(angle) * force * 1.8;
              }
            }
          }

          // Draw particle glow
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${Math.max(0.1, p.alpha)})`;
          ctx.shadowBlur = isDark ? 8 : 4;
          ctx.shadowColor = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0.6)`;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Connect adjacent particles
          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx = p.x - p2.x;
            const dy = p.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxLinkDistance) {
              const linkAlpha = (1 - dist / maxLinkDistance) * (isDark ? 0.18 : 0.12);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${linkAlpha})`;
              ctx.lineWidth = 0.85;
              ctx.stroke();
            }
          }

          // Connect to cursor if nearby
          if (mouse.x !== null && mouse.y !== null) {
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < mouse.radius) {
              const mouseLinkAlpha = (1 - dist / mouse.radius) * (isDark ? 0.35 : 0.22);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.strokeStyle = `rgba(56, 189, 248, ${mouseLinkAlpha})`;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [theme]);

  return (
    <div className="cyber-background-container" aria-hidden="true">
      {/* Ambient glowing fluid aurora spheres */}
      <div className="aurora-orb orb-1"></div>
      <div className="aurora-orb orb-2"></div>
      <div className="aurora-orb orb-3"></div>

      {/* Cyber radar scanline beam */}
      <div className="cyber-grid-overlay"></div>
      <div className="cyber-horizon-beam"></div>

      {/* Interactive Constellation / Neural Nodes Canvas */}
      <canvas ref={canvasRef} className="cyber-canvas" />
    </div>
  );
}
