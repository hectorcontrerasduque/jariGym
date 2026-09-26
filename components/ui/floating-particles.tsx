"use client";

import { useSyncExternalStore } from "react";

interface Particle {
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
  colorIndex: number;
}

const EMPTY: Particle[] = [];
const cache = new Map<string, Particle[]>();

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 6,
    duration: 4 + Math.random() * 4,
    size: 2 + Math.random() * 3,
    colorIndex: Math.floor(Math.random() * 3),
  }));
}

/** Random positions are generated once per page load (per `id`), like the old module-level constant. */
function getParticles(id: string, count: number): Particle[] {
  let particles = cache.get(id);
  if (!particles) {
    particles = generateParticles(count);
    cache.set(id, particles);
  }
  return particles;
}

const subscribe = () => () => {};

/**
 * Decorative floating particles (`.particles-container` / `.particle` in globals.css).
 * Positions come from Math.random, so they are rendered ONLY in the browser: the server
 * snapshot is empty and the browser fills it in on hydration. Rendering them on the
 * server made the SSR HTML and the client disagree (React hydration error).
 */
export function FloatingParticles({ id, count, colors }: { id: string; count: number; colors: [string, string, string] }) {
  const particles = useSyncExternalStore(subscribe, () => getParticles(id, count), () => EMPTY);
  const [color0, color1, color2] = colors;

  return (
    <div className="particles-container">
      {particles.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.colorIndex === 0 ? color0 : p.colorIndex === 1 ? color1 : color2,
          }}
        />
      ))}
    </div>
  );
}
