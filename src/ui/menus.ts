import type { Ctx } from "../game/ctx";
import type { Quality } from "../render/stage";
import type { Stats } from "../game/ctx";
import { DIFFICULTY, type DifficultyId } from "../config";
import { BINDABLE, GAMEPAD_REF } from "../core/input";

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
  difficulty: DifficultyId;
  aimAssist: boolean;
  /** Key bindings: action id (canonical code) → the physical key bound to it. */
  rebinds: Record<string, string>;
  /** Set once the player picks a quality, so boot auto-detect won't override. */
  qualityTouched: boolean;
}

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
    this.ctx.tuning = DIFFICULTY[s.difficulty] ?? DIFFICULTY.normal;
    this.ctx.player.aimAssist = s.aimAssist;
    this.ctx.input.setBinds(BINDABLE.map((b) => b.id), s.rebinds ?? {});
    document.body.classList.toggle("cb", s.colorblind);
    document.body.classList.toggle("bigtext", s.bigText);
    document.body.classList.toggle("reduced", s.reducedFx);
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

  /** Brief boot screen while the first music track buffers + the FPS probe runs. */
  showLoading(): void {
    this.paint(`
      <div class="screen screen--title">
        <h1 class="title">WALL <span>OF</span> DEAD</h1>
        <p class="subtitle loading-dots">Loading…</p>
      </div>`);
  }

  showTitle(onStart: () => void, onSettings: () => void, onContinue?: () => void): void {
    const cont = onContinue ? `<button class="mbtn mbtn--primary act-continue">CONTINUE RUN</button>` : "";
    this.paint(`
      <div class="screen screen--title">
        <h1 class="title">WALL <span>OF</span> DEAD</h1>
        <p class="subtitle">Hold the barrier until dawn.</p>
        <div class="menu">
          ${cont}
          <button class="mbtn ${onContinue ? "" : "mbtn--primary"} act-start">${onContinue ? "NEW RUN" : "BEGIN"}</button>
          <button class="mbtn act-help">TUTORIAL</button>
          <button class="mbtn act-settings">SETTINGS</button>
        </div>
        <p class="controls">A / D move &nbsp;·&nbsp; MOUSE aim &nbsp;·&nbsp; CLICK fire &nbsp;·&nbsp; R reload &nbsp;·&nbsp; E repair/revive &nbsp;·&nbsp; SPACE shove &nbsp;·&nbsp; F frag &nbsp;·&nbsp; 🎮 gamepad ready</p>
      </div>`);
    this.btn(".act-start", onStart);
    if (onContinue) this.btn(".act-continue", onContinue);
    this.btn(".act-help", () => this.showHelp(() => this.showTitle(onStart, onSettings, onContinue)));
    this.btn(".act-settings", onSettings);
  }

  /** How-to-play + controls reference, reachable from the title and pause. */
  showHelp(onBack: () => void, backLabel = "BACK"): void {
    this.paint(`
      <div class="screen screen--help">
        <h2 class="panel-title">HOW TO PLAY</h2>
        <p class="subtitle">Hold the wall each night until dawn. By day, sneak the dark for supplies. Survive three nights of road to reach the safe zone. Hand spare weapons to allies on the LOADOUT screen — a weapon they carry, you can't (and vice-versa). Fix breaches at night with repair kits found by day.</p>
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
              <li><b>F</b> — toggle flashlight (off = stealthier, blind)</li>
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

  showSettings(onBack: () => void): void {
    const s = this.settings;
    this.paint(`
      <div class="screen screen--settings">
        <h2 class="panel-title">SETTINGS</h2>
        <div class="settings-grid">
        <div class="settings-row"><label>Difficulty</label>
          <select class="set-diff">
            <option value="story" ${s.difficulty === "story" ? "selected" : ""}>Story (gentler)</option>
            <option value="normal" ${s.difficulty === "normal" ? "selected" : ""}>Normal</option>
            <option value="nightmare" ${s.difficulty === "nightmare" ? "selected" : ""}>Nightmare</option>
          </select>
        </div>
        <div class="settings-row"><label>Aim assist</label><input type="checkbox" class="set-aim" ${s.aimAssist ? "checked" : ""}></div>
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
        <div class="rebind-head">CONTROLS — KEYBOARD (click to rebind)</div>
        ${BINDABLE.map((b) => {
          const phys = s.rebinds[b.id] ?? b.id;
          return `<div class="settings-row"><label>${b.label}</label><button class="mbtn mbtn--sm act-rebind" data-code="${b.id}">${prettyKey(phys)}</button></div>`;
        }).join("")}
        <div class="rebind-head">CONTROLS — GAMEPAD</div>
        ${GAMEPAD_REF.map((g) => `<div class="settings-row settings-row--ref"><label>${g.label}</label><span class="pad-key">${g.pad}</span></div>`).join("")}
        </div>
        <div class="menu menu--row">
          <button class="mbtn act-defaults">RESTORE DEFAULTS</button>
          <button class="mbtn mbtn--primary act-back">BACK</button>
        </div>
      </div>`);
    this.btn(".act-defaults", () => {
      this.settings = { ...defaultSettings() };
      this.applySettings();
      saveSettings(this.settings);
      this.showSettings(onBack);
    });
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
      s.qualityTouched = true; // an explicit choice — disable boot auto-detect
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
    const diff = this.root.querySelector(".set-diff") as HTMLSelectElement;
    diff.addEventListener("change", () => {
      s.difficulty = diff.value as DifficultyId;
      this.applySettings();
      saveSettings(s);
    });
    bind(".set-aim", (el) => (s.aimAssist = el.checked));
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
    // One-time onboarding nudge the first time you open the loadout.
    let firstTime = false;
    try {
      firstTime = !localStorage.getItem("wod-loadout-seen");
      if (firstTime) localStorage.setItem("wod-loadout-seen", "1");
    } catch {
      /* ignore */
    }
    const nudge = firstTime
      ? `<div class="lo-nudge">💡 SHARED ARMORY — a weapon you give an ally is theirs: they use its ammo and you can't carry it (and vice-versa). When a gun runs dry, you fall back to a melee bash (SPACE). Hand your spare to a survivor to cover a second lane.</div>`
      : "";
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
        ${nudge}
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

  /** The convoy advancing along the road toward the safe zone, plus a story beat
   * for the night ahead. Shown between nights. */
  showRoadMap(leg: number, total: number, title: string, story: string, onContinue: () => void): void {
    let nodes = "";
    for (let i = 0; i <= total; i++) {
      const pct = (i / total) * 100;
      const done = i <= leg;
      const safe = i === total;
      const label = safe ? "SAFE ZONE" : i === 0 ? "START" : `LEG ${i}`;
      nodes += `<div class="road-node ${done ? "road-node--done" : ""} ${safe ? "road-node--safe" : ""}" style="left:${pct}%"><span class="road-dot"></span><span class="road-label">${label}</span></div>`;
    }
    const convoyPct = (leg / total) * 100;
    this.paint(`
      <div class="screen screen--road">
        <h2 class="panel-title">THE ROAD TO THE SAFE ZONE</h2>
        <div class="roadmap">
          <div class="road-line"></div>
          <div class="road-line road-line--done" style="width:${convoyPct}%"></div>
          ${nodes}
          <div class="convoy" style="left:${convoyPct}%">▣</div>
        </div>
        <h3 class="road-night">${title}</h3>
        <p class="subtitle road-story">${story}</p>
        <div class="menu"><button class="mbtn mbtn--primary act-cont">PRESS ON ▶</button></div>
      </div>`);
    this.btn(".act-cont", onContinue);
  }

  /** A dawn dilemma: one choice with a consequence. Each option runs its effect
   * then proceeds. */
  showDilemma(title: string, sub: string, options: { label: string; detail: string; onPick: () => void }[], after: () => void): void {
    this.paint(`
      <div class="screen screen--report">
        <h2 class="panel-title">${title}</h2>
        <p class="subtitle">${sub}</p>
        <div class="menu">
          ${options.map((o, i) => `<button class="mbtn ${i === 0 ? "mbtn--primary" : ""} act-choice act-choice-${i}"><b>${o.label}</b><br><span class="choice-detail">${o.detail}</span></button>`).join("")}
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
