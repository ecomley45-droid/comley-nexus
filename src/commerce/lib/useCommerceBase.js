import { useParams } from 'react-router-dom';

// Commerce admin is mounted under /:orgSlug/commerce, so every internal link
// must be built from the current workspace slug -- not the old hardcoded
// /admin/commerce, which only worked for a single 'admin' workspace and
// bounced everywhere else.
export function useCommerceBase() {
  const { orgSlug } = useParams();
  return `/${orgSlug}/commerce`;
}
