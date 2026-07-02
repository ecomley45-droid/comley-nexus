import { clerkMiddleware, getAuth } from '@clerk/express';
import { hasClerk } from './env.js';
import { getCustomerByClerkId } from './customersRepo.js';

const TIER_RANK = { customer: 0, wholesaler: 1, admin: 2 };

// Attaches req.commerceUser = { clerkId, tier } from a real Clerk session
// when CLERK_SECRET_KEY is set. Without it, falls back to the same
// header-trust pattern the CMS already uses (X-User-Role), plus a new
// X-Customer-Id header, so commerce routes are testable before Clerk exists.
export const commercePassiveAuth = hasClerk
  ? [clerkMiddleware(), async (req, res, next) => {
      const { userId, sessionClaims } = getAuth(req);
      if (userId) {
        const tier = sessionClaims?.publicMetadata?.tier || 'customer';
        req.commerceUser = { clerkId: userId, tier };
      }
      next();
    }]
  : [(req, res, next) => {
      const clerkId = req.header('X-Customer-Id');
      const tier = req.header('X-User-Role') === 'admin' ? 'admin'
        : req.header('X-User-Role') === 'wholesaler' ? 'wholesaler'
        : 'customer';
      req.commerceUser = clerkId ? { clerkId, tier } : null;
      next();
    }];

export const requireCommerceTier = (minTier) => (req, res, next) => {
  const tier = req.commerceUser?.tier || 'customer';
  if ((TIER_RANK[tier] ?? 0) < TIER_RANK[minTier]) {
    return res.status(403).json({ error: `This action requires the "${minTier}" tier (you are "${tier}").` });
  }
  next();
};

export async function resolveCommerceCustomer(req) {
  if (!req.commerceUser?.clerkId) return null;
  return getCustomerByClerkId(req.commerceUser.clerkId);
}
