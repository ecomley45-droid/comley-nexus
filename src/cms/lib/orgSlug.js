// Resolves a Clerk user to the org slug that appears in their CMS URL —
// e.g. nexus.comleycreative.com/{orgSlug}/pages. The value stored in
// Clerk publicMetadata.orgSlug wins. Otherwise we fall back to the
// bootstrap slug ("admin") for anyone whose email is in the
// VITE_ADMIN_EMAILS allowlist. Anyone else gets no slug (server-side
// route guard sends them back to /).

const ADMIN_EMAILS = (import.meta.env?.VITE_ADMIN_EMAILS || 'ethanfcomley@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const BOOTSTRAP_SLUG = 'admin';

export function orgSlugFromUser(user) {
  if (!user) return null;
  const explicit = user.publicMetadata?.orgSlug;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return BOOTSTRAP_SLUG;
  return null;
}

export function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(String(email).toLowerCase());
}
