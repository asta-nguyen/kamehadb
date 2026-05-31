'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
        <img
          className={cn('absolute top-0 left-0 z-[19] w-full h-full select-none', secondImageClassname)}
          alt="second image"
          src={secondImage}
          draggable={false}
        />
      )}

      {/* First image (clipped) */}
      <div className="overflow-hidden w-full h-full relative z-20 pointer-events-none">
        {firstImage && (
          <div
            ref={firstClipRef}
            className={cn('absolute inset-0 z-20 w-full h-full select-none overflow-hidden', firstImageClassName)}
            style={{
              clipPath: `inset(0 ${100 - sliderXPercent}% 0 0)`,
            }}
          >
            <img
              alt="first image"
              src={firstImage}
              className="absolute inset-0 z-20 w-full h-full select-none"
              draggable={false}
            />
          </div>
        )}
      </div>

      {/* Slider line */}
      <div
        ref={sliderLineRef}
        className="h-full w-px absolute top-0 m-auto z-30 bg-gradient-to-b from-transparent from-[5%] to-[95%] via-indigo-500 to-transparent"
        style={{
          left: `${sliderXPercent}%`,
          top: '0',
          zIndex: 40,
        }}
      >
        <div className="w-36 h-full [mask-image:radial-gradient(100px_at_left,white,transparent)] absolute top-1/2 -translate-y-1/2 left-0 bg-gradient-to-r from-indigo-400 via-transparent to-transparent z-20 opacity-50" />
        <div className="w-10 h-1/2 [mask-image:radial-gradient(50px_at_left,white,transparent)] absolute top-1/2 -translate-y-1/2 left-0 bg-gradient-to-r from-cyan-400 via-transparent to-transparent z-10 opacity-100" />
        {showHandlebar && (
          <div className="h-5 w-5 rounded-md top-1/2 -translate-y-1/2 bg-white z-30 -right-2.5 absolute flex items-center justify-center shadow-[0px_-1px_0px_0px_#FFFFFF40]">
            <IconDotsVertical className="h-4 w-4 text-black" />
          </div>
        )}
      </div>
    </div>
  );
};
