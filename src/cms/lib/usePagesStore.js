import { useCallback, useEffect, useState } from 'react';
import { getPages, savePages } from './api.js';

// Loads the full pages array + globalSettings once and exposes local
// mutation helpers, matching the server's contract of "always POST the
// whole pages array back" (see POST /api/pages in server.js).
export function usePagesStore() {
  const [pages, setPages] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    return getPages()
      .then((data) => {
        setPages(data.pages);
        setGlobalSettings(data.globalSettings);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (nextPages = pages, nextGlobalSettings = globalSettings) => {
      setSaving(true);
      setSaveMessage('');
      try {
        const res = await savePages(nextPages, nextGlobalSettings);
        setPages(res.pages);
        setGlobalSettings(res.globalSettings);
        setSaveMessage('Saved.');
        return res;
      } catch (e) {
        setSaveMessage(e.message);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [pages, globalSettings]
  );

  return { pages, setPages, globalSettings, setGlobalSettings, loading, error, saving, saveMessage, save, reload };
}
