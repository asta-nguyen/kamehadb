import { useState, useCallback, useRef, useMemo } from 'react';

const EDGE_THRESHOLD = 50;
const SCROLL_SPEED = 6;

type Options = {
  prefix?: string;
  suffix?: string;
  // Sampled cell values per column for body-based width calculation.
  // Outer array = columns, inner array = sampled text values for that column.
  sampleValues?: string[][];
  maxAutoWidth?: number;
  minAutoWidth?: number;
  columnIds?: string[];
  headers?: string[];
};

type DragState = {
  idx: number;
  startX: number;
  startW: number;
  allRows: HTMLElement[];
  moved: boolean;
  finalW: number; // tracks the pixel width during drag so onUp commits accurately
};

function measureText(text: string, font: string): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

// Compute minimum column widths from the actual body content of sampled rows.
// Each column gets a width based on its widest cell value.
function computeMinWidths(
  sampleValues: string[][],
  opts: { min: number; max: number; font: string; padding: number; headers?: string[] },
): number[] {
  return sampleValues.map((cells, i) => {
    let maxW = 0;
    // Measure header text first to avoid truncating long headers.
    if (opts.headers && opts.headers[i]) {
      maxW = measureText(opts.headers[i], 'bold 11px system-ui, -apple-system, sans-serif');
    }
    for (const cell of cells) {
      if (!cell) continue;
      const w = measureText(cell, opts.font);
      if (w > maxW) maxW = w;
    }
    return Math.round(Math.max(opts.min, Math.min(opts.max, maxW + opts.padding)));
  });
}

export function useColumnResize(columnCount: number, options: Options = {}) {
  const { prefix = '', suffix = '', sampleValues, maxAutoWidth = 420, minAutoWidth = 50, columnIds, headers } = options;

  const colIdsStr = columnIds ? columnIds.join(',') : '';
  const lastColIdsRef = useRef(colIdsStr);
  const userResizedRef = useRef<Set<number>>(new Set());

  const [widths, setWidths] = useState<(number | null)[]>(() => {
    if (sampleValues && sampleValues.length === columnCount) {
      return computeMinWidths(sampleValues, {
        min: minAutoWidth,
        max: maxAutoWidth,
        font: '11px system-ui, -apple-system, sans-serif',
        padding: 20,
        headers,
      });
    }
    return Array(columnCount).fill(null);
  });

  const measuredRef = useRef(!!sampleValues);

  // If column IDs or column count changed, reset state!
  if (lastColIdsRef.current !== colIdsStr || widths.length !== columnCount) {
    lastColIdsRef.current = colIdsStr;
    userResizedRef.current.clear();
    const hasSamples = !!(sampleValues && sampleValues.length === columnCount);
    measuredRef.current = hasSamples;
    const newWidths = hasSamples
      ? computeMinWidths(sampleValues, {
          min: minAutoWidth,
          max: maxAutoWidth,
          font: '11px system-ui, -apple-system, sans-serif',
          padding: 20,
          headers,
        })
      : Array(columnCount).fill(null);
    setWidths(newWidths);
  }

  // If we haven't measured yet, but sampleValues are now available, measure!
  if (sampleValues && sampleValues.length === columnCount && !measuredRef.current) {
    measuredRef.current = true;
    const measured = computeMinWidths(sampleValues, {
      min: minAutoWidth,
      max: maxAutoWidth,
      font: '11px system-ui, -apple-system, sans-serif',
      padding: 20,
      headers,
    });
    setWidths(measured);
  }

  const dragRef = useRef<DragState | null>(null);
  // Snapshot of widths at drag start so onMove preserves previously-resized columns.
  const widthsAtDragStartRef = useRef(widths);
  // Prefix/suffix column count for mapping data col index to full template index.
  const prefixCountRef = useRef(0);

  // Auto-measured columns use minmax(Wpx, 1fr) to stretch and fill the table container nicely,
  // while manually resized columns use fixed px widths.
  const dataTemplate = useMemo(
    () =>
      widths
        .map((w, i) =>
          w == null ? 'minmax(0, 1fr)' : userResizedRef.current.has(i) ? `${w}px` : `minmax(${w}px, 1fr)`,
        )
        .join(' '),
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
      // The DataTable wraps the table in a div with overflow-x-auto, which is the
      // primary scroll container for horizontal column resize scrolling.
      const scrollContainer = table?.parentElement as HTMLElement | null;

      dragRef.current = { idx: index, startX, startW, allRows, moved: false, finalW: startW };
      // Snapshot widths so onMove can rebuild the full template
      // while preserving all previously-resized columns.
      widthsAtDragStartRef.current = widths;
      prefixCountRef.current = prefix ? prefix.split(' ').filter(Boolean).length + (suffix ? 1 : 0) : suffix ? 1 : 0;

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        dragRef.current.moved = true;
        const diff = me.clientX - dragRef.current.startX;
        const w = Math.max(40, dragRef.current.startW + diff);
        dragRef.current.finalW = w;

        // Rebuild the grid template from the widths snapshot, replacing only
        // the dragged column's width. This keeps previously-resized columns intact.
        // Resized columns use a fixed px value so they don't flex wider.
        const baseWidths = widthsAtDragStartRef.current;
        const newWidths = [...baseWidths];
        newWidths[dragRef.current.idx] = w;
        const dt = newWidths
          .map((cw, ci) => {
            if (cw == null) return 'minmax(0, 1fr)';
            if (ci === dragRef.current!.idx || userResizedRef.current.has(ci)) return `${cw}px`;
            return `minmax(${cw}px, 1fr)`;
          })
          .join(' ');
        const next = [prefix, dt, suffix].filter((s) => s && s.length > 0).join(' ');
        for (const r of dragRef.current.allRows) r.style.gridTemplateColumns = next;

        // Auto-scroll when the mouse nears the scroll container edges so the
        // user can keep dragging a column past the visible viewport.
        if (scrollContainer) {
          const rect = scrollContainer.getBoundingClientRect();
          if (me.clientX > rect.right - EDGE_THRESHOLD) {
            scrollContainer.scrollLeft += SCROLL_SPEED;
          } else if (me.clientX < rect.left + EDGE_THRESHOLD) {
            scrollContainer.scrollLeft -= SCROLL_SPEED;
          }
        }
      };

      const onUp = () => {
        try {
          if (dragRef.current?.moved) {
            // Capture values before calling setWidths — React processes the
            // updater asynchronously (after dragRef.current is nulled below),
            // so accessing dragRef.current inside the callback would crash.
            const i = dragRef.current.idx;
            const finalW = dragRef.current.finalW;
            userResizedRef.current.add(i);
            setWidths((prev) => {
              const next = [...prev];
              next[i] = Math.max(40, Math.round(finalW));
              return next;
            });
            // Suppress the click that fires immediately after mouseup so a
            // column resize never accidentally triggers a row/sort click.
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
        } finally {
          // Always restore body styles even if the component unmounts mid-drag,
          // otherwise the page is left in an unselectable state.
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [widths, dataTemplate, prefix, suffix, setWidths],
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
