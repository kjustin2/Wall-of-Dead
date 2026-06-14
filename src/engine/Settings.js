// Persisted player settings. Saved to localStorage (guarded so headless/Node
// runs don't crash). Audio + Camera read these; the settings UI mutates them.

const KEY = 'wod_settings_v1';
const defaults = { volume: 0.7, muted: false, shake: 1 };

function hasStorage() {
  try { return typeof localStorage !== 'undefined'; } catch (e) { return false; }
}

function load() {
  if (!hasStorage()) return { ...defaults };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch (e) { return { ...defaults }; }
}

export const settings = load();

export function saveSettings() {
  if (!hasStorage()) return;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
