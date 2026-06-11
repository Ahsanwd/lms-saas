const Redis  = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;

function getRedis() {
  if (!client) {
    client = new Redis({
      host:               config.redis.host,
      port:               config.redis.port,
      password:           config.redis.password || undefined,
      lazyConnect:        true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    client.on('error', (err) => logger.warn(`[Redis] ${err.message}`));
  }
  return client;
}

async function getCached(key) {
  try {
    const val = await getRedis().get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function setCached(key, value, ttlSeconds = 1800) {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* non-critical — analytics still returns fresh data */ }
}

async function delCachedByPrefix(prefix) {
  try {
    const keys = await getRedis().keys(`${prefix}*`);
    if (keys.length > 0) await getRedis().del(...keys);
  } catch { /* non-critical */ }
}

module.exports = { getRedis, getCached, setCached, delCachedByPrefix };
