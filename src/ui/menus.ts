import type { Ctx } from "../game/ctx";
import type { Quality } from "../render/stage";
import type { Stats } from "../game/ctx";

export interface Settings {
  volume: number;
  music: number;
  muted: boolean;
  quality: Quality;
  shake: number;
}

const KEY = "wod-settings";

function loadSettings(): Settings {
  const def: Settings = { volume: 0.7, music: 0.5, muted: false, quality: "high", shake: 1 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* localStorage may be unavailable */
  }
  return def;
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** All full-screen DOM overlays. Each show* method paints #overlay and wires
 * its buttons to the callbacks main.ts passes in. */
export class Menus {
  private root: HTMLElement;
  settings: Settings;

  constructor(private ctx: Ctx) {
    this.root = document.getElementById("overlay") as HTMLElement;
    this.settings = loadSettings();
  }

  applySettings(): void {
    const s = this.settings;
    this.ctx.sfx.setVolume(s.volume);
    this.ctx.sfx.setMuted(s.muted);
    this.ctx.music.setVolume(s.muted ? 0 : s.music);
    this.ctx.stage.applyQuality(s.quality);
    this.ctx.cam.shakeScale = s.shake;
  }

  clear(): void {
    this.root.innerHTML = "";
    this.root.classList.remove("overlay--on");
  }

  private paint(html: string): void {
    this.root.innerHTML = html;
    this.root.classList.add("overlay--on");
  }

  private btn(sel: string, fn: () => void): void {
    const b = this.root.querySelector(sel) as HTMLElement | null;
    if (b) {
      b.addEventListener("mouseenter", () => this.ctx.events.emit("SFX", { id: "ui_hover" }));
      b.addEventListener("click", () => {
        this.ctx.events.emit("SFX", { id: "ui_click" });
        fn();
      });
    }
  }

  /** Sequential story lines over the cutscene camera; click advances, Esc skips. */
  storyIntro(lines: string[], onDone: () => void): void {
    this.paint(`
      <div class="screen screen--story">
        <div class="story-line"></div>
        <div class="story-skip">click to continue · esc to skip</div>
      </div>`);
    const lineEl = this.root.querySelector(".story-line") as HTMLElement;
    let i = 0;
    const timers: number[] = [];
    const clearTimers = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
    };
    const finish = () => {
      clearTimers();
      this.root.removeEventListener("click", advance);
      window.removeEventListener("keydown", onKey);
      onDone();
    };
    const show = () => {
      if (i >= lines.length) {
        finish();
        return;
      }
      lineEl.textContent = lines[i];
      lineEl.classList.remove("story-line--show");
      void lineEl.offsetWidth;
      lineEl.classList.add("story-line--show");
      i++;
      timers.push(window.setTimeout(show, 4200));
    };
    const advance = () => {
      clearTimers();
      show();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") finish();
      else advance();
    };
    this.root.addEventListener("click", advance);
    window.addEventListener("keydown", onKey);
    show();
  }

  showTitle(onStart: () => void, onSettings: () => void): void {
    this.paint(`
      <div class="screen screen--title">
        <h1 class="title">WALL <span>OF</span> DEAD</h1>
        <p class="subtitle">Hold the barrier until dawn.</p>
        <div class="menu">
          <button class="mbtn mbtn--primary act-start">BEGIN</button>
          <button class="mbtn act-settings">SETTINGS</button>
        </div>
        <p class="controls">A / D move &nbsp;·&nbsp; MOUSE aim &nbsp;·&nbsp; CLICK fire &nbsp;·&nbsp; R reload &nbsp;·&nbsp; 1–3 weapons &nbsp;·&nbsp; SPACE shove &nbsp;·&nbsp; F frag</p>
      </div>`);
    this.btn(".act-start", onStart);
    this.btn(".act-settings", onSettings);
  }

  showPause(onResume: () => void, onRestart: () => void, onSettings: () => void, onTitle: () => void): void {
    this.paint(`
      <div class="screen screen--pause">
        <h2 class="panel-title">PAUSED</h2>
        <div class="menu">
          <button class="mbtn mbtn--primary act-resume">RESUME</button>
          <button class="mbtn act-restart">RESTART RUN</button>
          <button class="mbtn act-settings">SETTINGS</button>
          <button class="mbtn act-title">MAIN MENU</button>
        </div>
      </div>`);
    this.btn(".act-resume", onResume);
    this.btn(".act-restart", onRestart);
    this.btn(".act-settings", onSettings);
    this.btn(".act-title", onTitle);
  }

  showSettings(onBack: () => void): void {
    const s = this.settings;
    this.paint(`
      <div class="screen screen--settings">
        <h2 class="panel-title">SETTINGS</h2>
        <div class="settings-row"><label>SFX volume</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" class="set-vol"></div>
        <div class="settings-row"><label>Music volume</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" class="set-music"></div>
        <div class="settings-row"><label>Mute</label><input type="checkbox" class="set-mute" ${s.muted ? "checked" : ""}></div>
        <div class="settings-row"><label>Quality</label>
          <select class="set-quality">
            <option value="low" ${s.quality === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${s.quality === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${s.quality === "high" ? "selected" : ""}>High</option>
          </select>
        </div>
        <div class="settings-row"><label>Screen shake</label><input type="range" min="0" max="1.5" step="0.1" value="${s.shake}" class="set-shake"></div>
        <div class="menu"><button class="mbtn mbtn--primary act-back">BACK</button></div>
      </div>`);
    const vol = this.root.querySelector(".set-vol") as HTMLInputElement;
    const music = this.root.querySelector(".set-music") as HTMLInputElement;
    const mute = this.root.querySelector(".set-mute") as HTMLInputElement;
    const qual = this.root.querySelector(".set-quality") as HTMLSelectElement;
    const shake = this.root.querySelector(".set-shake") as HTMLInputElement;
    vol.addEventListener("input", () => {
      s.volume = parseFloat(vol.value);
      this.applySettings();
      saveSettings(s);
    });
    music.addEventListener("input", () => {
      s.music = parseFloat(music.value);
      this.applySettings();
      saveSettings(s);
    });
    mute.addEventListener("change", () => {
      s.muted = mute.checked;
      this.applySettings();
      saveSettings(s);
    });
    qual.addEventListener("change", () => {
      s.quality = qual.value as Quality;
      this.applySettings();
      saveSettings(s);
    });
    shake.addEventListener("input", () => {
      s.shake = parseFloat(shake.value);
      this.applySettings();
      saveSettings(s);
    });
    this.btn(".act-back", onBack);
  }

  showDayReport(lines: string[], onStart: () => void): void {
    this.paint(`
      <div class="screen screen--report">
        <h2 class="panel-title">DAWN — YOU HELD</h2>
        <ul class="report">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
        <p class="subtitle">Day breaks. Scavenge the field for supplies, then push for the safe zone.</p>
        <div class="menu"><button class="mbtn mbtn--primary act-start">SUPPLY RUN ▶</button></div>
      </div>`);
    this.btn(".act-start", onStart);
  }

  showDayLoot(lines: string[], onContinue: () => void): void {
    this.paint(`
      <div class="screen screen--report">
        <h2 class="panel-title">SUPPLIES SECURED</h2>
        <ul class="report">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
        <div class="menu"><button class="mbtn mbtn--primary act-cont">CONTINUE ▶</button></div>
      </div>`);
    this.btn(".act-cont", onContinue);
  }

  showVictory(stats: Stats, onReplay: () => void, onTitle: () => void): void {
    this.paint(`
      <div class="screen screen--victory">
        <h1 class="title title--win">SAFE ZONE REACHED</h1>
        <p class="subtitle">You made it through the dark.</p>
        <ul class="report">
          <li>Kills — ${stats.kills}</li>
          <li>Headshots — ${stats.headshots}</li>
          <li>Wall integrity at dawn — ${Math.round(stats.wallHeld)}%</li>
          <li>Supplies recovered — ${stats.cratesGrabbed}</li>
          <li>Last Stands — ${stats.lastStands}</li>
        </ul>
        <div class="menu">
          <button class="mbtn mbtn--primary act-replay">PLAY AGAIN</button>
          <button class="mbtn act-title">MAIN MENU</button>
        </div>
      </div>`);
    this.btn(".act-replay", onReplay);
    this.btn(".act-title", onTitle);
  }

  showDeath(reason: string, stats: Stats, onRetry: () => void, onTitle: () => void): void {
    this.paint(`
      <div class="screen screen--death">
        <h1 class="title title--dead">OVERRUN</h1>
        <p class="subtitle">${reason}</p>
        <ul class="report">
          <li>Kills — ${stats.kills}</li>
          <li>Survived — ${Math.round(stats.time)}s</li>
        </ul>
        <div class="menu">
          <button class="mbtn mbtn--primary act-retry">TRY AGAIN</button>
          <button class="mbtn act-title">MAIN MENU</button>
        </div>
      </div>`);
    this.btn(".act-retry", onRetry);
    this.btn(".act-title", onTitle);
  }
}
