import type { Ctx } from "../game/ctx";
import type { Quality } from "../render/stage";
import type { Stats } from "../game/ctx";

export interface Settings {
  volume: number;
  music: number;
  muted: boolean;
  quality: Quality;
  shake: number;
  floaters: boolean;
  reducedFx: boolean;
  colorblind: boolean;
  bigText: boolean;
  fov: number;
}

const KEY = "wod-settings";

function loadSettings(): Settings {
  const def: Settings = {
    volume: 0.7,
    music: 0.5,
    muted: false,
    quality: "high",
    shake: 1,
    floaters: true,
    reducedFx: false,
    colorblind: false,
    bigText: false,
    fov: 52,
  };
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
    this.ctx.floaters.enabled = s.floaters;
    this.ctx.stage.setReduced(s.reducedFx);
    this.ctx.world.reducedFx = s.reducedFx;
    this.ctx.cam.setBaseFov(s.fov);
    document.body.classList.toggle("cb", s.colorblind);
    document.body.classList.toggle("bigtext", s.bigText);
    document.body.classList.toggle("reduced", s.reducedFx);
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
          <button class="mbtn act-help">HOW TO PLAY</button>
          <button class="mbtn act-settings">SETTINGS</button>
        </div>
        <p class="controls">A / D move &nbsp;·&nbsp; MOUSE aim &nbsp;·&nbsp; CLICK fire &nbsp;·&nbsp; R reload &nbsp;·&nbsp; E repair/revive &nbsp;·&nbsp; SPACE shove &nbsp;·&nbsp; F frag</p>
      </div>`);
    this.btn(".act-start", onStart);
    this.btn(".act-help", () => this.showHelp(() => this.showTitle(onStart, onSettings)));
    this.btn(".act-settings", onSettings);
  }

  /** How-to-play + controls reference, reachable from the title and pause. */
  showHelp(onBack: () => void): void {
    this.paint(`
      <div class="screen screen--help">
        <h2 class="panel-title">HOW TO PLAY</h2>
        <p class="subtitle">Hold the wall each night until dawn. By day, sneak the dark for supplies. Survive three nights of road to reach the safe zone.</p>
        <div class="help-cols">
          <div class="help-col">
            <h3>NIGHT — DEFEND</h3>
            <ul>
              <li><b>A / D</b> — move along the wall</li>
              <li><b>Mouse</b> — aim (the red ring shows where shots land)</li>
              <li><b>Click</b> — fire (hold for automatics)</li>
              <li><b>R</b> — reload &nbsp; <b>1–3</b> — switch weapons</li>
              <li><b>Space</b> — shove zombies off the wall</li>
              <li><b>E</b> — repair a breach / revive a downed ally</li>
              <li><b>F (hold)</b> — lob a frag when Adrenaline is full</li>
            </ul>
          </div>
          <div class="help-col">
            <h3>DAY — SUPPLY RUN</h3>
            <ul>
              <li><b>WASD</b> — move (you sneak; the map is dark)</li>
              <li><b>Shift</b> — sprint (short — to escape)</li>
              <li>Stay out of the <b>amber sight cones</b></li>
              <li>Grab the glowing <b>supply crates</b></li>
              <li>Get spotted &amp; caught and the run <b>ends</b></li>
            </ul>
            <h3>TIPS</h3>
            <ul>
              <li>Precise center hits are <b>headshots</b>.</li>
              <li>Keep the meter <b>hot</b> — faster, harder, brighter.</li>
            </ul>
          </div>
        </div>
        <div class="menu"><button class="mbtn mbtn--primary act-back">BACK</button></div>
      </div>`);
    this.btn(".act-back", onBack);
  }

  showPause(
    onResume: () => void,
    onRestart: () => void,
    onSettings: () => void,
    onTitle: () => void,
    onControls: () => void,
    onLoadout: () => void,
    stats?: Stats
  ): void {
    const line = stats
      ? `<p class="subtitle">Kills ${stats.kills} · Headshots ${stats.headshots} · Survived ${Math.round(stats.time)}s</p>`
      : "";
    this.paint(`
      <div class="screen screen--pause">
        <h2 class="panel-title">PAUSED</h2>
        ${line}
        <div class="menu">
          <button class="mbtn mbtn--primary act-resume">RESUME</button>
          <button class="mbtn act-loadout">LOADOUT</button>
          <button class="mbtn act-controls">CONTROLS</button>
          <button class="mbtn act-restart">RESTART RUN</button>
          <button class="mbtn act-settings">SETTINGS</button>
          <button class="mbtn act-title">MAIN MENU</button>
        </div>
      </div>`);
    this.btn(".act-resume", onResume);
    this.btn(".act-loadout", onLoadout);
    this.btn(".act-controls", onControls);
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
        <div class="settings-row"><label>Field of view</label><input type="range" min="44" max="66" step="1" value="${s.fov}" class="set-fov"></div>
        <div class="settings-row"><label>Damage numbers</label><input type="checkbox" class="set-floaters" ${s.floaters ? "checked" : ""}></div>
        <div class="settings-row"><label>Reduced flashing</label><input type="checkbox" class="set-reduced" ${s.reducedFx ? "checked" : ""}></div>
        <div class="settings-row"><label>Colorblind palette</label><input type="checkbox" class="set-cb" ${s.colorblind ? "checked" : ""}></div>
        <div class="settings-row"><label>Large text</label><input type="checkbox" class="set-big" ${s.bigText ? "checked" : ""}></div>
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
    const bind = (sel: string, set: (el: HTMLInputElement) => void) => {
      const el = this.root.querySelector(sel) as HTMLInputElement;
      el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
        set(el);
        this.applySettings();
        saveSettings(s);
      });
    };
    bind(".set-fov", (el) => (s.fov = parseFloat(el.value)));
    bind(".set-floaters", (el) => (s.floaters = el.checked));
    bind(".set-reduced", (el) => (s.reducedFx = el.checked));
    bind(".set-cb", (el) => (s.colorblind = el.checked));
    bind(".set-big", (el) => (s.bigText = el.checked));
    this.btn(".act-back", onBack);
  }

  showDayReport(lines: string[], onStart: () => void): void {
    this.paint(`
      <div class="screen screen--report">
        <h2 class="panel-title">DAWN — YOU HELD</h2>
        <ul class="report">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
        <p class="subtitle">Day breaks. Set your loadout, then scavenge the field for supplies.</p>
        <div class="menu">
          <button class="mbtn mbtn--primary act-start">SUPPLY RUN ▶</button>
          <button class="mbtn act-loadout">LOADOUT</button>
        </div>
      </div>`);
    this.btn(".act-start", onStart);
    this.btn(".act-loadout", () => this.showLoadout(() => this.showDayReport(lines, onStart)));
  }

  /** Assign weapons from the shared armory to the player or an ally. */
  showLoadout(onBack: () => void): void {
    const run = this.ctx.run;
    const rows = run.weapons
      .map((w, i) => {
        const cur = run.weaponOwner[i] ?? "You";
        return `<div class="lo-row" data-i="${i}"><span class="lo-name">${w.def.name}</span><span class="lo-arrow">▸</span><span class="lo-owner">${cur}</span><span class="lo-ammo">${w.ammo} / ${w.reserve}</span></div>`;
      })
      .join("");
    this.paint(`
      <div class="screen screen--loadout">
        <h2 class="panel-title">LOADOUT</h2>
        <p class="subtitle">Click a weapon to hand it to an ally (or take it back). An ally holding a weapon uses its ammo and falls back to melee when empty — you can't use it while they hold it.</p>
        <div class="loadout">${rows || '<div class="lo-row">No weapons</div>'}</div>
        <div class="menu"><button class="mbtn mbtn--primary act-back">DONE</button></div>
      </div>`);
    this.root.querySelectorAll(".lo-row").forEach((el) => {
      const attr = el.getAttribute("data-i");
      if (attr == null) return;
      el.addEventListener("click", () => {
        const i = parseInt(attr, 10);
        const order: (string | null)[] = [null, ...run.companions];
        const cur = run.weaponOwner[i] ?? null;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        run.assignWeapon(i, next);
        this.ctx.events.emit("SFX", { id: "ui_click" });
        this.showLoadout(onBack);
      });
    });
    this.btn(".act-back", onBack);
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
    const held = stats.wallHeld;
    const epilogue =
      held > 80
        ? "You held the wall almost untouched. The safe zone's gates open wide."
        : held > 40
          ? "Battered but unbroken, you limp into the safe zone at last."
          : "The wall is rubble behind you, but you made it through the dark.";
    this.paint(`
      <div class="screen screen--victory">
        <h1 class="title title--win">SAFE ZONE REACHED</h1>
        <p class="subtitle">${epilogue}</p>
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
