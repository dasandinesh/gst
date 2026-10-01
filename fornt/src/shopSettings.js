// The shop's invoice settings ("bill series": letterhead + GST bill numbering),
// shared by every page. The server sends them without the logo (it can be up to
// 1MB); the logo is fetched separately, only for the printed letterheads, and
// kept in memory — so it downloads once per visit instead of on every page.
import { fetchJson } from './api';

const TTL_MS = 60 * 1000;
let active = null; // { at, promise }
let list = null;
const logos = new Map(); // `${id}|${updatedAt}` → promise of the logo data URI

const cached = (entry, url) => {
  if (entry && Date.now() - entry.at < TTL_MS) return entry;
  const fresh = { at: Date.now(), promise: fetchJson(url) };
  fresh.promise.catch(() => { if (active === fresh) active = null; if (list === fresh) list = null; });
  return fresh;
};

// The default series (what most pages print with), without the logo.
// Includes `seriesCount` — the series dropdown only appears when it is 2 or more.
export const getActiveSetting = () => {
  active = cached(active, '/api/invoice-settings/active');
  return active.promise;
};

// Every series, without logos.
export const getSeriesList = () => {
  list = cached(list, '/api/invoice-settings');
  return list.promise;
};

// Call after saving Invoice Settings so pages pick up the change.
export const clearShopSettingsCache = () => {
  active = null;
  list = null;
  logos.clear();
};

// The setting with its logo filled in (fetched once, then reused).
export const withLogo = async (setting) => {
  if (!setting || !setting.hasLogo || setting.logo) return setting;
  const key = `${setting._id}|${setting.updatedAt}`;
  if (!logos.has(key)) {
    const promise = fetchJson(`/api/invoice-settings/${setting._id}/logo`).then((r) => r.logo || '');
    promise.catch(() => logos.delete(key));
    logos.set(key, promise);
  }
  return { ...setting, logo: await logos.get(key) };
};

// The letterhead a GST bill prints with: its own series, else the default.
export const settingForBill = async (bill) => {
  const seriesId = bill?.billDetails?.seriesId;
  if (seriesId) {
    const series = (await getSeriesList()).find((s) => String(s._id) === String(seriesId));
    if (series) return withLogo(series);
  }
  return withLogo(await getActiveSetting());
};
