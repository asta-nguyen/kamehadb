import { useTbAccounts } from '@/hooks/use-tigerbeetle';
import { Spinner } from '@/components/ui/spinner';
import { useMemo } from 'react';

interface TigerBeetleStatsPanelProps {
  connectionId: number;
}

export function TigerBeetleStatsPanel({ connectionId }: TigerBeetleStatsPanelProps) {
  const { data, isLoading, error } = useTbAccounts(connectionId);

  const accounts = data?.accounts ?? [];
  const ledgerBalances = useMemo(() => {
    const map = new Map<number, bigint>();
    for (const a of accounts) {
      const posted = BigInt(a.creditsPosted) - BigInt(a.debitsPosted);
      map.set(a.ledger, (map.get(a.ledger) ?? 0n) + posted);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [accounts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        {error instanceof Error ? error.message : 'Failed to load stats'}
      </div>
    );
  }

  const rows: [string, string | number | undefined][] = [['Loaded Accounts', accounts.length]];
  for (const [ledger, balance] of ledgerBalances) {
    rows.push([`Balance (Ledger ${ledger})`, balance.toString()]);
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <h2 className="mb-4 text-sm font-medium">TigerBeetle Stats</h2>
      <div className="max-w-md border-border divide-border divide-y rounded-md border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono">{value ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
