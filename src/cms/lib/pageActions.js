// Shared with PagesListPage and DashboardPage's Quick Start tile so "create
// a new blank page" is defined exactly once.
export function blankPage() {
  const id = 'page-' + Date.now();
  return {
    id,
    name: 'Untitled page',
    slug: 'untitled-' + Date.now().toString(36),
    parentId: null,
    content: [],
    seo: { title: '', description: '', ogImage: '' },
    status: 'draft',
    scheduledPublishAt: null,
    analytics: { headSnippet: '', bodySnippet: '' },
    // Inherits site-global header/footer by default. Toggle off or provide
    // an override string in the Page Editor's Layout panel to break out.
    layout: {
      useGlobalHeader: true,
      useGlobalFooter: true,
      headerOverride: '',
      footerOverride: '',
    },
  };
}

// pages/setPages/save/navigate are passed in rather than imported so callers
// keep using their own usePagesStore()/useNavigate() instances.
export async function createPage(pages, setPages, save, navigate) {
  const newPage = blankPage();
  const nextPages = [...pages, newPage];
  setPages(nextPages);
  await save(nextPages);
  navigate(`/admin/pages/${newPage.id}`);
  return newPage;
}
