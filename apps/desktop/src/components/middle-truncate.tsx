import { cn } from 'cnfast';
import type { ReactNode } from 'react';

type MiddleTruncateProps = {
  text: string;
  className?: string;
};

// MiddleTruncate renders long values with middle-ellipsizing (start...end) using CSS flex
// so database IDs, timestamps, hashes, and URLs keep both prefix and suffix visible
// when cells are narrower than their full content. (How / Why / What)
export function MiddleTruncate({ text, className }: MiddleTruncateProps): ReactNode {
  // Short strings (under 14 characters) don't need middle truncation;
  // standard end-truncation is cleaner and saves DOM nodes. (How / Why / What)
  if (!text || text.length <= 14) {
    return <span className={cn('truncate', className)}>{text}</span>;
  }

  // Preserve the last 5-10 characters as the tail (suffix) so the unique ending
  // of UUIDs, timestamps, or file paths remains visible when the cell is constrained. (How / Why / What)
  const tailLen = Math.min(10, Math.max(5, Math.floor(text.length / 4)));
  const first = text.slice(0, text.length - tailLen);
  const last = text.slice(-tailLen);

  return (
    <span className={cn('inline-flex max-w-full min-w-0 overflow-hidden items-center', className)}>
      <span className="truncate min-w-0">{first}</span>
      <span className="shrink-0 max-w-[45%] truncate">{last}</span>
    </span>
  );
}
