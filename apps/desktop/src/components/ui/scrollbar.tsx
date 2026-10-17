import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from 'cnfast';
import { SCROLLBAR_AUTO_HIDE_MS } from '@/lib/constants';

type ScrollIndicatorProps = {
  /** The element that actually scrolls. */
  scrollerRef: React.RefObject<HTMLElement | null>;
  orientation: 'horizontal' | 'vertical';
  /** Fade the bar out while idle — native overlay behaviour — instead of keeping it on screen. */
  autoHide?: boolean;
};

// Custom scrollbar for scroll panes: WebKitGTK's native bars are overlay-only —
// they grow on hover, cover content, and ignore CSS — so panes hide the native bar
// and render this small static one instead. Supports click-jump and drag. (Why / What)
export function ScrollIndicator({ scrollerRef, orientation, autoHide = false }: ScrollIndicatorProps) {
  const horizontal = orientation === 'horizontal';
  const [bar, setBar] = useState({ thumb: 1, offset: 0 });
  const [awake, setAwake] = useState(true);
  const dragRef = useRef<{ pointer: number; offset: number; max: number; travel: number } | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // Restart the idle countdown; the bar stays on screen while it runs. (What)
  const scheduleHide = useCallback(() => {
    if (!autoHide) return;
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setAwake(false);
    }, SCROLLBAR_AUTO_HIDE_MS);
  }, [autoHide, cancelHide]);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const total = horizontal ? el.scrollWidth : el.scrollHeight;
    const view = horizontal ? el.clientWidth : el.clientHeight;
    const pos = horizontal ? el.scrollLeft : el.scrollTop;
    if (total === 0) return;
    const thumb = Math.min(1, view / total);
    const offset = pos / total;
    // Bail when unchanged: sync also runs after every render and must not loop. (Why)
    setBar((prev) => (prev.thumb === thumb && prev.offset === offset ? prev : { thumb, offset }));
  }, [horizontal, scrollerRef]);

  useLayoutEffect(sync);

  // Content-length changes (tabs added or renamed, list growth) move the thumb without
  // resizing the pane, so re-measure after every render as well as on scroll and resize. (Why)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Scrolling re-measures the thumb and revives the bar from idle. (Why)
    const handleScroll = () => {
      sync();
      setAwake(true);
      scheduleHide();
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [scrollerRef, sync, scheduleHide]);

  // Count down once on mount so an untouched bar fades; leave no timer behind. (Why / What)
  useEffect(() => {
    scheduleHide();
    return cancelHide;
  }, [scheduleHide, cancelHide]);

  const applyScroll = (el: HTMLElement, value: number) => {
    if (horizontal) {
      el.scrollLeft = value;
    } else {
      el.scrollTop = value;
    }
  };

  // Jump so the thumb centers on the click, then keep dragging from there. (What)
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    const total = horizontal ? el.scrollWidth : el.scrollHeight;
    const view = horizontal ? el.clientWidth : el.clientHeight;
    const max = total - view;
    if (max <= 0) return;
    cancelHide();
    setAwake(true);
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const trackSize = horizontal ? rect.width : rect.height;
    const thumbSize = trackSize * Math.min(1, view / total);
    const travel = trackSize - thumbSize;
    const pointer = (horizontal ? event.clientX : event.clientY) - (horizontal ? rect.left : rect.top);
    const offset = travel > 0 ? Math.min(max, Math.max(0, ((pointer - thumbSize / 2) / travel) * max)) : 0;
    applyScroll(el, offset);
    dragRef.current = { pointer: horizontal ? event.clientX : event.clientY, offset, max, travel };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    const drag = dragRef.current;
    if (!el || !drag || drag.travel <= 0) return;
    const delta = (horizontal ? event.clientX : event.clientY) - drag.pointer;
    applyScroll(el, Math.min(drag.max, Math.max(0, drag.offset + (delta / drag.travel) * drag.max)));
  };

  if (bar.thumb >= 1) return null;

  return (
    <div
      className={cn(
        'absolute transition-opacity duration-300',
        autoHide && !awake && 'opacity-0',
        horizontal ? 'inset-x-1 bottom-0 h-1' : 'inset-y-1 right-1 w-1',
      )}
      // Faded bars stay hit-testable so reaching for the edge reveals them again. (Why)
      onPointerEnter={() => {
        cancelHide();
        setAwake(true);
      }}
      onPointerLeave={scheduleHide}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        dragRef.current = null;
        scheduleHide();
      }}
      onLostPointerCapture={() => {
        dragRef.current = null;
        scheduleHide();
      }}
    >
      {/* Offset with top/left percentages, not margins: percentage margins resolve
          against the track's width on both axes, which pinned the vertical thumb. (Why) */}
      <div
        className={cn(
          'pointer-events-none absolute rounded-full bg-muted-foreground/40',
          horizontal ? 'top-0 h-full' : 'left-0 w-full',
        )}
        style={
          horizontal
            ? { left: `${bar.offset * 100}%`, width: `${bar.thumb * 100}%` }
            : { top: `${bar.offset * 100}%`, height: `${bar.thumb * 100}%` }
        }
      />
    </div>
  );
}
