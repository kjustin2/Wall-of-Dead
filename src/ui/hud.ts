import * as THREE from "three";
import type { Ctx } from "../game/ctx";
import type { AdrenalineZone } from "../core/events";
import type { Scavenge } from "../minigames/scavenge";

const THREAT_ARROWS = 6;

const ZONE_COLOR: Record<AdrenalineZone, string> = {
  shaken: "#5a78a0",
  steady: "#69d08a",
  focused: "#ffcf5a",
  surge: "#ff5a3c",
};

type Mode = "hidden" | "night" | "day";

/** Canvas-free DOM HUD. Built once, updated each frame from ctx. */
export class Hud {
  private root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private mode: Mode = "hidden";
  private bannerTimer = 0;

  constructor(private ctx: Ctx) {
    this.root = document.getElementById("hud") as HTMLElement;
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="dawn"><div class="dawn-fill"></div><div class="dawn-moon">🌙</div><span class="dawn-label">NIGHT</span></div>
        <div class="boss-bar"><span class="boss-name">THE BEHEMOTH</span><div class="boss-track"><div class="boss-fill"></div></div></div>
        <div class="wall-strip"></div>
      </div>
      <div class="hud-bottom">
        <div class="hud-left">
          <div class="stat"><span class="stat-tag">HEALTH</span><div class="bar bar-hp"><div class="bar-ghost"></div><div class="bar-fill"></div></div></div>
          <div class="stat"><span class="stat-tag">WALL</span><div class="bar bar-wall"><div class="bar-ghost"></div><div class="bar-fill"></div></div></div>
          <div class="kits">🔧 REPAIR KITS <span class="kits-n">0</span></div>
          <div class="tactics">🪤 TRAPS <span class="traps-n">0</span> <span class="tac-sep">·</span> <span class="tac-key">T</span></div>
        </div>
        <div class="repair"><div class="repair-label">REPAIRING…</div><div class="bar bar-repair"><div class="bar-fill"></div></div></div>
        <div class="prompt"></div>
        <div class="hud-center">
          <div class="adr"><div class="adr-fill"></div><div class="adr-tick"></div></div>
          <div class="adr-label">STEADY</div>
        </div>
        <div class="hud-right">
          <div class="weapon-name">—</div>
          <div class="ammo"><span class="ammo-mag">0</span><span class="ammo-res">/0</span></div>
          <div class="reload-bar"><div class="reload-zone"></div><div class="reload-fill"></div></div>
          <div class="slots"></div>
        </div>
      </div>
      <div class="companions"></div>
      <div class="day-hud">
        <div class="day-title">SUPPLY RUN</div>
        <div class="day-crates">SUPPLIES 0/0</div>
        <div class="bar bar-day"><div class="bar-fill"></div></div>
        <div class="stamina"><div class="stamina-fill"></div></div>
        <div class="day-obj">Grab supplies · rescue survivors · reach the exit · SHIFT sprint (loud!) · Q lure · F light · don't get caught</div>
        <div class="day-status"></div>
      </div>
      <div class="day-prompt"></div>
      <div class="kills">0</div>
      <div class="banner"></div>
      <div class="crosshair"><span class="ch-ring"></span><span class="hitmark"></span></div>
      <div class="dmg dmg--left"></div>
      <div class="dmg dmg--right"></div>
      <div class="dmg dmg--top"></div>
      <div class="danger-vig"></div>
      <div class="screenflash"></div>
    `;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.el = {
      dawnFill: q(".dawn-fill"),
      dawnLabel: q(".dawn-label"),
      bossBar: q(".boss-bar"),
      bossName: q(".boss-name"),
      bossFill: q(".boss-fill"),
      wallStrip: q(".wall-strip"),
      hpFill: q(".bar-hp .bar-fill"),
      hpGhost: q(".bar-hp .bar-ghost"),
      wallFill: q(".bar-wall .bar-fill"),
      wallGhost: q(".bar-wall .bar-ghost"),
      kitsN: q(".kits-n"),
      trapsN: q(".traps-n"),
      repair: q(".repair"),
      repairFill: q(".bar-repair .bar-fill"),
      prompt: q(".prompt"),
      reloadBar: q(".reload-bar"),
      reloadFill: q(".reload-fill"),
      reloadZone: q(".reload-zone"),
      adr: q(".adr"),
      adrFill: q(".adr-fill"),
      adrTick: q(".adr-tick"),
      adrLabel: q(".adr-label"),
      wname: q(".weapon-name"),
      ammoMag: q(".ammo-mag"),
      ammoRes: q(".ammo-res"),
      slots: q(".slots"),
      companions: q(".companions"),
      top: q(".hud-top"),
      bottom: q(".hud-bottom"),
      dayHud: q(".day-hud"),
      dayCrates: q(".day-crates"),
      dayFill: q(".bar-day .bar-fill"),
      stamina: q(".stamina-fill"),
      dayStatus: q(".day-status"),
      dayPrompt: q(".day-prompt"),
      kills: q(".kills"),
      banner: q(".banner"),
      crosshair: q(".crosshair"),
      hitmark: q(".hitmark"),
      dmgLeft: q(".dmg--left"),
      dmgRight: q(".dmg--right"),
      dmgTop: q(".dmg--top"),
      dangerVig: q(".danger-vig"),
      screenflash: q(".screenflash"),
    };

    window.addEventListener("pointermove", (e) => {
      this.cx = e.clientX;
      this.cy = e.clientY;
    });
    this.ctx.events.on("SHOOT", () => this.fireKick());
    this.ctx.events.on("ZOMBIE_HIT", ({ headshot }) => this.hitmarker(headshot));
    this.ctx.events.on("PLAYER_HIT", ({ dirX }) => this.damageFlash(dirX));
    // Big-beat additive screen flashes (color-coded by event).
    this.ctx.events.on("WALL_BREACH", () => this.flash("#ff3a26", 0.5));
    this.ctx.events.on("LAST_STAND", () => this.flash("#ffae3a", 0.6));
    this.ctx.events.on("PLAYER_DIED", () => this.flash("#8a0d10", 0.85));
    this.ctx.events.on("RUN_VICTORY", () => this.flash("#fff0c0", 0.7));

    // Wall threat strip: one cell per wall segment.
    const strip = this.el.wallStrip;
    for (let i = 0; i < this.ctx.wall.segments; i++) {
      const cell = document.createElement("div");
      cell.className = "wall-cell";
      strip.appendChild(cell);
      this.wallCells.push(cell);
    }
    // Off-screen threat arrow pool.
    for (let i = 0; i < THREAT_ARROWS; i++) {
      const a = document.createElement("div");
      a.className = "threat-arrow";
      a.style.display = "none";
      this.root.appendChild(a);
      this.threatArrows.push(a);
    }

    this.setMode("hidden");
  }

  private wallCells: HTMLElement[] = [];
  private threatArrows: HTMLElement[] = [];
  private segFracs: number[] = [];
  private pressure: number[] = [];
  private tmpV = new THREE.Vector3();
  private cx = window.innerWidth / 2;
  private cy = window.innerHeight / 2;
  private hpGhostV = 1;
  private wallGhostV = 1;
  private lastKills = -1;

  /** Brief additive full-screen flash, color-coded by the event. Honors the
   * reduced-flashing accessibility toggle (which sets body.reduced). */
  flash(color: string, intensity: number): void {
    const f = this.el.screenflash;
    const k = document.body.classList.contains("reduced") ? intensity * 0.3 : intensity;
    f.style.background = color;
    f.style.transition = "none";
    f.style.opacity = `${k}`;
    void f.offsetWidth; // commit, then fade out via the transition
    f.style.transition = "opacity 0.45s ease-out";
    f.style.opacity = "0";
  }

  /** Re-fire a one-shot CSS animation by toggling a class (reflow in between). */
  private replay(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  private fireKick(): void {
    if (this.mode !== "night") return;
    this.el.crosshair.classList.remove("crosshair--fire");
    void this.el.crosshair.offsetWidth;
    this.el.crosshair.classList.add("crosshair--fire");
  }

  private hitmarker(headshot: boolean): void {
    if (this.mode !== "night") return;
    const h = this.el.hitmark;
    h.className = `hitmark ${headshot ? "hitmark--crit" : ""}`;
    void h.offsetWidth;
    h.classList.add("hitmark--show");
  }

  private damageFlash(dirX: number): void {
    const el = dirX > 0.3 ? this.el.dmgRight : dirX < -0.3 ? this.el.dmgLeft : this.el.dmgTop;
    el.classList.remove("dmg--show");
    void el.offsetWidth;
    el.classList.add("dmg--show");
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    // Clear any in-flight banner so it doesn't bleed across a scene change.
    this.el.banner.classList.remove("banner--show");
    this.bannerTimer = 0;
    const night = mode === "night";
    const day = mode === "day";
    this.el.top.style.display = night ? "" : "none";
    this.el.bottom.style.display = night ? "" : "none";
    this.el.companions.style.display = night ? "" : "none";
    this.el.kills.style.display = night ? "" : "none";
    this.el.dayHud.style.display = day ? "" : "none";
    this.el.dayPrompt.style.display = "none";
    this.el.crosshair.style.display = night ? "" : "none";
    if (!night) for (const a of this.threatArrows) a.style.display = "none";
    if (!night) {
      this.el.repair.style.display = "none";
      this.el.prompt.style.display = "none";
      this.el.dangerVig.classList.remove("danger-vig--on");
    }
    if (night) {
      // Fresh night: reset the reactive HUD trails.
      this.hpGhostV = 1;
      this.wallGhostV = 1;
      this.lastKills = -1;
    }
  }

  banner(text: string, sub = ""): void {
    this.el.banner.innerHTML = `<div class="banner-main">${text}</div><div class="banner-sub">${sub}</div>`;
    this.el.banner.classList.add("banner--show");
    this.bannerTimer = 2.6;
  }

  private lastSlots = "";
  private lastComps = "";
  private buildSlots(): void {
    const w = this.ctx.run.weapons;
    let html = "";
    for (let i = 0; i < w.length; i++) {
      const active = i === this.ctx.run.weaponIndex ? " slot--active" : "";
      html += `<div class="slot${active}">${i + 1} ${w[i].def.name}</div>`;
    }
    // Only touch the DOM when it actually changed — reparsing this every frame
    // is needless layout + GC churn.
    if (html !== this.lastSlots) {
      this.el.slots.innerHTML = html;
      this.lastSlots = html;
    }
  }

  update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove("banner--show");
    }

    if (this.mode === "night") {
      this.el.crosshair.style.left = `${this.cx}px`;
      this.el.crosshair.style.top = `${this.cy}px`;
      this.updateNight(dt);
    } else if (this.mode === "day") this.updateDay();
  }

  private updateNight(dt: number): void {
    const c = this.ctx;
    const hpFrac = Math.max(0, c.player.hp / c.player.maxHp);
    const wallFrac = c.wall.integrityFrac();
    this.el.hpFill.style.width = `${hpFrac * 100}%`;
    this.el.wallFill.style.width = `${wallFrac * 100}%`;
    // Ghost trail: a red chip that lags the real value down after damage.
    this.hpGhostV = this.hpGhostV > hpFrac ? Math.max(hpFrac, this.hpGhostV - dt * 0.7) : hpFrac;
    this.wallGhostV = this.wallGhostV > wallFrac ? Math.max(wallFrac, this.wallGhostV - dt * 0.7) : wallFrac;
    this.el.hpGhost.style.width = `${this.hpGhostV * 100}%`;
    this.el.wallGhost.style.width = `${this.wallGhostV * 100}%`;
    // Danger edge-glow when HP or wall is critical.
    const danger = hpFrac < 0.3 || wallFrac < 0.3;
    this.el.dangerVig.classList.toggle("danger-vig--on", danger);
    this.el.kitsN.textContent = `${c.run.repairKits}`;
    this.el.trapsN.textContent = `${c.run.traps}`;

    // Repair progress (hold E at a breach)
    if (c.player.repairing && c.player.repairFrac > 0) {
      this.el.repair.style.display = "";
      this.el.repairFill.style.width = `${c.player.repairFrac * 100}%`;
    } else {
      this.el.repair.style.display = "none";
    }

    // Contextual repair prompt at a breach
    if (c.player.atBreach && !c.player.repairing) {
      this.el.prompt.style.display = "";
      const hasKit = c.run.repairKits > 0;
      this.el.prompt.textContent = hasKit ? "HOLD  E  TO REPAIR  (10s)" : "NEED A REPAIR KIT";
      this.el.prompt.style.color = hasKit ? "#ffce7a" : "#ff5a3c";
    } else {
      this.el.prompt.style.display = "none";
    }

    // Reload bar + active-reload sweet-spot marker
    if (c.player.reloading) {
      this.el.reloadBar.style.display = "";
      this.el.reloadFill.style.width = `${c.player.reloadFrac * 100}%`;
      const [a, b] = c.player.reloadWindow;
      this.el.reloadZone.style.left = `${a * 100}%`;
      this.el.reloadZone.style.width = `${(b - a) * 100}%`;
    } else {
      this.el.reloadBar.style.display = "none";
    }

    const adr = c.adrenaline;
    this.el.adrFill.style.width = `${adr.value}%`;
    const color = ZONE_COLOR[adr.zone];
    this.el.adrFill.style.background = color;
    if (adr.canCrash()) {
      this.el.adrLabel.textContent = "💣 FRAG READY — F";
      this.el.adr.classList.add("adr--ready");
    } else {
      this.el.adrLabel.textContent = adr.zone.toUpperCase();
      this.el.adr.classList.remove("adr--ready");
    }

    const lo = c.run.weapons[c.run.weaponIndex];
    if (lo) {
      const empty = lo.ammo === 0 && lo.reserve === 0 && !lo.def.sidearm;
      this.el.wname.textContent = c.player.overheated
        ? `${lo.def.name} — OVERHEATED`
        : empty
          ? "OUT OF AMMO — 1–5 to switch · SPACE to bash"
          : c.player.reloading
            ? `${lo.def.name} — RELOADING`
            : c.player.buffed
              ? `${lo.def.name} — ⚡BUFFED`
              : lo.def.name;
      this.el.wname.classList.toggle("weapon-name--empty", empty || c.player.overheated);
      this.el.ammoMag.textContent = `${lo.ammo}`;
      this.el.ammoRes.textContent = lo.def.sidearm ? "/∞" : `/${lo.reserve}`;
      this.el.ammoMag.classList.toggle("ammo-mag--low", lo.ammo > 0 && lo.ammo / lo.def.mag <= 0.25);
    }
    this.buildSlots();

    // Companions (only re-render on change)
    let cHtml = "";
    for (const comp of c.companions.list) {
      cHtml += `<div class="comp ${comp.down ? "comp--down" : ""}">${comp.name}</div>`;
    }
    if (cHtml !== this.lastComps) {
      this.el.companions.innerHTML = cHtml;
      this.lastComps = cHtml;
    }

    if (c.stats.kills !== this.lastKills) {
      this.el.kills.textContent = `KILLS ${c.stats.kills}`;
      if (this.lastKills >= 0) this.replay(this.el.kills, "kills--pop");
      this.lastKills = c.stats.kills;
    }

    // Boss health bar (night-3 finale). Explicit "block" — "" would fall back to
    // the CSS default of display:none.
    if (c.enemies.bossAlive) {
      this.el.bossBar.style.display = "block";
      this.el.bossFill.style.width = `${c.enemies.bossFrac() * 100}%`;
    } else {
      this.el.bossBar.style.display = "none";
    }

    this.updateWallStrip();
    this.updateThreatArrows();
  }

  /** Color each wall-strip cell by segment integrity, with a red pulse where
   * zombies are pressing. */
  private updateWallStrip(): void {
    const wall = this.ctx.wall;
    this.segFracs = wall.segmentFracs(this.segFracs);
    // Pressure per segment from attacking/crossing zombies (reused buffer).
    const seg = wall.segments;
    for (let i = 0; i < seg; i++) this.pressure[i] = 0;
    for (const z of this.ctx.enemies.alive) {
      if (z.state === "attacking" || z.state === "crossing") this.pressure[wall.segAt(z.x)]++;
    }
    for (let i = 0; i < this.wallCells.length; i++) {
      const f = this.segFracs[i] ?? 0;
      const cell = this.wallCells[i];
      const hue = Math.round(f * 120); // red(0) → green(120)
      cell.style.background = f <= 0 ? "#1a0c0c" : `hsl(${hue}, 70%, ${20 + f * 22}%)`;
      cell.classList.toggle("wall-cell--hot", this.pressure[i] > 0 && f > 0);
      cell.classList.toggle("wall-cell--breach", f <= 0);
    }
  }

  /** Edge arrows pointing at crossing zombies that aren't on screen. */
  private updateThreatArrows(): void {
    const cam = this.ctx.stage.camera;
    const cxp = window.innerWidth / 2;
    const cyp = window.innerHeight / 2;
    const rx = window.innerWidth * 0.4;
    const ry = window.innerHeight * 0.4;
    let idx = 0;
    for (const z of this.ctx.enemies.alive) {
      if (idx >= THREAT_ARROWS) break;
      if (z.state !== "crossing") continue;
      this.tmpV.set(z.x, 1.2, z.z).project(cam);
      let nx = this.tmpV.x;
      let ny = this.tmpV.y;
      const behind = this.tmpV.z > 1;
      const onScreen = !behind && Math.abs(nx) <= 0.95 && Math.abs(ny) <= 0.95;
      if (onScreen) continue; // visible — no marker needed
      if (behind) {
        nx = -nx;
        ny = -ny;
      }
      const ang = Math.atan2(-ny, nx); // screen space (y points down)
      const a = this.threatArrows[idx++];
      a.style.display = "";
      a.style.left = `${cxp + Math.cos(ang) * rx}px`;
      a.style.top = `${cyp + Math.sin(ang) * ry}px`;
      a.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
    }
    for (let i = idx; i < this.threatArrows.length; i++) this.threatArrows[i].style.display = "none";
  }

  /** night-phase clock fill + countdown (called by the night loop). */
  setDawnProgress(p: number, secondsLeft: number): void {
    this.el.dawnFill.style.width = `${p * 100}%`;
    const s = Math.max(0, Math.ceil(secondsLeft));
    const mmss = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
    const phase = p > 0.92 ? "DAWN" : p > 0.82 ? "⚠ SURGE" : p > 0.6 ? "LATE NIGHT" : "NIGHT";
    this.el.dawnLabel.textContent = `${phase}  ·  DAWN ${mmss}`;
  }

  bindScavenge(s: Scavenge): void {
    this.scav = s;
  }
  private scav: Scavenge | null = null;

  private updateDay(): void {
    if (!this.scav) return;
    const s = this.scav;
    const low = s.timeLeft < 12;
    this.el.dayCrates.textContent = `SUPPLIES ${s.got}/${s.total}   ·   ${Math.max(0, Math.ceil(s.timeLeft))}s`;
    const f = Math.max(0, s.timeLeft) / s.maxTime;
    this.el.dayFill.style.width = `${f * 100}%`;
    this.el.dayCrates.style.color = s.spotted || low ? "#ff5a3c" : "#ffce7a";
    this.el.stamina.style.width = `${s.stamina * 100}%`;

    // Light state
    this.el.dayStatus.textContent = s.lightOn ? "🔦 LIGHT ON" : "🌑 LIGHT OFF";
    this.el.dayStatus.style.color = s.lightOn ? "#9dd0ff" : "#6a7a8a";

    // Contextual prompt (hidden / reach the exit)
    if (s.promptText) {
      this.el.dayPrompt.style.display = "";
      this.el.dayPrompt.textContent = s.promptText;
    } else {
      this.el.dayPrompt.style.display = "none";
    }
  }
}
