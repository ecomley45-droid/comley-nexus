import { Redis } from '@upstash/redis';
import { env, hasUpstash } from './env.js';

const TTL_SECONDS = 5 * 60; // 5 minute cart TTL per spec

const redis = hasUpstash ? new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken }) : null;

// In-memory fallback: Map<sessionId, { items, expiresAt }>, self-pruning via
// setTimeout so it behaves like a real TTL store for local dev.
const memoryStore = new Map();
const setMemoryCart = (sessionId, items) => {
  const existing = memoryStore.get(sessionId);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => memoryStore.delete(sessionId), TTL_SECONDS * 1000);
  memoryStore.set(sessionId, { items, timer });
};

const cartKey = (sessionId) => `cart:${sessionId}`;

export async function getCart(sessionId) {
  if (hasUpstash) {
    const items = await redis.get(cartKey(sessionId));
    return items || [];
  }
  return memoryStore.get(sessionId)?.items || [];
}

export async function setCart(sessionId, items) {
  if (hasUpstash) {
    await redis.set(cartKey(sessionId), items, { ex: TTL_SECONDS });
    return items;
  }
  setMemoryCart(sessionId, items);
  return items;
}

export async function addToCart(sessionId, item) {
  const items = await getCart(sessionId);
  const idx = items.findIndex((i) => i.productId === item.productId && i.variantId === item.variantId);
  if (idx === -1) {
    items.push(item);
  } else {
    items[idx].quantity += item.quantity;
  }
  return setCart(sessionId, items);
}

export async function clearCart(sessionId) {
  if (hasUpstash) {
    await redis.del(cartKey(sessionId));
    return;
  }
  const existing = memoryStore.get(sessionId);
  if (existing?.timer) clearTimeout(existing.timer);
  memoryStore.delete(sessionId);
}
