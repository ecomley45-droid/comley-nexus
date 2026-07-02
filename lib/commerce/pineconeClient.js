import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { env, hasPinecone, hasOpenAI } from './env.js';
import { listProducts } from './productsRepo.js';
import { listOrders } from './ordersRepo.js';

const canEmbedAndIndex = hasPinecone && hasOpenAI;

const pinecone = hasPinecone ? new Pinecone({ apiKey: env.pineconeApiKey }) : null;
const openai = hasOpenAI ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

const index = () => pinecone.index(env.pineconeIndex);
const productText = (p) => `${p.name} ${p.description || ''} ${p.sku}`.trim();

async function embed(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
  return res.data[0].embedding;
}

// Called on product create/update/delete. No-ops when Pinecone/OpenAI aren't
// configured — search then just falls back to keyword matching over the
// local product store (see searchProducts below).
export async function upsertProductVector(product) {
  if (!canEmbedAndIndex) return;
  const values = await embed(productText(product));
  await index().upsert([{ id: product.id, values, metadata: { name: product.name, sku: product.sku } }]);
}

export async function deleteProductVector(productId) {
  if (!canEmbedAndIndex) return;
  await index().deleteOne(productId);
}

async function keywordSearch(query, limit) {
  const products = await listProducts();
  const q = query.toLowerCase();
  return products
    .filter((p) => productText(p).toLowerCase().includes(q))
    .slice(0, limit);
}

async function semanticSearch(query, limit) {
  const values = await embed(query);
  const result = await index().query({ vector: values, topK: limit, includeMetadata: true });
  const products = await listProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  return result.matches.map((m) => byId.get(m.id)).filter(Boolean);
}

// "Customers also viewed" without a dedicated view-tracking table: derives
// co-purchase pairs from order history (products bought alongside this one).
async function customersAlsoViewed(productId, limit) {
  const orders = await listOrders();
  const coCounts = new Map();
  for (const order of orders) {
    const ids = order.items.map((i) => i.productId);
    if (!ids.includes(productId)) continue;
    for (const id of ids) {
      if (id === productId) continue;
      coCounts.set(id, (coCounts.get(id) || 0) + 1);
    }
  }
  const rankedIds = [...coCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  const products = await listProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  return rankedIds.map((id) => byId.get(id)).filter(Boolean);
}

export async function searchProducts(query, { limit = 5, alsoViewedFor } = {}) {
  const results = canEmbedAndIndex ? await semanticSearch(query, limit) : await keywordSearch(query, limit);
  const alsoViewed = alsoViewedFor ? await customersAlsoViewed(alsoViewedFor, limit) : [];
  return { results, alsoViewed, mode: canEmbedAndIndex ? 'semantic' : 'keyword' };
}
