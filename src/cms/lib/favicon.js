// Point the CMS console's browser-tab icon at the active context's configured
// favicon. The static shell (index.html) ships a default `/favicon.svg`
// <link rel="icon">; the console layouts call this once their settings load
// so Super Admin shows the Nexus favicon and each workspace shows its own.
// Passing an empty url resets to the default, so switching contexts is clean.
const DEFAULT_FAVICON = '/favicon.svg';

const TYPE_BY_EXT = {
  svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon',
  webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

export function setDocumentFavicon(url) {
  const target = url || DEFAULT_FAVICON;
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  const ext = target.split('?')[0].split('.').pop()?.toLowerCase();
  if (TYPE_BY_EXT[ext]) link.type = TYPE_BY_EXT[ext];
  else link.removeAttribute('type');
  link.href = target;
}
