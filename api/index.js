// Vercel serverless entry. Vercel's Node runtime hands us standard
// http.IncomingMessage / http.ServerResponse objects — the same shape
// Express middleware expects. So we can just call app(req, res) directly.
// No serverless-http wrapper needed (and it was hanging on Vercel's
// request shape).

import '../instrument.mjs';
import app from '../server.js';

export default function handler(req, res) {
  return app(req, res);
}

export const config = { runtime: 'nodejs' };
