import { useCallback, useEffect, useRef, useState } from 'react';
import { getPages, savePages } from './api.js';

// Loads the full pages array + globalSettings once and exposes local
// mutation helpers, matching the server's contract of "always POST the
// whole pages array back" (see POST /api/pages in server.js).
//
// Accepts optional { fetchPages, savePages } overrides so the same hook
// (and the components built on it — PagesListPage, PageEditorPage) can
// drive either an org's pages (default) or Nexus's own site pages
// (src/cms/lib/api.js's getNexusPages/saveNexusPages).
//
// Concurrency: because a save posts the whole array, two people editing at
// once used to mean last-write-wins — silently discarding the other's work,
// and deleting outright any page created since this client loaded. Two
// guards now:
//   1. every page carries the `updatedAt` it was loaded with, and the server
//      refuses (409) a save that would overwrite a newer stored row;
//   2. the ids this client had loaded go up with the save, so deletions are
//      scoped to those rather than to "everything in the org".
// A refused save leaves local edits untouched and surfaces `conflict`, so the
// editor can offer reload-or-overwrite instead of losing the work.
export function usePagesStore({ fetchPages = getPages, savePages: savePagesFn = savePages } = {}) {
  const [pages, setPages] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [conflict, setConflict] = useState(null);

  // The ids present the last time the server told us the truth (load, or a
  // successful save). A page added locally but not yet saved is deliberately
  // NOT in here — it has never existed server-side, so it can't be a deletion.
  const knownIdsRef = useRef([]);

  const adopt = (data) => {
    setPages(data.pages);
    setGlobalSettings(data.globalSettings);
    knownIdsRef.current = (data.pages || []).map((p) => p.id);
  };

  const reload = useCallback(() => {
    setLoading(true);
    return fetchPages()
      .then((data) => { adopt(data); setConflict(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchPages]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (nextPages = pages, nextGlobalSettings = globalSettings, { force = false } = {}) => {
      setSaving(true);
      setSaveMessage('');
      try {
        const res = await savePagesFn(nextPages, nextGlobalSettings, {
          knownPageIds: knownIdsRef.current,
          force,
        });
        adopt(res);
        setConflict(null);
        setSaveMessage('Saved.');
        return res;
      } catch (e) {
        // 409: someone else saved one of these pages first. Local state is
        // left exactly as it is, so nothing the user typed is lost.
        if (e.status === 409) {
          setConflict({ message: e.message, conflicts: e.data?.conflicts || [] });
          setSaveMessage('');
        } else {
          setSaveMessage(e.message);
        }
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [pages, globalSettings, savePagesFn]
  );

  return {
    pages, setPages, globalSettings, setGlobalSettings,
    loading, error, saving, saveMessage, save, reload,
    conflict, dismissConflict: () => setConflict(null),
  };
}
