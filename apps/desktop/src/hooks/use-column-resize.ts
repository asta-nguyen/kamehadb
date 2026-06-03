import { useState, useCallback, useRef } from 'react';

export function useColumnResize(columnCount: number, defaultWidth = 120) {
  const [widths, setWidths] = useState<number[]>(() => Array(columnCount).fill(defaultWidth));
  const refs = useRef<{ idx: number; startX: number; startW: number; th: HTMLElement; moved: boolean } | null>(null);

  const onMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement;
      if (!th) return;
      const startX = e.clientX;
      const startW = parseFloat(th.style.width) || defaultWidth;
      refs.current = { idx: index, startX, startW, th, moved: false };

      const onMove = (me: MouseEvent) => {
        if (!refs.current) return;
        refs.current.moved = true;
        const diff = me.clientX - refs.current.startX;
        const w = Math.max(40, refs.current.startW + diff);
        refs.current.th.style.width = `${w}px`;
      };

      const onUp = () => {
        if (refs.current) {
          if (refs.current.moved) {
            const finalW = Math.max(40, parseFloat(refs.current.th.style.width) || defaultWidth);
            const i = refs.current.idx;
            setWidths((prev) => {
              const next = [...prev];
              next[i] = finalW;
              return next;
            });
            const th = refs.current.th;
            const prevent = (ce: MouseEvent) => {
              ce.stopPropagation();
              ce.preventDefault();
              th.removeEventListener('click', prevent, true);
            };
            th.addEventListener('click', prevent, true);
          }
        }
        refs.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [defaultWidth],
  );

  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  return { widths, totalWidth, onMouseDown, setWidths };
}
