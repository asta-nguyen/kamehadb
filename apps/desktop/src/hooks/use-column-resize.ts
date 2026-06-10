import { useState, useCallback, useRef, useMemo } from 'react';

// Single-word sentinel used to round-trip the multi-word `minmax(0, 1fr)`
// track through a `.split(' ')` without it being torn apart. The actual
// track is restored before the template is written to the DOM.
const SENTINEL = '__kameha_unresized__';

type Options = {
  // Fixed tracks before the data columns in the row's gridTemplateColumns
  // (e.g. `'32px'` for the row-index column). Required when the row has a
  // non-data leading column so the hook can measure the right head and write
  // back the correct full template.
  prefix?: string;
  // Fixed tracks after the data columns (e.g. `'80px'` for an actions column).
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

  // null = unresized column, shares the row via minmax(0, 1fr).
  // number = user-resized width in px; the other minmax(0, 1fr) columns
  // absorb the remaining space, so the row never overflows its parent.
  const [widths, setWidths] = useState<(number | null)[]>(() => Array(columnCount).fill(null));

  // Re-sync widths whenever the column count changes.  This runs
  // during render (not in an effect) so the adjusted state is
  // committed together with any concurrent update in a single pass.
  if (widths.length !== columnCount) {
    setWidths(Array(columnCount).fill(null));
  }

  const dragRef = useRef<DragState | null>(null);

  // Data-column track template only. The consumer wraps it with prefix/suffix
  // to form the full row template (e.g. `32px ${dataTemplate} 80px`).
  const dataTemplate = useMemo(() => widths.map((w) => (w == null ? 'minmax(0, 1fr)' : `${w}px`)).join(' '), [widths]);

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

      // Use the actual rendered width of the head as the drag start. The head
      // may currently be sized by a `minmax(0, 1fr)` track, so its real px
      // width is whatever the grid gave it — not the hook's `widths` value.
      const startX = e.clientX;
      const startW = head.getBoundingClientRect().width;
      const table = row.closest('[data-slot="table"]') as HTMLElement | null;
      const allRows = table ? Array.from(table.querySelectorAll<HTMLElement>('[data-slot="table-row"]')) : [row];

      dragRef.current = { idx: index, startX, startW, allRows, moved: false };

      // Capture the current data-column template so we can preserve the
      // other columns' widths (px from prior resizes, or `minmax(0, 1fr)`)
      // during this drag.
      const baseDataTemplate = dataTemplate;

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        dragRef.current.moved = true;
        const diff = me.clientX - dragRef.current.startX;
        const w = Math.max(40, dragRef.current.startW + diff);
        // `minmax(0, 1fr)` contains a space, so a naive `split(' ')` would
        // tear it into two tokens and break the grid template. Replace it
        // with a single-word sentinel before splitting, then restore it.
        const serialized = baseDataTemplate.replace(/minmax\(\s*0\s*,\s*1fr\s*\)/g, SENTINEL);
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
          // Read the final width back off the DOM. The head element is the
          // closest [data-slot="table-head"] ancestor of the handle we
          // started on — this stays correct even if the column index moved
          // around during the drag.
          const headEl = handle.closest('[data-slot="table-head"]') as HTMLElement | null;
          if (headEl) {
            const w = headEl.getBoundingClientRect().width;
            setWidths((prev) => {
              const next = [...prev];
              next[i] = Math.max(40, Math.round(w));
              return next;
            });
          }
          // Suppress the synthetic click that would otherwise fire on the
          // header or its descendents and re-trigger the sort handler.
          // We register on the document in capture phase because the click
          // may target the <th> instead of the handle if the mouse moved
          // slightly during the drag.
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

  // Sum of explicit widths only (nulls contribute 0). Kept for callers that
  // compute a horizontal-scroll minWidth from it.
  const totalWidth = widths.reduce<number>((sum, w) => sum + (w ?? 0), 0);

  return { widths, totalWidth, dataTemplate, fullTemplate, onMouseDown, setWidths };
}
