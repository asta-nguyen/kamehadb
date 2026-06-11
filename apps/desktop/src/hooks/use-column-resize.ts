import { useState, useCallback, useRef, useMemo } from 'react';

const SENTINEL = '__kameha_unresized__';

type Options = {
  prefix?: string;
  suffix?: string;
};

type DragState = {
  idx: number;
  startX: number;
  startW: number;
  allRows: HTMLElement[];
  moved: boolean;
};

export function useColumnResize(columnCount: number, options: Options = {}) {
  const { prefix = '', suffix = '' } = options;

  // null = unresized column, will use minmax(auto, 1fr) for content-based + fill
  // number = user-resized width in px (fixed, no longer flexes)
  const [widths, setWidths] = useState<(number | null)[]>(() => {
    return Array(columnCount).fill(null);
  });

  if (widths.length !== columnCount) {
    setWidths(Array(columnCount).fill(null));
  }

  const dragRef = useRef<DragState | null>(null);

  // Each column uses minmax(contentWidth, 1fr) — a content-based floor that
  // expands to fill leftover table space. If total content width is less than
  // the container, extra space distributes equally. If more, columns shrink to
  // their minimums and the table scrolls.
  const dataTemplate = useMemo(
    () => widths.map((w) => (w == null ? 'minmax(0, 1fr)' : `minmax(${w}px, 1fr)`)).join(' '),
    [widths],
  );

  const fullTemplate = useMemo(() => {
    const parts = [prefix, dataTemplate, suffix].filter((s) => s && s.length > 0);
    return parts.join(' ');
  }, [prefix, dataTemplate, suffix]);

  const onMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget as HTMLElement;
      const head = handle.closest('[data-slot="table-head"]') as HTMLElement | null;
      if (!head) return;
      const row = head.parentElement as HTMLElement;
      if (!row) return;

      const startX = e.clientX;
      const startW = head.getBoundingClientRect().width;
      const table = row.closest('[data-slot="table"]') as HTMLElement | null;
      const allRows = table ? Array.from(table.querySelectorAll<HTMLElement>('[data-slot="table-row"]')) : [row];

      dragRef.current = { idx: index, startX, startW, allRows, moved: false };

      const baseDataTemplate = dataTemplate;

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        dragRef.current.moved = true;
        const diff = me.clientX - dragRef.current.startX;
        const w = Math.max(40, dragRef.current.startW + diff);

        // During drag, convert the column being resized to a fixed px width
        // while keeping minmax(N, 1fr) for other columns.
        const serialized = baseDataTemplate
          .replace(/minmax\(\s*0\s*,\s*1fr\s*\)/g, SENTINEL)
          .replace(/minmax\(\s*\d+px\s*,\s*1fr\s*\)/g, SENTINEL);
        const parts = serialized.length > 0 ? serialized.split(' ').filter((s) => s.length > 0) : [];
        if (dragRef.current.idx >= 0 && dragRef.current.idx < parts.length) {
          parts[dragRef.current.idx] = `${w}px`;
        }
        const newDataTemplate = parts.map((p) => (p === SENTINEL ? 'minmax(0, 1fr)' : p)).join(' ');
        const next = [prefix, newDataTemplate, suffix].filter((s) => s && s.length > 0).join(' ');
        for (const r of dragRef.current.allRows) r.style.gridTemplateColumns = next;
      };

      const onUp = () => {
        if (dragRef.current?.moved) {
          const i = dragRef.current.idx;
          const headEl = handle.closest('[data-slot="table-head"]') as HTMLElement | null;
          if (headEl) {
            const w = headEl.getBoundingClientRect().width;
            // Lock this column to the dragged px width (no longer flex).
            setWidths((prev) => {
              const next = [...prev];
              next[i] = Math.max(40, Math.round(w));
              return next;
            });
          }
          const suppress = (ce: MouseEvent) => {
            ce.stopPropagation();
            ce.preventDefault();
            document.removeEventListener('click', suppress, true);
          };
          document.addEventListener('click', suppress, true);
        }
        dragRef.current = null;
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
    [dataTemplate, prefix, suffix, setWidths],
  );

  const totalWidth = widths.reduce<number>((sum, w) => sum + (w ?? 0), 0);

  return {
    widths,
    totalWidth,
    dataTemplate,
    fullTemplate,
    onMouseDown,
    setWidths,
  };
}
