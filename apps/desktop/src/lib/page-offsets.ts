// Visited-page offset bookkeeping for skip/limit browsing. Byte-bounded pages
// can admit fewer rows than requested, so the next page's skip must be the
// current offset plus the admitted row count — page*pageSize would silently
// skip rows after a shortened page. (Why)
export function pageOffsetsFor(
  offsets: number[],
  target: number,
  current: number,
  admitted: number,
  pageSize: number,
): number[] {
  if (target < offsets.length) return offsets;
  const next = [...offsets];
  while (next.length <= target) {
    const i = next.length - 1;
    // Only the page being left knows its admitted count; unvisited
    // intermediate pages assume a full page (jumps are disabled once a
    // byte-limited page was seen, so this path means full pages).
    next.push(next[i] + (i === current ? admitted : pageSize));
  }
  return next;
}
