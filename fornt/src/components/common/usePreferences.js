import { useEffect, useState } from 'react';
import { fetchJson } from '../../api';

// One entry page's section switches from Preferences (GET /api/preferences),
// e.g. usePreferences('dcEntry', { showList: true, ... }). Returns `defaults`
// (everything shown) until they load, and keeps them if loading fails.
const usePreferences = (pageKey, defaults) => {
  const [prefs, setPrefs] = useState(defaults);
  useEffect(() => {
    let cancelled = false;
    fetchJson('/api/preferences')
      .then((all) => { if (!cancelled) setPrefs((current) => ({ ...current, ...(all?.[pageKey] || {}) })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pageKey]);
  return prefs;
};

export default usePreferences;
