import { getRedis } from '../config/redis.js';

export const bustCachePattern = async (pattern) => {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch { /* non-fatal */ }
};
