import type React from 'react';

export function formatJsonSyntax(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    const regex =
      /("[^"\\]*(?:\\.[^"\\]*)*")(?=\s*:)|:\s*("[^"\\]*(?:\\.[^"\\]*)*")|:\s*(true|false)|:\s*(null)|:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      parts.push(line.slice(lastIdx, match.index));
      if (match[1]) {
        parts.push(
          <span key={`k-${i}-${parts.length}`} className="text-primary">
            {match[1]}
          </span>,
        );
      } else if (match[2]) {
        parts.push(
          <span key={`s-${i}-${parts.length}`}>
            : <span className="text-muted-foreground">{match[2]}</span>
          </span>,
        );
      } else if (match[3]) {
        parts.push(
          <span key={`b-${i}-${parts.length}`}>
            : <span className="text-accent-foreground">{match[3]}</span>
          </span>,
        );
      } else if (match[4]) {
        parts.push(
          <span key={`n-${i}-${parts.length}`}>
            : <span className="text-muted-foreground italic">{match[4]}</span>
          </span>,
        );
      } else if (match[5]) {
        parts.push(
          <span key={`num-${i}-${parts.length}`}>
            : <span className="text-foreground">{match[5]}</span>
          </span>,
        );
      }
      lastIdx = regex.lastIndex;
    }
    parts.push(line.slice(lastIdx));
    return (
      <div key={`${i}-${line.slice(0, 50)}`} className="flex">
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground/40 select-none mr-3">{i + 1}</span>
        <span className="flex-1">{parts}</span>
      </div>
    );
  });
}
