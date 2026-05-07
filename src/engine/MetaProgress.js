// Persistent meta-state that survives across runs. Stored in localStorage
// under a single JSON blob. Pattern from roguehero2/src/MetaProgress.js:
// deep-clone DEFAULT_STATE on reset, lazy-backfill missing fields on load
// so old saves don't explode after a schema bump.

const STORAGE_KEY = 'wall_of_dead_meta';

const DEFAULT_STATE = {
  version: 1,
  totalRuns: 0,
  totalWins: 0,
  bestNight: 0,
  totalKills: 0,
  scrap: 0,                        // persistent meta-currency
  unlockedWeapons: ['pistol'],     // expand by winning runs / shop unlocks
  unlockedStarters: ['pistol'],    // available at BaseCampScene
  achievements: {},
  leaderboard: [],                 // top 10 [{ nights, kills, date }]
  masterVolume: 0.6,
  settings: {
    shakeIntensity: 1.0,
    showFps: false,
  },
};

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

class MetaProgress {
  constructor() {
    this.state = deepClone(DEFAULT_STATE);
    this.load();
  }

  load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Lazy backfill: any new field added to DEFAULT_STATE in a future
      // version is filled in here so an old save still works.
      this.state = { ...deepClone(DEFAULT_STATE), ...parsed };
      // Re-merge nested objects so partial settings don't drop new keys.
      this.state.settings = { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) };
    } catch (e) {
      console.warn('[MetaProgress] load failed; starting fresh', e);
      this.state = deepClone(DEFAULT_STATE);
    }
  }

  save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[MetaProgress] save failed', e);
    }
  }

  resetAll() {
    this.state = deepClone(DEFAULT_STATE);
    this.save();
  }

  recordRun({ won, nightReached, kills, scrapEarned }) {
    this.state.totalRuns += 1;
    if (won) this.state.totalWins += 1;
    if (nightReached > this.state.bestNight) this.state.bestNight = nightReached;
    this.state.totalKills += kills | 0;
    this.state.scrap += scrapEarned | 0;
    this.state.leaderboard.push({
      nights: nightReached, kills: kills | 0, won: !!won,
      date: new Date().toISOString().slice(0, 10),
    });
    // Keep top 10 by nights.
    this.state.leaderboard.sort((a, b) => b.nights - a.nights || b.kills - a.kills);
    this.state.leaderboard.length = Math.min(10, this.state.leaderboard.length);
    this.save();
  }

  unlockWeapon(id) {
    if (!this.state.unlockedWeapons.includes(id)) {
      this.state.unlockedWeapons.push(id);
      this.save();
      return true;
    }
    return false;
  }

  unlockStarter(id) {
    if (!this.state.unlockedStarters.includes(id)) {
      this.state.unlockedStarters.push(id);
      this.save();
      return true;
    }
    return false;
  }

  addScrap(n) { this.state.scrap += n | 0; this.save(); }
  spendScrap(n) {
    if (this.state.scrap < n) return false;
    this.state.scrap -= n;
    this.save();
    return true;
  }

  setMasterVolume(v) {
    this.state.masterVolume = Math.max(0, Math.min(1, v));
    this.save();
  }
}

export const meta = new MetaProgress();
