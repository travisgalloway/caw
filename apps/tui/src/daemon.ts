import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseType } from '@caw/core';
import { lockService, sessionService } from '@caw/core';
import { createMcpServer, DEFAULT_PORT, resolveConfig, startServer } from '@caw/mcp-server';

// --- Constants ---

export const HEARTBEAT_INTERVAL = 15_000;
export const STALE_TIMEOUT = 60_000;
export const HEALTH_TIMEOUT = 3_000;

// --- Types ---

export interface LockFileData {
  pid: number;
  port: number;
  session_id: string;
  shutting_down?: boolean;
}

export interface DaemonResult {
  sessionId: string;
  isDaemon: boolean;
  port: number;
  cleanup: () => void;
}

// --- Lock file helpers ---

export function getLockFilePath(dbPath: string): string {
  return join(dirname(dbPath), 'server.lock');
}

function readLockFile(lockPath: string): LockFileData | null {
  try {
    if (!existsSync(lockPath)) return null;
    const content = readFileSync(lockPath, 'utf-8');
    return JSON.parse(content) as LockFileData;
  } catch {
    return null;
  }
}

function writeLockFile(lockPath: string, data: LockFileData): boolean {
  try {
    writeFileSync(lockPath, JSON.stringify(data), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function removeLockFile(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // already removed
  }
}

// --- Process / health helpers ---

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function healthCheck(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
    const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// --- Core daemon logic ---

export async function initDaemon(
  db: DatabaseType,
  dbPath: string,
  port?: number,
): Promise<DaemonResult> {
  const resolvedPort = port ?? DEFAULT_PORT;
  const lockPath = getLockFilePath(dbPath);

  // Clean up stale sessions and release their workflow locks
  lockService.releaseStaleWorkflowLocks(db, STALE_TIMEOUT);
  sessionService.cleanupStale(db, STALE_TIMEOUT);

  // Check if an existing daemon is running
  const lockData = readLockFile(lockPath);
  if (lockData && isProcessAlive(lockData.pid)) {
    const healthy = await healthCheck(lockData.port);
    if (healthy) {
      return joinAsClient(db, lockPath, lockData.port);
    }
  }

  // Daemon is dead or missing — clean up
  if (lockData) {
    removeLockFile(lockPath);
    sessionService.deregister(db, lockData.session_id);
  }

  // Try to become daemon
  return startAsDaemon(db, lockPath, resolvedPort);
}

async function startAsDaemon(
  db: DatabaseType,
  lockPath: string,
  port: number,
): Promise<DaemonResult> {
  const session = sessionService.register(db, {
    pid: process.pid,
    is_daemon: true,
    metadata: { port },
  });

  const lockData: LockFileData = {
    pid: process.pid,
    port,
    session_id: session.id,
  };

  const wrote = writeLockFile(lockPath, lockData);
  if (!wrote) {
    // Another process won the race — fall back to client
    sessionService.deregister(db, session.id);

    // Re-read the lock file to find the daemon's port
    const otherLock = readLockFile(lockPath);
    const daemonPort = otherLock?.port ?? port;
    return joinAsClient(db, lockPath, daemonPort);
  }

  // Start embedded MCP HTTP server
  const config = resolveConfig({ transport: 'http', port: String(port) });
  config.quiet = true;
  const mcpServer = createMcpServer(db);
  const serverHandle = await startServer(mcpServer, config, db);

  // Start heartbeat
  const heartbeatTimer = setInterval(() => {
    try {
      sessionService.heartbeat(db, session.id);
    } catch {
      // db may be closed during shutdown
    }
  }, HEARTBEAT_INTERVAL);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeatTimer);
    serverHandle.stop();
    try {
      const current = readLockFile(lockPath);
      if (current && current.session_id === session.id) {
        removeLockFile(lockPath);
      }
    } catch {
      // best effort
    }
    sessionService.deregister(db, session.id);
  };

  return {
    sessionId: session.id,
    isDaemon: true,
    port,
    cleanup,
  };
}

function joinAsClient(db: DatabaseType, lockPath: string, daemonPort: number): DaemonResult {
  const session = sessionService.register(db, {
    pid: process.pid,
    is_daemon: false,
    metadata: { daemon_port: daemonPort },
  });

  let isDaemon = false;
  let promoting = false;
  let currentPort = daemonPort;

  // Heartbeat + daemon monitor interval
  const heartbeatTimer = setInterval(async () => {
    try {
      sessionService.heartbeat(db, session.id);
    } catch {
      // db may be closed during shutdown
      return;
    }

    // If we've already been promoted or promotion is in progress, skip monitoring
    if (isDaemon || promoting) return;

    // Monitor daemon health
    const healthy = await healthCheck(currentPort);
    if (!healthy) {
      promoting = true;
      try {
        await attemptPromotion(db, lockPath, session.id, currentPort);
      } finally {
        promoting = false;
      }
    }
  }, HEARTBEAT_INTERVAL);

  const attemptPromotion = async (
    db: DatabaseType,
    lockPath: string,
    sessionId: string,
    port: number,
  ) => {
    // Daemon appears dead — try to take over
    const lockData = readLockFile(lockPath);
    if (lockData) {
      removeLockFile(lockPath);
      sessionService.deregister(db, lockData.session_id);
    }

    const newLockData: LockFileData = {
      pid: process.pid,
      port,
      session_id: sessionId,
    };

    const wrote = writeLockFile(lockPath, newLockData);
    if (wrote) {
      // We won the race — promote ourselves
      sessionService.promoteToDaemon(db, sessionId);
      isDaemon = true;
      currentPort = port;

      // Start embedded MCP server
      const config = resolveConfig({ transport: 'http', port: String(port) });
      config.quiet = true;
      const mcpServer = createMcpServer(db);
      await startServer(mcpServer, config, db);
    } else {
      // Another client won — re-read lock to find new daemon port
      const otherLock = readLockFile(lockPath);
      if (otherLock) {
        currentPort = otherLock.port;
      }
    }
  };

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeatTimer);
    // If promoted to daemon, remove lock file
    if (isDaemon) {
      try {
        const current = readLockFile(lockPath);
        if (current && current.session_id === session.id) {
          removeLockFile(lockPath);
        }
      } catch {
        // best effort
      }
    }
    sessionService.deregister(db, session.id);
  };

  return {
    sessionId: session.id,
    isDaemon: false,
    port: currentPort,
    cleanup,
  };
}
