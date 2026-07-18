import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ExplorerToolbar } from '@/components/ui/explorer-toolbar';
import { LoadingState } from '@/components/ui/loading-state';
import { Spinner } from '@/components/ui/spinner';
import { useTbAccounts, useTbBalances, useTbTransfers } from '@/hooks/use-tigerbeetle';
import type { TigerBeetleAccount, TigerBeetleAccountBalance, TigerBeetleTransfer } from '@kamehadb/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

interface TigerBeetleExplorerProps {
  connectionId: number;
}

export function TigerBeetleExplorer({ connectionId }: TigerBeetleExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const { data, isLoading, isFetching, refetch } = useTbAccounts(connectionId);

  const accounts = data?.accounts ?? [];

  const filtered = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return accounts;
    const query = trimmed.toLowerCase();
    return accounts.filter((a) => a.id.toLowerCase().includes(query) || String(a.ledger).includes(query));
  }, [accounts, searchQuery]);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-1 px-2 py-2">
      <ExplorerToolbar
        title="Accounts"
        count={accounts.length}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        className="-mx-2 -mt-2"
      />
      {accounts.length === 0 ? (
        <EmptyState compact title="No accounts found" />
      ) : filtered.length === 0 ? (
        <EmptyState compact title="No matches" />
      ) : (
        filtered.map((account) => (
          <AccountNode
            key={account.id}
            account={account}
            connectionId={connectionId}
            isSelected={selectedAccount === account.id}
            onToggle={() => setSelectedAccount(selectedAccount === account.id ? null : account.id)}
          />
        ))
      )}
    </div>
  );
}

function AccountNode({
  account,
  connectionId,
  isSelected,
  onToggle,
}: {
  account: TigerBeetleAccount;
  connectionId: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const { data: transfersData, isLoading: loadingTransfers } = useTbTransfers(
    isSelected ? connectionId : null,
    isSelected ? account.id : null,
  );
  const { data: balancesData } = useTbBalances(isSelected ? connectionId : null, isSelected ? account.id : null);

  const transfers = transfersData?.transfers ?? [];
  const balance = balancesData?.balances?.[0];

  const posted = BigInt(account.creditsPosted) - BigInt(account.debitsPosted);

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded-md hover:bg-accent/50 text-xs group"
      >
        {isSelected ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-xs truncate flex-1">{account.id.slice(0, 16)}</span>
        <span className={`text-xs font-medium ${posted >= 0n ? 'text-success' : 'text-destructive'}`}>
          {posted.toString()}
        </span>
      </Button>
      {isSelected && (
        <div className="ml-3 pl-2 border-l border-border/40 space-y-2 py-1">
          {/* Account details */}
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>
              Ledger: {account.ledger} &middot; Code: {account.code}
            </div>
            <div>Flags: {account.flags}</div>
            <div>Created: {new Date(Number(BigInt(account.timestamp) / 1_000_000n)).toLocaleDateString()}</div>
          </div>

          {/* Balance */}
          {balance && <BalanceView balance={balance} />}

          {/* Transfers */}
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Transfers</div>
          {loadingTransfers ? (
            <div className="flex justify-center py-1">
              <Spinner size="sm" className="text-muted-foreground" />
            </div>
          ) : transfers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-1">No transfers</p>
          ) : (
            transfers.map((t) => <TransferRow key={t.id} transfer={t} selectedAccountId={account.id} />)
          )}
        </div>
      )}
    </div>
  );
}

function BalanceView({ balance }: { balance: TigerBeetleAccountBalance }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
      <span className="text-muted-foreground">Debits Pend:</span>
      <span className="font-mono text-right">{balance.debitsPending}</span>
      <span className="text-muted-foreground">Debits Post:</span>
      <span className="font-mono text-right">{balance.debitsPosted}</span>
      <span className="text-muted-foreground">Credits Pend:</span>
      <span className="font-mono text-right">{balance.creditsPending}</span>
      <span className="text-muted-foreground">Credits Post:</span>
      <span className="font-mono text-right">{balance.creditsPosted}</span>
    </div>
  );
}

function TransferRow({ transfer, selectedAccountId }: { transfer: TigerBeetleTransfer; selectedAccountId: string }) {
  const isDebit = transfer.debitAccountId === selectedAccountId;
  const amount = BigInt(transfer.amount);
  const ts = new Date(Number(BigInt(transfer.timestamp) / 1_000_000n));

  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs">
      <div className={`size-1.5 rounded-full shrink-0 ${isDebit ? 'bg-destructive' : 'bg-success'}`} />
      <span className="font-mono text-xs text-muted-foreground w-14 truncate">{transfer.id.slice(0, 8)}</span>
      <span className="font-mono flex-1">{isDebit ? `-${amount.toString()}` : `+${amount.toString()}`}</span>
      <span className="text-muted-foreground">{ts.toLocaleDateString()}</span>
    </div>
  );
}
