'use client';

import { useEffect, useRef } from 'react';

type ParticleImageProps = {
  src: string;
  className?: string;
  /** density — smaller = more particles. Pixel sampling step. */
  density?: number;
  /** particle radius in px */
  radius?: number;
  /** how far particles scatter from cursor (px) */
  scatterRadius?: number;
  /** scatter force strength */
  scatterForce?: number;
  /** return-to-home easing (0–1, higher = faster return) */
  ease?: number;
};

type Particle = {
  // home position (where the pixel belongs in the image)
  hx: number;
  hy: number;
  // current position
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
};

/**
 * Image dissolves into particles on hover.
 * - Normally: renders the image as-is (particles sit at their pixel positions)
 * - On hover: particles near the cursor scatter outward, image appears to dissolve
 * - On leave: particles ease back to home, image reforms
 */
export function ParticleImage({
  src,
  className,
  density = 3,
  radius = 1.5,
  scatterRadius = 120,
  scatterForce = 3,
  ease = 0.08,
}: ParticleImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const cv = canvas; // non-null ref for closures

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = ctx; // non-null ref for closures

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    const mouse = { x: -9999, y: -9999 };
    let hovered = false;
    let raf = 0;
    let io: IntersectionObserver | null = null;
    let destroyed = false;
    let started = false;

    function loadImage(url: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    }

    async function setup() {
      if (destroyed || !container || !canvas) return;
      const rect = container.getBoundingClientRect();
      w = Math.floor(rect.width);
      h = Math.floor(rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      try {
        const img = await loadImage(src);
        if (destroyed) return;

        // Draw image to offscreen canvas, fit to container height, centered
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d')!;
        const scale = h / img.height;
        const drawW = img.width * scale;
        const drawH = h;
        const dx = (w - drawW) / 2;
        const dy = 0;
        octx.drawImage(img, dx, dy, drawW, drawH);

        const imgData = octx.getImageData(0, 0, w, h);

        // Sample pixels at density intervals — only non-transparent pixels become particles
        particles = [];
        for (let y = 0; y < h; y += density) {
          for (let x = 0; x < w; x += density) {
            const idx = (x + y * w) * 4;
            const a = imgData.data[idx + 3];
            if (a < 30) continue;
            const r = imgData.data[idx];
            const g = imgData.data[idx + 1];
            const b = imgData.data[idx + 2];
            particles.push({
              hx: x,
              hy: y,
              x: x,
              y: y,
              vx: 0,
              vy: 0,
              r: radius,
              color: `rgb(${r},${g},${b})`,
            });
          }
        }
        started = true;
      } catch (e) {
        // fallback: nothing
      }
    }

    function render() {
      c.clearRect(0, 0, w, h);

      if (!started) {
        raf = requestAnimationFrame(render);
        return;
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (hovered) {
          // Calculate distance from cursor
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < scatterRadius) {
            // Push particle away from cursor
            const force = (1 - dist / scatterRadius) * scatterForce;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force;
            p.vy += Math.sin(angle) * force;
          }
        }

        // Spring back to home position
        const sx = (p.hx - p.x) * ease;
        const sy = (p.hy - p.y) * ease;
        p.vx += sx;
        p.vy += sy;

        // Damping
        p.vx *= 0.88;
        p.vy *= 0.88;

        p.x += p.vx;
        p.y += p.vy;

        // Draw
        c.beginPath();
        c.fillStyle = p.color;
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();
      }

      raf = requestAnimationFrame(render);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }
    function onMouseEnter() {
      hovered = true;
    }
    function onMouseLeave() {
      hovered = false;
      mouse.x = -9999;
      mouse.y = -9999;
    }

    function start() {
      if (!raf) raf = requestAnimationFrame(render);
    }
    function stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    setup();

    const ro = new ResizeObserver(() => setup());
    ro.observe(container);

    cv.addEventListener('mouseenter', onMouseEnter);
    cv.addEventListener('mouseleave', onMouseLeave);
    cv.addEventListener('mousemove', onMouseMove);

    io = new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())), {
      threshold: 0.1,
    });
    io.observe(container);

    return () => {
      destroyed = true;
      stop();
      ro.disconnect();
      io?.disconnect();
      cv.removeEventListener('mouseenter', onMouseEnter);
      cv.removeEventListener('mouseleave', onMouseLeave);
      cv.removeEventListener('mousemove', onMouseMove);
    };
  }, [src, density, radius, scatterRadius, scatterForce, ease]);

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
