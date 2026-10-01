import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  isMcpServerKind,
  isMcpSupportedKind,
  MCP_MANAGED_ACCOUNT_STATE,
  type McpListenerStatus,
  type McpSettingsResponse,
} from '@kamehadb/shared';
import {
  getMcpSettings,
  getProfile,
  listMcpManagedAccounts,
  listProfiles,
  loadMcpManagedCredential,
  rotateMcpToken,
  updateMcpPort,
} from '../db/metadata-store.js';
import { log } from '../lib/logger.js';
import { isMcpManagedCredentialForProfile } from './account-provisioner.js';
import { McpAdapterManager } from './adapter-manager.js';
import { registerMcpTools } from './tools.js';

const MCP_PATH = '/mcp';
const MCP_HOST = '127.0.0.1';
const MAX_REQUEST_BYTES = 1_000_000;
const SERVER_INFO = { name: 'kamehadb-mcp', version: '1.0.0' };

// Constant-time bearer comparison. Length mismatch short-circuits without a
// timing-safe call because timingSafeEqual requires equal-length buffers.
function safeTokenEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

async function readRequestBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  return JSON.parse(raw) as unknown;
}

// Owns the dedicated loopback MCP listener and its lifecycle. It keeps MCP
// separate from the internal sidecar listener, binds only to 127.0.0.1, and
// never falls back to another port.
export class McpRuntime {
  readonly adapterManager = new McpAdapterManager();
  private server: Server | null = null;
  private port: number;
  private token: string;
  private status: McpListenerStatus = 'stopped';
  private message?: string;
  private lifecycleQueue: Promise<void> = Promise.resolve();

  constructor() {
    const settings = getMcpSettings();
    this.port = settings.port;
    this.token = settings.token;

    // Restore ready accounts directly from local storage whenever the sidecar starts.
    // Missing or invalid legacy credentials stay unavailable without using profile passwords.
    for (const account of listMcpManagedAccounts()) {
      if (account.state !== MCP_MANAGED_ACCOUNT_STATE.READY) continue;
      const profile = getProfile(account.profileId);
      if (!profile || !isMcpServerKind(profile.kind)) continue;
      try {
        const credential = loadMcpManagedCredential(account.profileId);
        if (!credential || !isMcpManagedCredentialForProfile(profile, account.accountRef, credential)) {
          log.warn({ profileId: account.profileId }, 'Stored MCP credential is missing or invalid');
          continue;
        }
        this.adapterManager.setCredential(account.profileId, credential);
      } catch {
        log.warn({ profileId: account.profileId }, 'Stored MCP credential could not be loaded');
      }
    }
  }

  getStatus(): { status: McpListenerStatus; port: number; endpoint: string; message?: string } {
    return { status: this.status, port: this.port, endpoint: this.endpoint(), message: this.message };
  }

  getToken(): string {
    return this.token;
  }

  endpoint(): string {
    return `http://${MCP_HOST}:${this.port}${MCP_PATH}`;
  }

  // Credential-free snapshot for the settings route.
  settingsResponse(): McpSettingsResponse {
    const enabledProfiles = listProfiles()
      .filter((profile) => profile.mcpEnabled && isMcpSupportedKind(profile.kind))
      .map((profile) => ({ id: profile.id, name: profile.name, kind: profile.kind, database: profile.database }));
    const status = this.getStatus();
    return {
      status: status.status,
      port: status.port,
      endpoint: status.endpoint,
      token: this.token,
      enabledProfiles,
      message: status.message,
    };
  }

  async start(): Promise<void> {
    await this.serializeLifecycle(() => this.bind(this.port));
  }

  // Listener controls can arrive from separate settings actions; serialize
  // them so concurrent retries and port changes cannot race to bind the port.
  private serializeLifecycle(operation: () => Promise<void>): Promise<void> {
    const result = this.lifecycleQueue.then(operation, operation);
    this.lifecycleQueue = result.catch(() => undefined);
    return result;
  }

  private async bind(port: number): Promise<void> {
    this.port = port;
    await this.stop();

    await new Promise<void>((resolve) => {
      const server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        server.close();
        this.status = 'unavailable';
        this.message =
          err.code === 'EADDRINUSE' ? `MCP unavailable: port ${port} is in use` : `MCP unavailable: ${err.message}`;
        log.warn({ err, port }, 'MCP listener failed to bind');
        resolve();
      });
      server.listen(port, MCP_HOST, () => {
        const address = server.address();
        // Port 0 asks the OS for a free port; record the actual bound port so
        // the advertised endpoint stays correct (used by tests).
        if (address && typeof address === 'object') this.port = address.port;
        this.server = server;
        this.status = 'listening';
        this.message = undefined;
        log.info({ port: this.port }, 'MCP listener listening on 127.0.0.1');
        resolve();
      });
    });
  }

  async updatePort(port: number): Promise<void> {
    await this.serializeLifecycle(async () => {
      updateMcpPort(port);
      await this.bind(port);
    });
  }

  async retry(): Promise<void> {
    await this.serializeLifecycle(() => this.bind(this.port));
  }

  rotateToken(): string {
    this.token = rotateMcpToken();
    return this.token;
  }

  async close(): Promise<void> {
    await this.serializeLifecycle(async () => {
      await this.stop();
      this.status = 'stopped';
    });
    await this.adapterManager.closeAll();
  }

  private async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    return safeTokenEqual(header.slice('Bearer '.length).trim(), this.token);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${MCP_HOST}`);
    if (url.pathname !== MCP_PATH) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'NOT_FOUND' }));
      return;
    }

    // Stateless transport: no standalone SSE stream (GET) and no session to
    // delete (DELETE). Only POST carries JSON-RPC messages.
    if (req.method !== 'POST') {
      res
        .writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
      return;
    }

    if (!this.isAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return;
    }

    let body: unknown;
    try {
      body = await readRequestBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'INVALID_JSON' }));
      return;
    }

    const server = new McpServer(SERVER_INFO);
    registerMcpTools(server, this.adapterManager);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      log.error({ err }, 'MCP request handling failed');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      }
    }
  }
}
