'use client';
import React, { useId } from 'react';
import { cn } from '@/lib/utils';

type SparklesCoreProps = {
  id?: string;
  className?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleColor?: string;
  particleDensity?: number;
};

export const SparklesCore = React.memo(function SparklesCore({ className }: SparklesCoreProps) {
  const id = useId();

  return (
    <div className={cn('relative overflow-hidden', className)} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
        }}
      />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`${id}-${i}`}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 2 + 1,
            height: Math.random() * 2 + 1,
            background: 'rgba(255,255,255,0.6)',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `sparkle-fade ${2 + Math.random() * 3}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
          }}
        />
      ))}
      <style>{`@keyframes sparkle-fade { 0%, 100% { opacity: 0; transform: scale(0); } 50% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
});
