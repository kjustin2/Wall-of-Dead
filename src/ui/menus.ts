import type { Ctx } from "../game/ctx";
import type { Quality } from "../render/stage";
import type { Stats } from "../game/ctx";
import { DIFFICULTY, type DifficultyId } from "../config";
import { BINDABLE, GAMEPAD_REF } from "../core/input";
import type { Density } from "../minigames/scavenge";
import type { SupplyTheme } from "../game/acts";
import type { RunMods } from "../game/run";

export interface Settings {
  volume: number;
  music: number;
  muted: boolean;
  quality: Quality;
  /** Resolution scale: render at this fraction of native, then upscale (0.5–1.25). */
  renderScale: number;
  /** Borderless fullscreen via the Fullscreen API. */
  fullscreen: boolean;
  /** Brightness / gamma — scales the renderer's ACES exposure (0.6–1.5). */
  brightness: number;
  /** Show a live FPS readout in the corner. */
  showFps: boolean;
  shake: number;
  floaters: boolean;
  reducedFx: boolean;
  colorblind: boolean;
  bigText: boolean;
  fov: number;
  difficulty: DifficultyId;
  aimAssist: boolean;
  /** Key bindings: action id (canonical code) → the physical key bound to it. */
  rebinds: Record<string, string>;
  /** Set once the player picks a quality, so boot auto-detect won't override. */
  qualityTouched: boolean;
}

/** Which group of settings the panel is currently showing. */
type SettingsTab = "display" | "audio" | "game" | "access" | "controls";

const KEY = "wod-settings";

function prettyKey(code: string): string {
  return code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace("Space", "SPACE")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓");
}

function defaultSettings(): Settings {
  return {
    volume: 0.7,
    music: 0.5,
    muted: false,
    quality: "high",
    renderScale: 1,
    fullscreen: false,
    brightness: 1,
    showFps: false,
    shake: 1,
    floaters: true,
    reducedFx: false,
    colorblind: false,
    bigText: false,
    fov: 52,
    difficulty: "normal",
    aimAssist: false,
    rebinds: {},
    qualityTouched: false,
  };
}

function loadSettings(): Settings {
  const def = defaultSettings();
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

const SUPPLY_CHOICE: Record<SupplyTheme, { intro: string; opts: { d: Density; label: string; detail: string }[] }> = {
  outer: {
    intro: "Wrecks, service roads, and refinery lots still have usable supplies. Pick how deep into the road clutter you push.",
    opts: [
      { d: "high", label: "Crowded wrecks", detail: "Best haul. Tight lanes, more crates, more dead." },
      { d: "med", label: "Picked-over blocks", detail: "A steady haul through broken street cover." },
      { d: "low", label: "Quiet shoulder", detail: "Lean pickings on open road margins." },
    ],
  },
  flood: {
    intro: "The flooded blocks hide caches under black water and broken pumps. Pick how much risk you take in the low ground.",
    opts: [
      { d: "high", label: "Sunken district", detail: "Best haul. Water, cover, and patrols everywhere." },
      { d: "med", label: "Pump-yard blocks", detail: "A measured route through wet machinery." },
      { d: "low", label: "High-ground edge", detail: "Fewer supplies, clearer exits, less water." },
    ],
  },
  haven: {
    intro: "Haven's outer checkpoint is stocked, lit, and watched. Pick which part of the perimeter you raid.",
    opts: [
      { d: "high", label: "Screening queue", detail: "Best haul. Floodlights and bodies packed close." },
      { d: "med", label: "Service alleys", detail: "A controlled route past checkpoints and storage." },
      { d: "low", label: "Perimeter road", detail: "Sparse supplies outside the main security line." },
    ],
  },
};

/** Loot-vs-danger weighting per district, drawn as 3-pip gauges on the supply
 * cards so the risk/reward tradeoff reads at a glance (mirrors DENSITY in
 * scavenge.ts: crowded = richest haul AND most guards). */
const SUPPLY_GAUGE: Record<Density, { loot: number; threat: number; icon: string; crates: number; caches: number }> = {
  // crates/caches mirror DENSITY in scavenge.ts so the card states the real haul.
  high: { loot: 3, threat: 3, icon: "🏚", crates: 12, caches: 4 },
  med: { loot: 2, threat: 2, icon: "🧱", crates: 8, caches: 2 },
  low: { loot: 1, threat: 1, icon: "🌫", crates: 5, caches: 1 },
};

/** A labelled 3-pip meter (LOOT / THREAT) for a supply card. */
function gauge(kind: "loot" | "threat", n: number): string {
  let pips = "";
  for (let i = 0; i < 3; i++) pips += `<i class="pip${i < n ? ` pip--on pip--${kind}` : ""}"></i>`;
  return `<span class="gauge"><span class="gauge-k">${kind === "loot" ? "LOOT" : "THREAT"}</span><span class="pips">${pips}</span></span>`;
}

/** An optional consequence chip on a dilemma option (RISK / SAFE / +AMMO …). */
type ChoiceTone = "risk" | "safe" | "gain";

/** All full-screen DOM overlays. Each show* method paints #overlay and wires
 * its buttons to the callbacks main.ts passes in. */
export class Menus {
  private root: HTMLElement;
  settings: Settings;

  constructor(private ctx: Ctx) {
    this.root = document.getElementById("overlay") as HTMLElement;
    this.settings = loadSettings();
    // Keep the setting + checkbox in sync when fullscreen changes by any route
    // (the toggle, the OS, or pressing Esc to leave). requestFullscreen itself
    // needs a user gesture, so it's only ever called from the checkbox handler.
    document.addEventListener("fullscreenchange", () => {
      const on = !!document.fullscreenElement;
      if (on !== this.settings.fullscreen) {
        this.settings.fullscreen = on;
        saveSettings(this.settings);
      }
      const cb = this.root.querySelector(".set-fullscreen") as HTMLInputElement | null;
      if (cb) cb.checked = on;
    });
  }

  applySettings(): void {
    const s = this.settings;
    this.ctx.sfx.setVolume(s.volume);
    this.ctx.sfx.setMuted(s.muted);
    this.ctx.music.setVolume(s.muted ? 0 : s.music);
    this.ctx.stage.applyQuality(s.quality);
    this.ctx.stage.setRenderScale(s.renderScale);
    this.ctx.stage.setExposure(s.brightness);
    this.ctx.cam.shakeScale = s.shake;
    this.ctx.floaters.enabled = s.floaters;
    this.ctx.stage.setReduced(s.reducedFx);
    this.ctx.world.reducedFx = s.reducedFx;
    this.ctx.cam.setBaseFov(s.fov);
    this.ctx.tuning = DIFFICULTY[s.difficulty] ?? DIFFICULTY.normal;
    this.ctx.player.aimAssist = s.aimAssist;
    this.ctx.input.setBinds(BINDABLE.map((b) => b.id), s.rebinds ?? {});
    document.body.classList.toggle("cb", s.colorblind);
    document.body.classList.toggle("bigtext", s.bigText);
    document.body.classList.toggle("reduced", s.reducedFx);
  }

  /** The settings group last viewed — preserved across the rebind repaint. */
  private settingsTab: SettingsTab = "display";

  /** Enter/leave borderless fullscreen. Must be called from a user gesture (the
   * checkbox change), or the browser rejects the request. */
  private requestFullscreen(want: boolean): void {
    try {
      if (want && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.();
      } else if (!want && document.fullscreenElement) {
        void document.exitFullscreen?.();
      }
    } catch {
      /* unsupported or blocked — leave the setting, do nothing */
    }
  }

  /** An armed key-rebind capture listener, torn down on any repaint/close so it
   * can't leak and hijack a later keypress. */
  private rebindCapture: ((e: KeyboardEvent) => void) | null = null;
  private cancelRebindCapture(): void {
    if (this.rebindCapture) {
      window.removeEventListener("keydown", this.rebindCapture, true);
      this.rebindCapture = null;
    }
  }

  /** Bind `action` to physical key `phys`; a default binding stays absent from
   * the map so an untouched config serializes as `{}`. */
  private setBind(s: Settings, action: string, phys: string): void {
    if (phys === action) delete s.rebinds[action];
    else s.rebinds[action] = phys;
  }

  clear(): void {
    this.cancelRebindCapture();
    this.root.innerHTML = "";
    this.root.classList.remove("overlay--on");
  }

  private paint(html: string): void {
    this.cancelRebindCapture();
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
    let finished = false;
    const finish = () => {
      if (finished) return; // onDone() is a scene transition — never run it twice
      finished = true;
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
      const text = lines[i];
      lineEl.textContent = text;
      lineEl.classList.remove("story-line--show");
      void lineEl.offsetWidth;
      lineEl.classList.add("story-line--show");
      i++;
      // Hold each line long enough to actually read it — a relaxed cinematic pace
      // scaled to the line's length, with a generous floor and a sane cap. Click
      // or any key still advances early for anyone who reads faster.
      const words = text.trim().split(/\s+/).length;
      const hold = Math.min(9000, Math.max(5200, words * 440 + 1400));
      timers.push(window.setTimeout(show, hold));
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

  /** Brief boot screen while the first music track buffers + the FPS probe runs. */
  showLoading(): void {
    this.paint(`
      <div class="screen screen--title">
        <h1 class="title">WALL <span>OF</span> DEAD</h1>
        <p class="subtitle loading-dots">Loading…</p>
      </div>`);
  }

  showTitle(onStart: () => void, onSettings: () => void, onContinue?: () => void, onChallenges?: () => void): void {
    const cont = onContinue ? `<button class="mbtn mbtn--primary act-continue">CONTINUE RUN</button>` : "";
    const chal = onChallenges ? `<button class="mbtn act-challenges">CHALLENGES</button>` : "";
    this.paint(`
      <div class="screen screen--title">
        <h1 class="title">WALL <span>OF</span> DEAD</h1>
        <p class="subtitle">Hold the barrier until dawn.</p>
        <div class="menu">
          ${cont}
          <button class="mbtn ${onContinue ? "" : "mbtn--primary"} act-start">${onContinue ? "NEW RUN" : "BEGIN"}</button>
          <button class="mbtn act-help">TUTORIAL</button>
          ${chal}
          <button class="mbtn act-settings">SETTINGS</button>
        </div>
        <p class="controls">A / D move &nbsp;·&nbsp; MOUSE aim &nbsp;·&nbsp; CLICK fire &nbsp;·&nbsp; R reload &nbsp;·&nbsp; E repair/revive &nbsp;·&nbsp; SPACE shove &nbsp;·&nbsp; F frag &nbsp;·&nbsp; C order allies &nbsp;·&nbsp; 🎮 gamepad ready</p>
      </div>`);
    this.btn(".act-start", onStart);
    if (onContinue) this.btn(".act-continue", onContinue);
    if (onChallenges) this.btn(".act-challenges", onChallenges);
    this.btn(".act-help", () => this.showHelp(() => this.showTitle(onStart, onSettings, onContinue, onChallenges)));
    this.btn(".act-settings", onSettings);
  }

  /** Opt-in challenge modifiers, chosen before a run. Toggling updates a local
   *  copy; START launches with them, BACK returns to the title. */
  showModifiers(current: RunMods, onStart: (m: RunMods) => void, onBack: () => void): void {
    const sel: RunMods = { ...current };
    const defs: { key: keyof RunMods; name: string; desc: string }[] = [
      { key: "ironWall", name: "IRON WALL", desc: "No repairs — the barricade you start each night with is all you get." },
      { key: "stormFront", name: "STORM FRONT", desc: "Supply runs are shorter and far busier — grab what you can and go." },
      { key: "packTactics", name: "PACK TACTICS", desc: "Supply-run guards see farther and give chase harder." },
    ];
    const render = () => {
      const rows = defs
        .map(
          (d) => `
        <button class="mod-row ${sel[d.key] ? "mod-row--on" : ""}" data-k="${d.key}">
          <span class="mod-check">${sel[d.key] ? "☑" : "☐"}</span>
          <span class="mod-text"><b>${d.name}</b><span>${d.desc}</span></span>
        </button>`
        )
        .join("");
      this.paint(`
        <div class="screen screen--help">
          <h2 class="panel-title">CHALLENGE MODIFIERS</h2>
          <p class="subtitle">Optional. Stack any, or none — they add bite for the texture, not a score. Saved for next time.</p>
          <div class="mod-list">${rows}</div>
          <div class="menu">
            <button class="mbtn mbtn--primary act-modstart">START RUN ▶</button>
            <button class="mbtn act-modback">BACK</button>
          </div>
        </div>`);
      this.root.querySelectorAll(".mod-row").forEach((el) =>
        el.addEventListener("click", () => {
          const k = (el as HTMLElement).dataset.k as keyof RunMods;
          sel[k] = !sel[k];
          this.ctx.events.emit("SFX", { id: "ui_click" });
          render();
        })
      );
      this.btn(".act-modstart", () => onStart(sel));
      this.btn(".act-modback", onBack);
    };
    render();
  }

  /** How-to-play + controls reference, reachable from the title and pause. */
  showHelp(onBack: () => void, backLabel = "BACK"): void {
    this.paint(`
      <div class="screen screen--help">
        <h2 class="panel-title">HOW TO PLAY</h2>
        <p class="subtitle">Hold the wall each night until dawn. By day, sneak the dark for supplies and push toward Haven — the safe zone.</p>
        <div class="help-cols">
          <div class="help-col">
            <h3>NIGHT — DEFEND</h3>
            <ul>
              <li><b>A / D</b> — move along the wall</li>
              <li><b>Mouse</b> — aim (the red ring shows where shots land)</li>
              <li><b>Click</b> — fire (hold for automatics)</li>
              <li><b>R</b> — reload (nail the green zone for a fast reload)</li>
              <li><b>1–5 / wheel</b> — switch weapons</li>
              <li><b>Space</b> — shove zombies off (finishes the wounded)</li>
              <li><b>T</b> — drop a spike trap in front of the wall</li>
              <li><b>E</b> — repair a breach / revive a downed ally</li>
              <li><b>F (hold)</b> — lob a frag when Adrenaline is full</li>
            </ul>
          </div>
          <div class="help-col">
            <h3>DAY — SUPPLY RUN</h3>
            <ul>
              <li><b>WASD</b> — move (you sneak; the map is dark)</li>
              <li><b>Shift</b> — sprint (short — and <b>loud</b>)</li>
              <li>Tuck into a <b>dumpster</b> to break a chase</li>
              <li>Grab <b>supplies</b> &amp; <b>repair kits</b>, then hit the <b>exit</b></li>
              <li>Stay out of the sight cones — <b>get caught and the run ends</b></li>
            </ul>
            <h3>TIPS</h3>
            <ul>
              <li>Precise center hits are <b>headshots</b>.</li>
              <li>Keep the meter <b>hot</b> — faster, harder, brighter.</li>
            </ul>
          </div>
        </div>
        <div class="menu"><button class="mbtn mbtn--primary act-back">${backLabel}</button></div>
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

  /** Build the rows for one settings tab. */
  private settingsPanel(tab: SettingsTab): string {
    const s = this.settings;
    const check = (cls: string, on: boolean) => `<input type="checkbox" class="${cls}" ${on ? "checked" : ""}>`;
    const range = (cls: string, min: number, max: number, step: number, v: number) =>
      `<input type="range" min="${min}" max="${max}" step="${step}" value="${v}" class="${cls}">`;
    const row = (label: string, control: string, note = "") =>
      `<div class="settings-row"><label>${label}${note ? `<span class="set-note">${note}</span>` : ""}</label>${control}</div>`;
    if (tab === "display") {
      const rscale = `
        <select class="set-rscale">
          <option value="0.5" ${s.renderScale === 0.5 ? "selected" : ""}>50% — Performance</option>
          <option value="0.67" ${s.renderScale === 0.67 ? "selected" : ""}>67%</option>
          <option value="0.75" ${s.renderScale === 0.75 ? "selected" : ""}>75% — Balanced</option>
          <option value="1" ${s.renderScale === 1 ? "selected" : ""}>100% — Native</option>
          <option value="1.25" ${s.renderScale === 1.25 ? "selected" : ""}>125% — Ultra</option>
        </select>`;
      const quality = `
        <select class="set-quality">
          <option value="low" ${s.quality === "low" ? "selected" : ""}>Low</option>
          <option value="medium" ${s.quality === "medium" ? "selected" : ""}>Medium</option>
          <option value="high" ${s.quality === "high" ? "selected" : ""}>High</option>
        </select>`;
      return `<div class="settings-grid">
        ${row("Fullscreen", check("set-fullscreen", s.fullscreen))}
        ${row("Resolution", rscale, "render scale")}
        ${row("Graphics quality", quality, "post-processing & shadows")}
        ${row("Brightness", range("set-bright", 0.6, 1.5, 0.05, s.brightness))}
        ${row("FPS counter", check("set-fps", s.showFps))}
        ${row("Field of view", range("set-fov", 44, 66, 1, s.fov))}
        ${row("Screen shake", range("set-shake", 0, 1.5, 0.1, s.shake))}
      </div>`;
    }
    if (tab === "audio") {
      return `<div class="settings-grid">
        ${row("SFX volume", range("set-vol", 0, 1, 0.05, s.volume))}
        ${row("Music volume", range("set-music", 0, 1, 0.05, s.music))}
        ${row("Mute all", check("set-mute", s.muted))}
      </div>`;
    }
    if (tab === "game") {
      const diff = `
        <select class="set-diff">
          <option value="story" ${s.difficulty === "story" ? "selected" : ""}>Story (gentler)</option>
          <option value="normal" ${s.difficulty === "normal" ? "selected" : ""}>Normal</option>
          <option value="nightmare" ${s.difficulty === "nightmare" ? "selected" : ""}>Nightmare</option>
        </select>`;
      return `<div class="settings-grid">
        ${row("Difficulty", diff)}
        ${row("Aim assist", check("set-aim", s.aimAssist))}
        ${row("Damage numbers", check("set-floaters", s.floaters))}
      </div>`;
    }
    if (tab === "access") {
      return `<div class="settings-grid">
        ${row("Reduced flashing", check("set-reduced", s.reducedFx))}
        ${row("Colorblind palette", check("set-cb", s.colorblind))}
        ${row("Large text", check("set-big", s.bigText))}
      </div>`;
    }
    // controls
    return `<div class="settings-grid">
      <div class="rebind-head">KEYBOARD — click a key to rebind</div>
      ${BINDABLE.map((b) => {
        const phys = s.rebinds[b.id] ?? b.id;
        return `<div class="settings-row"><label>${b.label}</label><button class="mbtn mbtn--sm act-rebind" data-code="${b.id}">${prettyKey(phys)}</button></div>`;
      }).join("")}
      <div class="rebind-head">GAMEPAD (reference)</div>
      ${GAMEPAD_REF.map((g) => `<div class="settings-row settings-row--ref"><label>${g.label}</label><span class="pad-key">${g.pad}</span></div>`).join("")}
    </div>`;
  }

  showSettings(onBack: () => void): void {
    const s = this.settings;
    const tab = this.settingsTab;
    const TABS: { id: SettingsTab; label: string }[] = [
      { id: "display", label: "DISPLAY" },
      { id: "audio", label: "AUDIO" },
      { id: "game", label: "GAMEPLAY" },
      { id: "access", label: "ACCESSIBILITY" },
      { id: "controls", label: "CONTROLS" },
    ];
    const tabBar = TABS.map(
      (t) => `<button class="settings-tab ${t.id === tab ? "settings-tab--active" : ""}" data-tab="${t.id}">${t.label}</button>`
    ).join("");
    this.paint(`
      <div class="screen screen--settings">
        <h2 class="panel-title">SETTINGS</h2>
        <div class="settings-tabs">${tabBar}</div>
        <div class="settings-panel">${this.settingsPanel(tab)}</div>
        <div class="menu menu--row">
          <button class="mbtn act-defaults">RESTORE DEFAULTS</button>
          <button class="mbtn mbtn--primary act-back">BACK</button>
        </div>
      </div>`);

    // Tab switching keeps the rest of the panel state (the field persists).
    this.root.querySelectorAll(".settings-tab").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-tab") as SettingsTab | null;
        if (!id || id === this.settingsTab) return;
        this.settingsTab = id;
        this.ctx.events.emit("SFX", { id: "ui_click" });
        this.showSettings(onBack);
      });
    });

    this.btn(".act-defaults", () => {
      this.settings = { ...defaultSettings() };
      this.applySettings();
      this.requestFullscreen(false); // a click is a valid gesture to drop fullscreen
      saveSettings(this.settings);
      this.showSettings(onBack);
    });

    // Wire whichever controls exist on the active tab (null-safe — only the
    // current tab's elements are in the DOM).
    const wire = (sel: string, evt: "input" | "change", set: (el: HTMLInputElement) => void) => {
      const el = this.root.querySelector(sel) as HTMLInputElement | null;
      if (!el) return;
      el.addEventListener(evt, () => {
        set(el);
        this.applySettings();
        saveSettings(s);
      });
    };
    const wireSelect = (sel: string, set: (el: HTMLSelectElement) => void) => {
      const el = this.root.querySelector(sel) as HTMLSelectElement | null;
      if (!el) return;
      el.addEventListener("change", () => {
        set(el);
        this.applySettings();
        saveSettings(s);
      });
    };

    // Display
    const fs = this.root.querySelector(".set-fullscreen") as HTMLInputElement | null;
    if (fs)
      fs.addEventListener("change", () => {
        s.fullscreen = fs.checked;
        this.requestFullscreen(fs.checked); // the change event is the user gesture
        saveSettings(s);
      });
    wireSelect(".set-rscale", (el) => (s.renderScale = parseFloat(el.value)));
    const qual = this.root.querySelector(".set-quality") as HTMLSelectElement | null;
    if (qual)
      qual.addEventListener("change", () => {
        s.quality = qual.value as Quality;
        s.qualityTouched = true; // an explicit choice — disable boot auto-detect
        this.applySettings();
        saveSettings(s);
      });
    wire(".set-bright", "input", (el) => (s.brightness = parseFloat(el.value)));
    wire(".set-fps", "change", (el) => (s.showFps = el.checked));
    wire(".set-fov", "input", (el) => (s.fov = parseFloat(el.value)));
    wire(".set-shake", "input", (el) => (s.shake = parseFloat(el.value)));
    // Audio
    wire(".set-vol", "input", (el) => (s.volume = parseFloat(el.value)));
    wire(".set-music", "input", (el) => (s.music = parseFloat(el.value)));
    wire(".set-mute", "change", (el) => (s.muted = el.checked));
    // Gameplay
    wireSelect(".set-diff", (el) => (s.difficulty = el.value as DifficultyId));
    wire(".set-aim", "change", (el) => (s.aimAssist = el.checked));
    wire(".set-floaters", "change", (el) => (s.floaters = el.checked));
    // Accessibility
    wire(".set-reduced", "change", (el) => (s.reducedFx = el.checked));
    wire(".set-cb", "change", (el) => (s.colorblind = el.checked));
    wire(".set-big", "change", (el) => (s.bigText = el.checked));

    // Re-bind: click → capture the next key as THIS action's key (a real
    // replacement). If that key already runs another action, the two swap so no
    // action is ever left unbound.
    const physOf = (id: string) => s.rebinds[id] ?? id;
    this.root.querySelectorAll(".act-rebind").forEach((el) => {
      const action = el.getAttribute("data-code");
      if (!action) return;
      el.addEventListener("click", () => {
        this.cancelRebindCapture(); // only one armed at a time
        el.textContent = "press a key…";
        const onKey = (e: KeyboardEvent) => {
          e.preventDefault();
          this.cancelRebindCapture();
          if (e.code !== "Escape") {
            const want = e.code;
            const prev = physOf(action);
            // If another action already uses `want`, give it our old key (swap).
            const clash = BINDABLE.find((b) => b.id !== action && physOf(b.id) === want);
            if (clash) this.setBind(s, clash.id, prev);
            this.setBind(s, action, want);
          }
          this.applySettings();
          saveSettings(s);
          this.showSettings(onBack);
        };
        this.rebindCapture = onKey;
        window.addEventListener("keydown", onKey, true);
      });
    });
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
    // One-time onboarding nudge the first time you open the loadout.
    let firstTime = false;
    try {
      firstTime = !localStorage.getItem("wod-loadout-seen");
      if (firstTime) localStorage.setItem("wod-loadout-seen", "1");
    } catch {
      /* ignore */
    }
    const nudge = firstTime
      ? `<div class="lo-nudge"><strong>💡 SHARED ARMORY</strong>• Give a spare to an ally — they use it, you can't.<br>• An unarmed ally falls back to a weak sidearm.<br>• Your 🔒 sidearm always stays with you.</div>`
      : "";
    const rows = run.weapons
      .map((w, i) => {
        const locked = !!w.def.sidearm; // the player's holdout — never handed off
        const cur = locked ? "You · holdout" : run.weaponOwner[i] ?? "You";
        const cls = locked ? "lo-row lo-row--locked" : "lo-row";
        const arrow = locked ? "🔒" : "▸";
        const ammo = w.def.sidearm ? "∞" : `${w.ammo} / ${w.reserve}`;
        return `<div class="${cls}" data-i="${i}"><span class="lo-name">${w.def.name}</span><span class="lo-arrow">${arrow}</span><span class="lo-owner">${cur}</span><span class="lo-ammo">${ammo}</span></div>`;
      })
      .join("");
    this.paint(`
      <div class="screen screen--loadout">
        <h2 class="panel-title">LOADOUT</h2>
        <p class="subtitle">Click a weapon to hand it to an ally — or take it back.</p>
        ${nudge}
        <div class="loadout">${rows || '<div class="lo-row">No weapons</div>'}</div>
        <div class="menu"><button class="mbtn mbtn--primary act-back">DONE</button></div>
      </div>`);
    this.root.querySelectorAll(".lo-row").forEach((el) => {
      const attr = el.getAttribute("data-i");
      if (attr == null) return;
      const i = parseInt(attr, 10);
      const w = run.weapons[i];
      if (!w || w.def.sidearm) return; // sidearm stays with the player — not clickable
      el.addEventListener("click", () => {
        // Cycle the owner through the player + allies who are FREE (or already hold
        // this exact weapon). Skipping allies who hold another gun means passing a
        // weapon to the next owner never steals someone else's — fixes assignments
        // "resetting" as you cycle past a busy ally.
        const free = run.companions.filter((n) => {
          const held = run.allyWeaponIndex(n);
          return held < 0 || held === i;
        });
        const order: (string | null)[] = [null, ...free];
        const cur = run.weaponOwner[i] ?? null;
        const at = order.indexOf(cur);
        const next = order[((at < 0 ? 0 : at) + 1) % order.length];
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

  /** The convoy advancing along the road toward the safe zone, plus a story beat
   * for the night ahead and (optionally) a random between-nights event. */
  showRoadMap(leg: number, total: number, title: string, story: string, onContinue: () => void, eventLine?: string, labels?: string[], theme: SupplyTheme = "outer"): void {
    let nodes = "";
    for (let i = 0; i <= total; i++) {
      const pct = (i / total) * 100;
      const done = i <= leg;
      const safe = i === total;
      const label = safe ? "SAFE ZONE" : labels?.[i] ?? (i === 0 ? "START" : `LEG ${i}`);
      nodes += `<div class="road-node ${done ? "road-node--done" : ""} ${safe ? "road-node--safe" : ""}" style="left:${pct}%"><span class="road-dot"></span><span class="road-label">${label}</span></div>`;
    }
    const convoyPct = (leg / total) * 100;
    this.paint(`
      <div class="screen screen--road screen--act-${theme}">
        <h2 class="panel-title">THE ROAD TO THE SAFE ZONE</h2>
        <div class="roadmap">
          <div class="road-line"></div>
          <div class="road-line road-line--done" style="width:${convoyPct}%"></div>
          ${nodes}
          <div class="convoy" style="left:${convoyPct}%">▣</div>
        </div>
        <h3 class="road-night">${title}</h3>
        ${eventLine ? `<p class="road-event">${eventLine}</p>` : ""}
        <p class="subtitle road-story">${story}</p>
        <div class="menu"><button class="mbtn mbtn--primary act-cont">PRESS ON ▶</button></div>
      </div>`);
    this.btn(".act-cont", onContinue);
  }

  /** Before a supply run: choose how populated a district to scavenge — richer
   * loot means more of the dead between you and it. */
  showSupplyChoice(onPick: (d: Density) => void, actName = "THE ROAD", theme: SupplyTheme = "outer"): void {
    let opts: { d: Density; label: string; detail: string }[] = [
      { d: "high", label: "Crowded district", detail: "Best haul — more crates & ammo caches. Crawling with the dead." },
      { d: "med", label: "Picked-over blocks", detail: "A steady haul for steady risk." },
      { d: "low", label: "Quiet outskirts", detail: "Lean pickings — but far fewer of them about." },
    ];
    const themed = SUPPLY_CHOICE[theme];
    opts = themed.opts;
    this.paint(`
      <div class="screen screen--report screen--supply screen--decision screen--act-${theme}">
        <div class="decision-tag">◆ CHOOSE YOUR APPROACH · RISK vs. REWARD</div>
        <h2 class="panel-title">WHERE TO SCAVENGE?</h2>
        <p class="subtitle">${actName}: ${themed.intro}</p>
        <div class="menu menu--cards">
          ${opts
            .map((o, i) => {
              const g = SUPPLY_GAUGE[o.d];
              const flag = i === 1 ? `<span class="choice-flag">BALANCED</span>` : "";
              return `<button class="mbtn choice-card ${i === 1 ? "mbtn--primary" : ""} act-supply act-supply-${i}">
                ${flag}
                <span class="choice-head"><span class="choice-icon">${g.icon}</span><b>${o.label}</b><span class="choice-haul">≈${g.crates} crates · ${g.caches} cache${g.caches > 1 ? "s" : ""}</span></span>
                <span class="gauges">${gauge("loot", g.loot)}${gauge("threat", g.threat)}</span>
                <span class="choice-detail">${o.detail}</span>
              </button>`;
            })
            .join("")}
        </div>
      </div>`);
    opts.forEach((o, i) => this.btn(`.act-supply-${i}`, () => onPick(o.d)));
  }

  /** A dawn dilemma: one choice with a consequence. Each option runs its effect
   * then proceeds. */
  showDilemma(
    title: string,
    sub: string,
    options: { label: string; detail: string; onPick: () => void; tag?: string; tone?: ChoiceTone }[],
    after: () => void
  ): void {
    this.paint(`
      <div class="screen screen--report screen--decision">
        <div class="decision-tag">◆ A CHOICE · ONE CONSEQUENCE</div>
        <h2 class="panel-title">${title}</h2>
        <p class="subtitle">${sub}</p>
        <div class="menu menu--cards">
          ${options
            .map(
              (o, i) =>
                `<button class="mbtn choice-card ${i === 0 ? "mbtn--primary" : ""} act-choice act-choice-${i}">
                  ${o.tag ? `<span class="choice-flag choice-flag--${o.tone ?? "safe"}">${o.tag}</span>` : ""}
                  <span class="choice-head"><b>${o.label}</b></span>
                  <span class="choice-detail">${o.detail}</span>
                </button>`
            )
            .join("")}
        </div>
      </div>`);
    options.forEach((o, i) =>
      this.btn(`.act-choice-${i}`, () => {
        o.onPick();
        after();
      })
    );
  }

  showVictory(stats: Stats, onReplay: () => void, onTitle: () => void, extra: string[] = []): void {
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
          ${extra.map((l) => `<li>${l}</li>`).join("")}
        </ul>
        <div class="menu">
          <button class="mbtn mbtn--primary act-replay">PLAY AGAIN</button>
          <button class="mbtn act-title">MAIN MENU</button>
        </div>
      </div>`);
    this.btn(".act-replay", onReplay);
    this.btn(".act-title", onTitle);
  }

  showDeath(reason: string, stats: Stats, onRetry: () => void, onTitle: () => void, extra: string[] = []): void {
    this.paint(`
      <div class="screen screen--death">
        <h1 class="title title--dead">OVERRUN</h1>
        <p class="subtitle">${reason}</p>
        <ul class="report">
          <li>Kills — ${stats.kills}</li>
          <li>Survived — ${Math.round(stats.time)}s</li>
          ${extra.map((l) => `<li>${l}</li>`).join("")}
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
