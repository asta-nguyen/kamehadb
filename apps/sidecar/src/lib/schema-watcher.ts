import pg from 'pg';
import type { ConnectionProfile, SchemaSnapshotSource, SchemaWatcherStatus } from '@kamehadb/shared';
import { KIND } from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';
import { log } from './logger.js';
import {
  WATCHER_DEFAULT_INTERVAL_MS,
  WATCHER_RECONNECT_INITIAL_MS,
  WATCHER_RECONNECT_MAX_MS,
  SCHEMA_NOTIFY_CHANNEL,
} from './constants.js';

/** Function that captures a snapshot for a connection. Injected by sql-schema.ts on init to avoid circular imports. */
type CaptureFn = (connectionId: number, source: SchemaSnapshotSource) => Promise<void>;

type NotifyListenerEntry = { client: pg.Client; stopped: boolean };

class SchemaWatcherManager {
  private cadenceTimers = new Map<number, NodeJS.Timeout>();
  private lastCaptureAt = new Map<number, string>();
  private captureFn: CaptureFn | null = null;
  private notifyListeners = new Map<number, NotifyListenerEntry>();
  private reconnectTimers = new Map<number, NodeJS.Timeout>();
  private reconnectAttempts = new Map<number, number>();
  private cadenceInFlight = new Map<number, boolean>();

  /** Inject the capture function (called once on sidecar startup from sql-schema.ts). */
  setCaptureFn(fn: CaptureFn): void {
    this.captureFn = fn;
  }

  /** Start cadence-based auto-snapshots for a connection. Persists config and starts the interval timer. */
  startCadence(connectionId: number, intervalMs: number): void {
    this.stopCadence(connectionId);

    const existing = metadataStore.getSchemaWatcher(connectionId);
    metadataStore.upsertSchemaWatcher({
      connectionId,
      cadenceEnabled: true,
      notifyEnabled: existing?.notifyEnabled ?? false,
      intervalMs,
    });

    const timer = setInterval(() => {
      // Guard against overlapping captures: if the previous runCapture for
      // this connection is still in flight (e.g. slow schema introspection),
      // skip this tick so we don't pile up concurrent snapshot work.
      if (this.cadenceInFlight.get(connectionId)) return;
      this.cadenceInFlight.set(connectionId, true);
      this.runCapture(connectionId, 'auto-cadence')
        .catch((err) => {
          log.error({ connectionId, err }, 'Cadence auto-snapshot failed');
        })
        .finally(() => {
          this.cadenceInFlight.set(connectionId, false);
        });
    }, intervalMs);

    this.cadenceTimers.set(connectionId, timer);
    log.info({ connectionId, intervalMs }, 'Schema cadence watcher started');
  }

  /** Stop cadence-based auto-snapshots for a connection. Updates persisted config and clears the timer. */
  stopCadence(connectionId: number): void {
    const timer = this.cadenceTimers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.cadenceTimers.delete(connectionId);
    }
    this.cadenceInFlight.delete(connectionId);

    const existing = metadataStore.getSchemaWatcher(connectionId);
    if (existing) {
      metadataStore.upsertSchemaWatcher({
        connectionId,
        cadenceEnabled: false,
        notifyEnabled: existing.notifyEnabled,
        intervalMs: existing.intervalMs,
      });
    }
    log.info({ connectionId }, 'Schema cadence watcher stopped');
  }

  /** Start a pg_notify listener for PostgreSQL schema-change events.
   * Uses a dedicated pg.Client (not the adapter pool) so the listener
   * persists independently of query traffic. Reconnects with linear backoff
   * on disconnect. */
  async startNotify(connectionId: number): Promise<void> {
    this.stopNotify(connectionId);

    // Verify this is a PostgreSQL connection — pg_notify is PG-only.
    const profile = metadataStore.getProfile(connectionId);
    if (!profile || profile.kind !== KIND.POSTGRES) {
      throw new Error('pg_notify watcher is only available for PostgreSQL connections');
    }

    const existing = metadataStore.getSchemaWatcher(connectionId);

    // Connect the listener first; only persist notifyEnabled: true after
    // connect + LISTEN succeed, so a failed startup doesn't leave the store
    // reporting a running watcher with no actual listener.
    await this.connectNotifyListener(connectionId, profile);
    metadataStore.upsertSchemaWatcher({
      connectionId,
      cadenceEnabled: existing?.cadenceEnabled ?? false,
      notifyEnabled: true,
      intervalMs: existing?.intervalMs ?? WATCHER_DEFAULT_INTERVAL_MS,
    });
    log.info({ connectionId }, 'Schema pg_notify watcher started');
  }

  /** Connect a single pg.Client listener for the connection. */
  private async connectNotifyListener(connectionId: number, profile: ConnectionProfile): Promise<void> {
    const password = metadataStore.getProfilePassword(connectionId);
    const client = new pg.Client({
      host: profile.host || 'localhost',
      port: profile.port || 5432,
      database: profile.database,
      user: profile.username,
      password: password ?? undefined,
      ssl: profile.ssl ? true : false,
    });

    const entry: NotifyListenerEntry = { client, stopped: false };

    // Fire a snapshot capture when a notification arrives — the payload means schema changed.
    client.on('notification', () => {
      this.runCapture(connectionId, 'auto-notify').catch((err) => {
        log.error({ connectionId, err }, 'pg_notify auto-snapshot failed');
      });
    });

    // On error or unexpected disconnect, schedule a reconnection with backoff.
    client.on('error', (err) => {
      if (entry.stopped) return;
      log.warn({ connectionId, err }, 'pg_notify listener error — scheduling reconnect');
      this.scheduleReconnect(connectionId);
    });

    client.on('end', () => {
      if (entry.stopped) return;
      log.warn({ connectionId }, 'pg_notify listener disconnected — scheduling reconnect');
      this.scheduleReconnect(connectionId);
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${SCHEMA_NOTIFY_CHANNEL}`);
    } catch (err) {
      entry.stopped = true;
      try {
        await client.end();
      } catch {
        // ignore — client may not have connected
      }
      throw err;
    }

    // Only register as running after connect + LISTEN succeed, so a failed
    // startup doesn't leave a stale entry reporting a running watcher.
    this.notifyListeners.set(connectionId, entry);
  }

  /** Schedule a reconnection attempt with linear backoff. */
  private scheduleReconnect(connectionId: number): void {
    const existingTimer = this.reconnectTimers.get(connectionId);
    if (existingTimer) clearTimeout(existingTimer);

    // Linear backoff: increment by WATCHER_RECONNECT_INITIAL_MS each attempt,
    // capped at WATCHER_RECONNECT_MAX_MS.
    const attempt = (this.reconnectAttempts.get(connectionId) ?? 0) + 1;
    this.reconnectAttempts.set(connectionId, attempt);
    const delay = Math.min(WATCHER_RECONNECT_INITIAL_MS * attempt, WATCHER_RECONNECT_MAX_MS);

    log.info({ connectionId, delay, attempt }, 'Scheduling pg_notify reconnect');
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(connectionId);
      this.reconnectNotify(connectionId).catch((err) => {
        log.error({ connectionId, err }, 'pg_notify reconnect failed');
        this.scheduleReconnect(connectionId);
      });
    }, delay);
    this.reconnectTimers.set(connectionId, timer);
  }

  /** Attempt to reconnect the pg_notify listener. */
  private async reconnectNotify(connectionId: number): Promise<void> {
    const profile = metadataStore.getProfile(connectionId);
    if (!profile) {
      log.warn({ connectionId }, 'Connection profile gone — stopping notify listener');
      this.stopNotify(connectionId);
      return;
    }
    // Clean up the old client before reconnecting.
    const old = this.notifyListeners.get(connectionId);
    if (old) {
      old.stopped = true;
      try {
        await old.client.end();
      } catch {
        // ignore — client may already be disconnected
      }
      this.notifyListeners.delete(connectionId);
    }
    await this.connectNotifyListener(connectionId, profile);
    // Reset attempt counter on successful reconnect.
    this.reconnectAttempts.delete(connectionId);
    log.info({ connectionId }, 'pg_notify listener reconnected');
  }

  /** Stop the pg_notify listener for a connection. */
  stopNotify(connectionId: number): void {
    const timer = this.reconnectTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(connectionId);
    }
    this.reconnectAttempts.delete(connectionId);

    const entry = this.notifyListeners.get(connectionId);
    if (entry) {
      entry.stopped = true;
      entry.client.end().catch(() => {});
      this.notifyListeners.delete(connectionId);
    }

    const existing = metadataStore.getSchemaWatcher(connectionId);
    if (existing) {
      metadataStore.upsertSchemaWatcher({
        connectionId,
        cadenceEnabled: existing.cadenceEnabled,
        notifyEnabled: false,
        intervalMs: existing.intervalMs,
      });
    }
    log.info({ connectionId }, 'Schema pg_notify watcher stopped');
  }

  /** Get the runtime status for a connection. */
  getStatus(connectionId: number): SchemaWatcherStatus {
    const config = metadataStore.getSchemaWatcher(connectionId);
    return {
      cadenceRunning: this.cadenceTimers.has(connectionId),
      notifyRunning: this.notifyListeners.has(connectionId),
      intervalMs: config?.intervalMs ?? WATCHER_DEFAULT_INTERVAL_MS,
      lastCaptureAt: this.lastCaptureAt.get(connectionId) ?? null,
    };
  }

  /** Resume all enabled watchers on sidecar startup. */
  resumeAll(): void {
    const enabled = metadataStore.listEnabledSchemaWatchers();
    for (const config of enabled) {
      if (config.cadenceEnabled) {
        this.startCadence(config.connectionId, config.intervalMs);
      }
      if (config.notifyEnabled) {
        // Fire-and-forget — startNotify is async but resumeAll is sync.
        this.startNotify(config.connectionId).catch((err) => {
          log.error({ connectionId: config.connectionId, err }, 'Failed to resume pg_notify watcher');
        });
      }
    }
    if (enabled.length > 0) {
      log.info({ count: enabled.length }, 'Schema watchers resumed');
    }
  }

  /** Stop all watchers on sidecar shutdown. */
  stopAll(): void {
    for (const timer of this.cadenceTimers.values()) {
      clearInterval(timer);
    }
    this.cadenceTimers.clear();

    for (const [, entry] of this.notifyListeners) {
      entry.stopped = true;
      entry.client.end().catch(() => {});
    }
    this.notifyListeners.clear();

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
  }

  /** Run a single snapshot capture and record the timestamp. */
  private async runCapture(connectionId: number, source: SchemaSnapshotSource): Promise<void> {
    if (!this.captureFn) {
      log.warn({ connectionId }, 'Schema watcher capture function not set — skipping capture');
      return;
    }
    await this.captureFn(connectionId, source);
    this.lastCaptureAt.set(connectionId, new Date().toISOString());
  }
}

export const schemaWatcher = new SchemaWatcherManager();
