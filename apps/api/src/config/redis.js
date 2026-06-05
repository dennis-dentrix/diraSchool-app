import { Redis } from 'ioredis';
import { env } from './env.js';

let redisClient = null;
let warnedAboutRedisScheme = false;
const redisErrorState = new Map();
const REDIS_ERROR_LOG_INTERVAL_MS = 60_000;

const normalizeRedisUrl = () => {
  if (!env.REDIS_URL) return { url: env.REDIS_URL, useTLS: false };

  try {
    const url = new URL(env.REDIS_URL);
    const host = url.hostname.toLowerCase();
    const isUpstash = host.endsWith('.upstash.io');
    const useTLS = url.protocol === 'rediss:' || isUpstash;

    if (isUpstash && url.protocol === 'redis:') {
      url.protocol = 'rediss:';
      if (!warnedAboutRedisScheme) {
        console.warn('[Redis] Upstash REDIS_URL uses redis://; using TLS automatically. Update REDIS_URL to rediss:// to match the provider endpoint.');
        warnedAboutRedisScheme = true;
      }
    }

    return { url: url.toString(), useTLS };
  } catch {
    return { url: env.REDIS_URL, useTLS: env.REDIS_URL.startsWith('rediss://') };
  }
};

export const logRedisConnectionError = (label, err) => {
  const now = Date.now();
  const state = redisErrorState.get(label) ?? { lastLoggedAt: 0, suppressed: 0 };

  if (now - state.lastLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
    redisErrorState.set(label, {
      ...state,
      suppressed: state.suppressed + 1,
    });
    return;
  }

  const suppressed = state.suppressed > 0
    ? ` (${state.suppressed} similar events suppressed)`
    : '';
  console.warn(`[${label}] Connection error (will retry): ${err?.message ?? String(err)}${suppressed}`);
  redisErrorState.set(label, { lastLoggedAt: now, suppressed: 0 });
};

// ── Shared base options ───────────────────────────────────────────────────────
// Used by BOTH the main app client and BullMQ connections.
// Additional per-client options are layered on top below.

const buildBaseOptions = (useTLS) => {
  return {
    // Keep idle TCP connections alive through managed Redis firewalls.
    keepAlive: 5000,
    // Force IPv4. family:0 (dual-stack) causes slow DNS on some Railway regions.
    family: 4,
    // TLS is required for rediss:// and Upstash Redis endpoints.
    tls: useTLS ? { rejectUnauthorized: false } : undefined,
    // Reconnect backoff: 200 ms -> 400 ms -> ... -> 2 s cap
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
    connectTimeout: 10_000,
  };
};

// ── Main app client ───────────────────────────────────────────────────────────
/**
 * The Redis client used by the application for caching and rate-limiting.
 *
 * Deliberately does NOT set:
 *   - maxRetriesPerRequest: null  → would make commands queue forever; 3 s
 *                                   commandTimeout would then fire → "degraded"
 *   - enableReadyCheck: false     → required by BullMQ, but wrong for the main
 *                                   client; without it, commands fire before
 *                                   Upstash finishes TLS auth → ECONNRESET
 *
 * Uses ioredis defaults:
 *   - maxRetriesPerRequest: 20    → fail fast if the connection is broken
 *   - enableReadyCheck: true      → wait for server READY before sending commands
 */
export const connectRedis = () => {
  const redisConfig = normalizeRedisUrl();
  redisClient = new Redis(redisConfig.url, {
    ...buildBaseOptions(redisConfig.useTLS),
    commandTimeout: 3_000,  // health-check ping fails fast — no 5-second hangs
  });

  redisClient.on('connect',      () => console.log('[Redis] TCP connected'));
  redisClient.on('ready',        () => console.log('[Redis] Ready — auth complete'));
  redisClient.on('reconnecting', (t) => console.warn(`[Redis] Reconnecting in ${t} ms…`));
  redisClient.on('error',        (err) => logRedisConnectionError('Redis', err));
  redisClient.on('close',        () => console.warn('[Redis] Connection closed'));

  return redisClient;
};

// ── BullMQ connection factory ─────────────────────────────────────────────────
/**
 * Creates a dedicated ioredis instance for BullMQ Queues and Workers.
 *
 * BullMQ REQUIRES:
 *   - maxRetriesPerRequest: null  → queue commands while reconnecting (never throw)
 *   - enableReadyCheck: false     → BullMQ manages its own readiness protocol
 *
 * IMPORTANT: Must be called with new Redis(url, options) — NOT { url, ...options }.
 * ioredis only parses URLs when the string is the first constructor argument.
 * Passing { url: '...' } in the options object silently connects to localhost:6379.
 *
 * BullMQ calls connection.duplicate() internally for each Queue/Worker, so each
 * gets its own isolated connection without sharing blocking-command channels.
 */
export const createBullMQConnection = (label = 'Redis:bullmq') => {
  const redisConfig = normalizeRedisUrl();
  const client = new Redis(redisConfig.url, {
    ...buildBaseOptions(redisConfig.useTLS),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  // BullMQ connections must have an error listener; rate-limit transient noise.
  client.on('error', (err) => logRedisConnectionError(label, err));
  return client;
};

// ── Client accessor ───────────────────────────────────────────────────────────
export const getRedis = () => {
  if (!redisClient || redisClient.status !== 'ready') return null;
  return redisClient;
};

// ── Cache helpers ─────────────────────────────────────────────────────────────

export const cacheGet = async (key) => {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key, value, ttlSeconds) => {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache is optional. Ignore Redis failures and keep request handling alive.
  }
};

export const cacheDel = async (key) => {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Cache is optional. Ignore Redis failures and keep request handling alive.
  }
};

export const cacheDelPattern = async (pattern) => {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Cache is optional. Ignore Redis failures and keep request handling alive.
  }
};

/**
 * Efficiently delete multiple specific cache keys.
 * Preferred over cacheDelPattern which uses slow redis.keys() scan.
 *
 * @param {string[]} keys - Array of cache keys to delete
 */
export const cacheInvalidateMultiple = async (keys) => {
  const redis = getRedis();
  if (!redis || !keys || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    // Cache is optional. Ignore Redis failures and keep request handling alive.
  }
};
