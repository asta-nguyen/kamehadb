import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import type React from 'react';

hljs.registerLanguage('json', json);

export function formatJsonSyntax(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => (
    <div key={i} className="flex">
      <span className="w-8 shrink-0 text-right text-xs text-muted-foreground/40 select-none mr-3">{i + 1}</span>
      <span
        className="flex-1 [&_.hljs-attr]:text-primary [&_.hljs-string]:text-muted-foreground [&_.hljs-number]:text-foreground [&_.hljs-literal]:text-muted-foreground [&_.hljs-keyword]:text-muted-foreground italic"
        dangerouslySetInnerHTML={{ __html: hljs.highlight(line, { language: 'json' }).value }}
      />
    </div>
  ));
}
