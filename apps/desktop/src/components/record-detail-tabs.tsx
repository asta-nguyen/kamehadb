import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy, Eye, FileJson } from 'lucide-react';
import { formatJsonSyntax } from '@/lib/utils.tsx';

export function RecordDetailTabs({ selectedRow }: { selectedRow: Record<string, unknown> | null }) {
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    if (!selectedRow) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedRow]);

  const handleCopyField = useCallback(async (key: string, value: unknown) => {
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const json = useMemo(() => JSON.stringify(selectedRow ?? {}, null, 2), [selectedRow]);

  if (!selectedRow) return null;

  return (
    <Tabs defaultValue="view" className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-4 pb-2">
        <TabsList>
          <TabsTrigger value="view" className="text-xs">
            <Eye className="size-3 mr-1" />
            View
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs">
            <FileJson className="size-3 mr-1" />
            JSON
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="view" className="flex-1 min-h-0 p-0">
        <div className="h-full overflow-y-auto">
          <div className="pb-2">
            {Object.entries(selectedRow).map(([key, value], i) => {
              const typeLabel = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
              return (
                <div key={key} className={`flex items-start gap-3 px-4 py-2 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                  <div className="w-2/5 shrink-0 min-w-0">
                    <div className="text-xs font-medium truncate">{key}</div>
                    <span className="text-xs uppercase text-muted-foreground/50 tracking-wider">{typeLabel}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-sm font-mono break-all leading-snug group/field">
                    {value === null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : typeof value === 'object' ? (
                      <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 mt-0.5 max-h-32 overflow-auto">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-foreground/90">{String(value)}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyField(key, value)}
                      className="size-5 rounded opacity-0 group-hover/field:opacity-100 transition-opacity ml-1 align-middle hover:bg-muted-foreground/20"
                      title="Copy value"
                    >
                      {copiedField === key ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="json" className="flex-1 min-h-0 p-0">
        <div className="relative h-full overflow-y-auto">
          <Button variant="outline" size="icon-sm" className="absolute top-2 right-2 z-10" onClick={handleCopy}>
            {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          </Button>
          <pre className="p-3 font-mono text-xs leading-relaxed bg-card text-muted-foreground rounded-sm m-2 overflow-auto">
            {formatJsonSyntax(json)}
          </pre>
        </div>
      </TabsContent>
    </Tabs>
  );
}
