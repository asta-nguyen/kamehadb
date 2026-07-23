import { createClient } from 'tigerbeetle-node';
import type { Client } from 'tigerbeetle-node';
import { lookup as dnsLookup } from 'node:dns/promises';
import { safeErrorMessage } from '@kamehadb/shared';

/** TigerBeetle "created" status code (0xFFFF_FFFF as u32). */
const TB_CREATED = 0xffff_ffff;

export type TigerBeetleAdapter = {
  testConnection(): Promise<{ success: boolean; message?: string; serverVersion?: string }>;
  lookupAccounts(ids: string[]): Promise<AccountRow[]>;
  createAccounts(accounts: CreateAccountRow[]): Promise<CreateResultRow[]>;
  lookupTransfers(ids: string[]): Promise<TransferRow[]>;
  createTransfers(transfers: CreateTransferRow[]): Promise<CreateResultRow[]>;
  getAccountTransfers(accountId: string, limit?: number): Promise<TransferRow[]>;
  getAccountBalances(accountId: string): Promise<BalanceRow[]>;
  queryAccounts(limit?: number): Promise<AccountRow[]>;
  close(): Promise<void>;
};

export type AccountRow = {
  id: string;
  debitsPending: string;
  debitsPosted: string;
  creditsPending: string;
  creditsPosted: string;
  userData128: string;
  userData64: string;
  userData32: number;
  reserved: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: string;
};

export type TransferRow = {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  pendingId: string;
  userData128: string;
  userData64: string;
  userData32: number;
  timeout: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: string;
};

export type BalanceRow = {
  debitsPending: string;
  debitsPosted: string;
  creditsPending: string;
  creditsPosted: string;
  timestamp: string;
};

export type CreateAccountRow = {
  id: string;
  ledger: number;
  code: number;
  flags?: number;
  userData128?: string;
  userData64?: string;
  userData32?: number;
  reserved?: number;
};

export type CreateTransferRow = {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  ledger: number;
  code: number;
  flags?: number;
  pendingId?: string;
  userData128?: string;
  userData64?: string;
  userData32?: number;
  timeout?: number;
};

export type CreateResultRow = {
  index: number;
  status: string;
  timestamp?: string;
};

function toAccountRow(a: {
  id: bigint;
  debits_pending: bigint;
  debits_posted: bigint;
  credits_pending: bigint;
  credits_posted: bigint;
  user_data_128: bigint;
  user_data_64: bigint;
  user_data_32: number;
  reserved: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: bigint;
}): AccountRow {
  return {
    id: a.id.toString(),
    debitsPending: a.debits_pending.toString(),
    debitsPosted: a.debits_posted.toString(),
    creditsPending: a.credits_pending.toString(),
    creditsPosted: a.credits_posted.toString(),
    userData128: a.user_data_128.toString(),
    userData64: a.user_data_64.toString(),
    userData32: a.user_data_32,
    reserved: a.reserved,
    ledger: a.ledger,
    code: a.code,
    flags: a.flags,
    timestamp: a.timestamp.toString(),
  };
}

function toTransferRow(t: {
  id: bigint;
  debit_account_id: bigint;
  credit_account_id: bigint;
  amount: bigint;
  pending_id: bigint;
  user_data_128: bigint;
  user_data_64: bigint;
  user_data_32: number;
  timeout: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: bigint;
}): TransferRow {
  return {
    id: t.id.toString(),
    debitAccountId: t.debit_account_id.toString(),
    creditAccountId: t.credit_account_id.toString(),
    amount: t.amount.toString(),
    pendingId: t.pending_id.toString(),
    userData128: t.user_data_128.toString(),
    userData64: t.user_data_64.toString(),
    userData32: t.user_data_32,
    timeout: t.timeout,
    ledger: t.ledger,
    code: t.code,
    flags: t.flags,
    timestamp: t.timestamp.toString(),
  };
}

function toBalanceRow(b: {
  debits_pending: bigint;
  debits_posted: bigint;
  credits_pending: bigint;
  credits_posted: bigint;
  timestamp: bigint;
}): BalanceRow {
  return {
    debitsPending: b.debits_pending.toString(),
    debitsPosted: b.debits_posted.toString(),
    creditsPending: b.credits_pending.toString(),
    creditsPosted: b.credits_posted.toString(),
    timestamp: b.timestamp.toString(),
  };
}

type TBConfig = {
  host?: string;
  port?: number;
  clusterId?: string;
};

export function createTigerBeetleAdapter(config: TBConfig): TigerBeetleAdapter {
  const clusterId = BigInt(config.clusterId ?? '0');
  const rawHost = config.host ?? '127.0.0.1';
  const port = config.port ?? 3001;
  // tigerbeetle-node's native parser rejects hostnames ("Invalid replica
  // address"). Resolve to an IP once via DNS so users can keep typing
  // `localhost` or a remote hostname in the connection dialog.
  let resolvedAddress: string | null = null;

  async function resolveAddress(): Promise<string> {
    if (resolvedAddress) return resolvedAddress;
    // Force IPv4: dns.lookup may return ::1 for `localhost`, but
    // tigerbeetle-node's address parser only accepts IPv4 literals.
    const { address: ip } = await dnsLookup(rawHost, { family: 4 });
    resolvedAddress = `${ip}:${port}`;
    return resolvedAddress;
  }

  const displayAddress = `${rawHost}:${port}`;

  let client: Client | null = null;
  let clientInitPromise: Promise<Client> | null = null;

  async function getClient(): Promise<Client> {
    if (client) return client;
    if (!clientInitPromise) {
      clientInitPromise = (async () => {
        try {
          const address = await resolveAddress();
          const c = createClient({
            cluster_id: clusterId,
            replica_addresses: [address],
          }) as unknown as Client;
          client = c;
          return c;
        } catch (err) {
          // Reset so the next call retries instead of returning a
          // permanently rejected promise.
          clientInitPromise = null;
          throw err;
        }
      })();
    }
    return clientInitPromise;
  }

  return {
    async testConnection() {
      try {
        const c = await getClient();
        await c.lookupAccounts([]);
        return {
          success: true,
          message: `Connected to TigerBeetle at ${displayAddress} (cluster ${config.clusterId ?? '0'})`,
          serverVersion: 'tigerbeetle-node 0.17',
        };
      } catch (err) {
        return {
          success: false,
          message: safeErrorMessage(err, 'Connection failed'),
        };
      }
    },

    async lookupAccounts(ids: string[]): Promise<AccountRow[]> {
      const c = await getClient();
      const bigIds = ids.map((id) => BigInt(id));
      const accounts = await c.lookupAccounts(bigIds);
      return accounts.map(toAccountRow);
    },

    async createAccounts(accounts: CreateAccountRow[]): Promise<CreateResultRow[]> {
      const c = await getClient();
      const batch = accounts.map((a) => ({
        id: BigInt(a.id),
        ledger: a.ledger,
        code: a.code,
        flags: a.flags ?? 0,
        user_data_128: a.userData128 ? BigInt(a.userData128) : 0n,
        user_data_64: a.userData64 ? BigInt(a.userData64) : 0n,
        user_data_32: a.userData32 ?? 0,
        reserved: a.reserved ?? 0,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        timestamp: 0n,
      }));
      const results = await c.createAccounts(batch);
      return results.map((r, i) => ({
        index: i,
        status: r.status === TB_CREATED ? 'created' : `error_${r.status}`,
        timestamp: r.timestamp.toString(),
      }));
    },

    async lookupTransfers(ids: string[]): Promise<TransferRow[]> {
      const c = await getClient();
      const bigIds = ids.map((id) => BigInt(id));
      const transfers = await c.lookupTransfers(bigIds);
      return transfers.map(toTransferRow);
    },

    async createTransfers(transfers: CreateTransferRow[]): Promise<CreateResultRow[]> {
      const c = await getClient();
      const batch = transfers.map((t) => ({
        id: BigInt(t.id),
        debit_account_id: BigInt(t.debitAccountId),
        credit_account_id: BigInt(t.creditAccountId),
        amount: BigInt(t.amount),
        ledger: t.ledger,
        code: t.code,
        flags: t.flags ?? 0,
        pending_id: t.pendingId ? BigInt(t.pendingId) : 0n,
        user_data_128: t.userData128 ? BigInt(t.userData128) : 0n,
        user_data_64: t.userData64 ? BigInt(t.userData64) : 0n,
        user_data_32: t.userData32 ?? 0,
        timeout: t.timeout ?? 0,
        timestamp: 0n,
      }));
      const results = await c.createTransfers(batch);
      return results.map((r, i) => ({
        index: i,
        status: r.status === TB_CREATED ? 'created' : `error_${r.status}`,
        timestamp: r.timestamp.toString(),
      }));
    },

    async getAccountTransfers(accountId: string, limit = 100): Promise<TransferRow[]> {
      const c = await getClient();
      const transfers = await c.getAccountTransfers({
        account_id: BigInt(accountId),
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        code: 0,
        timestamp_min: 0n,
        timestamp_max: 0n,
        limit,
        flags: 5, // debits + credits
      });
      return transfers.map(toTransferRow);
    },

    async getAccountBalances(accountId: string): Promise<BalanceRow[]> {
      const c = await getClient();
      const balances = await c.getAccountBalances({
        account_id: BigInt(accountId),
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        code: 0,
        timestamp_min: 0n,
        timestamp_max: 0n,
        limit: 1,
        flags: 5, // debits + credits
      });
      return balances.map(toBalanceRow);
    },

    async queryAccounts(limit = 100): Promise<AccountRow[]> {
      const c = await getClient();
      const accounts = await c.queryAccounts({
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        ledger: 0,
        code: 0,
        timestamp_min: 0n,
        timestamp_max: 0n,
        limit,
        flags: 0,
      });
      return accounts.map(toAccountRow);
    },

    async close(): Promise<void> {
      if (client) {
        try {
          client.destroy();
        } catch {
          // ignore
        }
        client = null;
        clientInitPromise = null;
      }
    },
  };
}
