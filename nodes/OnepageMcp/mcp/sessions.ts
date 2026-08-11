import type { Logger } from 'n8n-workflow';

import type { OnepageMcpClient } from './client';
import type { McpTool } from './types';

/** An idle session is dropped after this long; a backstop for executions that never finish. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Hard cap so a busy instance cannot grow the cache without bound. */
const MAX_CACHED_CLIENTS = 100;

export interface ConnectedMcp {
  client: OnepageMcpClient;
  mcpTools: McpTool[];
}

interface CachedClient extends ConnectedMcp {
  lastUsedAt: number;
  /** Guards late-firing cancellation handlers against closing a replacement under the same key. */
  epoch: number;
}

export interface GetOrConnectOptions {
  logger?: Logger;
  onExecutionCancellation?: (handler: () => unknown) => void;
}

/**
 * Keeps one MCP client alive per workflow execution and node, so several agent tool calls inside
 * one execution share a single MCP session (stateful servers need this).
 *
 * n8n solves the same problem with `McpClientsManager`, a `@n8n/di` service resolved via
 * `Container.get()`. `@n8n/di` is internal, so this is a plain module-level singleton with the same
 * key semantics. The second deviation is eviction: n8n sweeps on a `setInterval`, which community
 * nodes may not use (`no-restricted-globals`), so stale entries are swept lazily on every access.
 */
class McpClientRegistry {
  private readonly activeClients = new Map<string, CachedClient>();
  private readonly pendingConnections = new Map<string, Promise<ConnectedMcp>>();
  private epochCounter = 0;

  async getOrConnect(
    key: string,
    connect: () => Promise<ConnectedMcp>,
    options: GetOrConnectOptions = {},
  ): Promise<ConnectedMcp> {
    this.evictStale(options.logger);

    const cached = this.activeClients.get(key);
    if (cached && !cached.client.isClosed) {
      options.logger?.debug('Onepage MCP: reusing cached client', { cacheKey: key });
      cached.lastUsedAt = Date.now();
      this.registerCancellationCleanup(key, cached.epoch, options);
      return { client: cached.client, mcpTools: cached.mcpTools };
    }

    // A client that closed itself (transport error, cancellation) must never be handed out again.
    if (cached) this.activeClients.delete(key);

    const inFlight = this.pendingConnections.get(key);
    if (inFlight) return await inFlight;

    const pending = connect();
    this.pendingConnections.set(key, pending);

    try {
      const connected = await pending;
      const epoch = ++this.epochCounter;
      this.activeClients.set(key, { ...connected, lastUsedAt: Date.now(), epoch });
      this.enforceMaxSize(options.logger);
      this.registerCancellationCleanup(key, epoch, options);
      return connected;
    } finally {
      this.pendingConnections.delete(key);
    }
  }

  /** Bumps the idle timer, e.g. at the end of a tool call while the agent thinks. */
  refresh(key: string): void {
    const cached = this.activeClients.get(key);
    if (cached) cached.lastUsedAt = Date.now();
  }

  remove(key: string, logger?: Logger): void {
    const cached = this.activeClients.get(key);
    if (!cached) return;

    this.activeClients.delete(key);
    void cached.client.close().catch((error: unknown) => {
      logger?.debug('Onepage MCP: closing a cached client failed', {
        cacheKey: key,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private removeIfCurrent(key: string, epoch: number, logger?: Logger): void {
    if (this.activeClients.get(key)?.epoch === epoch) this.remove(key, logger);
  }

  private registerCancellationCleanup(
    key: string,
    epoch: number,
    options: GetOrConnectOptions,
  ): void {
    options.onExecutionCancellation?.(() => this.removeIfCurrent(key, epoch, options.logger));
  }

  private evictStale(logger?: Logger): void {
    const deadline = Date.now() - CACHE_TTL_MS;
    for (const [key, cached] of this.activeClients) {
      if (cached.lastUsedAt <= deadline || cached.client.isClosed) {
        this.remove(key, logger);
      }
    }
  }

  private enforceMaxSize(logger?: Logger): void {
    while (this.activeClients.size > MAX_CACHED_CLIENTS) {
      let oldestKey: string | undefined;
      let oldestUsedAt = Number.POSITIVE_INFINITY;
      for (const [key, cached] of this.activeClients) {
        if (cached.lastUsedAt < oldestUsedAt) {
          oldestUsedAt = cached.lastUsedAt;
          oldestKey = key;
        }
      }
      if (oldestKey === undefined) return;
      this.remove(oldestKey, logger);
    }
  }

  /** Test seam: drops every cached client without closing it. */
  reset(): void {
    this.activeClients.clear();
    this.pendingConnections.clear();
  }

  get size(): number {
    return this.activeClients.size;
  }
}

export const mcpClientRegistry = new McpClientRegistry();

/**
 * Cache key for one MCP session.
 *
 * The execution id keeps sessions from leaking between workflow executions (including concurrent
 * ones), the node id keeps two Onepage MCP sub-nodes in the same workflow apart. Callers must not
 * use the cache at all when no execution id is available — see `executeMcpTool`.
 */
export function buildSessionCacheKey(executionId: string, nodeId: string): string {
  return `${executionId}:${nodeId}`;
}
