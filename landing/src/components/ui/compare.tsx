'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { IconDotsVertical } from '@tabler/icons-react';

interface CompareProps {
  firstImage?: string;
  secondImage?: string;
  className?: string;
  firstImageClassName?: string;
  secondImageClassname?: string;
  initialSliderPercentage?: number;
  slideMode?: 'hover' | 'drag';
  showHandlebar?: boolean;
  autoplay?: boolean;
  autoplayDuration?: number;
}

export const Compare = ({
  firstImage = '',
  secondImage = '',
  className,
  firstImageClassName,
  secondImageClassname,
  initialSliderPercentage = 50,
  slideMode = 'hover',
  showHandlebar = true,
  autoplay = false,
  autoplayDuration = 5000,
}: CompareProps) => {
  const [sliderXPercent, setSliderXPercent] = useState(initialSliderPercentage);
  const [isDragging, setIsDragging] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const firstClipRef = useRef<HTMLDivElement>(null);
  const sliderLineRef = useRef<HTMLDivElement>(null);

  const [isMouseOver, setIsMouseOver] = useState(false);

  const autoplayRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    if (firstClipRef.current) {
      firstClipRef.current.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    }
    if (sliderLineRef.current) {
      sliderLineRef.current.style.left = `${percent}%`;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    if (!autoplay) return;

    const startTime = Date.now();
    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = (elapsedTime % (autoplayDuration * 2)) / autoplayDuration;
      const percentage = progress <= 1 ? progress * 100 : (2 - progress) * 100;

      const percent = Math.max(0, Math.min(100, percentage));
      if (firstClipRef.current) {
        firstClipRef.current.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
      }
      if (sliderLineRef.current) {
        sliderLineRef.current.style.left = `${percent}%`;
      }
      setSliderXPercent(percent);
      autoplayRef.current = setTimeout(animate, 16);
    };

    animate();
  }, [autoplay, autoplayDuration]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearTimeout(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  function mouseEnterHandler() {
    setIsMouseOver(true);
    stopAutoplay();
    setSliderXPercent(initialSliderPercentage);
  }

  function mouseLeaveHandler() {
    setIsMouseOver(false);
    if (slideMode === 'hover') {
      setSliderXPercent(initialSliderPercentage);
      if (firstClipRef.current) {
        firstClipRef.current.style.clipPath = `inset(0 ${100 - initialSliderPercentage}% 0 0)`;
      }
      if (sliderLineRef.current) {
        sliderLineRef.current.style.left = `${initialSliderPercentage}%`;
      }
    }
    if (slideMode === 'drag') {
      setIsDragging(false);
    }
    startAutoplay();
  }

  const handleStart = useCallback(
    (clientX: number) => {
      if (slideMode === 'drag') {
        setIsDragging(true);
      }
    },
    [slideMode],
  );

  const handleEnd = useCallback(() => {
    if (slideMode === 'drag') {
      setIsDragging(false);
    }
  }, [slideMode]);

  const handleMove = useCallback(
    (clientX: number) => {
      if (slideMode === 'hover' || (slideMode === 'drag' && isDragging)) {
        updatePosition(clientX);
      }
    },
    [slideMode, isDragging, updatePosition],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => handleStart(e.clientX), [handleStart]);
  const handleMouseUp = useCallback(() => handleEnd(), [handleEnd]);
  const handleMouseMove = useCallback((e: React.MouseEvent) => handleMove(e.clientX), [handleMove]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!autoplay) {
        handleStart(e.touches[0].clientX);
      }
    },
    [handleStart, autoplay],
  );

  const handleTouchEnd = useCallback(() => {
    if (!autoplay) {
      handleEnd();
    }
  }, [handleEnd, autoplay]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!autoplay) {
        handleMove(e.touches[0].clientX);
      }
    },
    [handleMove, autoplay],
  );

  return (
    <div
      ref={sliderRef}
      className={cn('overflow-hidden', className)}
      style={{
        position: 'relative',
        cursor: slideMode === 'drag' ? 'grab' : 'col-resize',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={mouseLeaveHandler}
      onMouseEnter={mouseEnterHandler}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {/* Second image (always visible underneath) */}
      {secondImage && (
        <Image
          fill
          className={cn('top-0 left-0 z-[19] select-none', secondImageClassname)}
          alt="second image"
          src={secondImage}
          draggable={false}
        />
      )}

      {/* First image (clipped) */}
      <div className="relative z-20 w-full h-full overflow-hidden pointer-events-none">
        {firstImage && (
          <div
            ref={firstClipRef}
            className={cn('absolute inset-0 z-20 w-full h-full select-none overflow-hidden', firstImageClassName)}
            style={{
              clipPath: `inset(0 ${100 - sliderXPercent}% 0 0)`,
            }}
          >
            <Image fill alt="first image" src={firstImage} className="object-cover" draggable={false} />
          </div>
        )}
      </div>

      {/* Slider line */}
      <div
        ref={sliderLineRef}
        className="absolute top-0 z-30 m-auto h-full w-px bg-linear-to-b from-transparent from-5% to-95% via-indigo-500 to-transparent"
        style={{
          left: `${sliderXPercent}%`,
          top: '0',
          zIndex: 40,
        }}
      >
        <div className="absolute top-1/2 left-0 z-20 w-36 h-full bg-linear-to-r opacity-50 mask-[radial-gradient(100px_at_left,white,transparent)] -translate-y-1/2 from-indigo-400 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-0 z-10 w-10 h-1/2 bg-linear-to-r opacity-100 mask-[radial-gradient(50px_at_left,white,transparent)] -translate-y-1/2 from-cyan-400 via-transparent to-transparent" />
        {showHandlebar && (
          <div className="absolute top-1/2 z-30 flex items-center justify-center h-5 w-5 bg-white rounded-md shadow-[0px_-1px_0px_0px_#FFFFFF40] -translate-y-1/2 -right-2.5">
            <IconDotsVertical className="h-4 w-4 text-black" />
          </div>
        )}
      </div>
    </div>
  );
};
