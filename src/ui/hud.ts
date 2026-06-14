import type { Ctx } from "../game/ctx";
import type { AdrenalineZone } from "../core/events";
import type { Scavenge } from "../minigames/scavenge";

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
      </div>
      <div class="hud-bottom">
        <div class="hud-left">
          <div class="stat"><span class="stat-tag">HEALTH</span><div class="bar bar-hp"><div class="bar-fill"></div></div></div>
          <div class="stat"><span class="stat-tag">WALL</span><div class="bar bar-wall"><div class="bar-fill"></div></div></div>
        </div>
        <div class="hud-center">
          <div class="adr"><div class="adr-fill"></div><div class="adr-tick"></div></div>
          <div class="adr-label">STEADY</div>
        </div>
        <div class="hud-right">
          <div class="weapon-name">—</div>
          <div class="ammo"><span class="ammo-mag">0</span><span class="ammo-res">/0</span></div>
          <div class="slots"></div>
        </div>
      </div>
      <div class="companions"></div>
      <div class="day-hud">
        <div class="day-title">SUPPLY RUN</div>
        <div class="day-crates">SUPPLIES 0/0</div>
        <div class="bar bar-day"><div class="bar-fill"></div></div>
        <div class="day-obj">▼ Grab the lit crates · avoid the dead · beat the clock</div>
      </div>
      <div class="kills">0</div>
      <div class="banner"></div>
      <div class="crosshair"><span class="ch-ring"></span><span class="hitmark"></span></div>
      <div class="dmg dmg--left"></div>
      <div class="dmg dmg--right"></div>
      <div class="dmg dmg--top"></div>
    `;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.el = {
      dawnFill: q(".dawn-fill"),
      dawnLabel: q(".dawn-label"),
      hpFill: q(".bar-hp .bar-fill"),
      wallFill: q(".bar-wall .bar-fill"),
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
      kills: q(".kills"),
      banner: q(".banner"),
      crosshair: q(".crosshair"),
      hitmark: q(".hitmark"),
      dmgLeft: q(".dmg--left"),
      dmgRight: q(".dmg--right"),
      dmgTop: q(".dmg--top"),
    };

    window.addEventListener("pointermove", (e) => {
      this.cx = e.clientX;
      this.cy = e.clientY;
    });
    this.ctx.events.on("SHOOT", () => this.fireKick());
    this.ctx.events.on("ZOMBIE_HIT", ({ headshot }) => this.hitmarker(headshot));
    this.ctx.events.on("PLAYER_HIT", ({ dirX }) => this.damageFlash(dirX));

    this.setMode("hidden");
  }

  private cx = window.innerWidth / 2;
  private cy = window.innerHeight / 2;

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
    const night = mode === "night";
    const day = mode === "day";
    this.el.top.style.display = night ? "" : "none";
    this.el.bottom.style.display = night ? "" : "none";
    this.el.companions.style.display = night ? "" : "none";
    this.el.kills.style.display = night ? "" : "none";
    this.el.dayHud.style.display = day ? "" : "none";
    this.el.crosshair.style.display = night ? "" : "none";
  }

  banner(text: string, sub = ""): void {
    this.el.banner.innerHTML = `<div class="banner-main">${text}</div><div class="banner-sub">${sub}</div>`;
    this.el.banner.classList.add("banner--show");
    this.bannerTimer = 2.6;
  }

  private buildSlots(): void {
    const w = this.ctx.run.weapons;
    let html = "";
    for (let i = 0; i < w.length; i++) {
      const active = i === this.ctx.run.weaponIndex ? " slot--active" : "";
      html += `<div class="slot${active}">${i + 1} ${w[i].def.name}</div>`;
    }
    this.el.slots.innerHTML = html;
  }

  update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove("banner--show");
    }

    if (this.mode === "night") {
      this.el.crosshair.style.left = `${this.cx}px`;
      this.el.crosshair.style.top = `${this.cy}px`;
      this.updateNight();
    } else if (this.mode === "day") this.updateDay();
  }

  private updateNight(): void {
    const c = this.ctx;
    this.el.hpFill.style.width = `${(c.player.hp / c.player.maxHp) * 100}%`;
    this.el.wallFill.style.width = `${c.wall.integrityFrac() * 100}%`;

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
      this.el.wname.textContent = c.player.reloading ? `${lo.def.name} — RELOADING` : lo.def.name;
      this.el.ammoMag.textContent = `${lo.ammo}`;
      this.el.ammoRes.textContent = `/${lo.reserve}`;
      this.el.ammoMag.classList.toggle("ammo-mag--low", lo.ammo > 0 && lo.ammo / lo.def.mag <= 0.25);
    }
    this.buildSlots();

    // Companions
    let cHtml = "";
    for (const comp of c.companions.list) {
      cHtml += `<div class="comp ${comp.down ? "comp--down" : ""}">${comp.name}</div>`;
    }
    this.el.companions.innerHTML = cHtml;

    this.el.kills.textContent = `KILLS ${c.stats.kills}`;
  }

  /** night-phase clock fill (called by the night scene). */
  setDawnProgress(p: number): void {
    this.el.dawnFill.style.width = `${p * 100}%`;
    this.el.dawnLabel.textContent = p > 0.92 ? "DAWN" : p > 0.6 ? "LATE NIGHT" : "NIGHT";
  }

  bindScavenge(s: Scavenge): void {
    this.scav = s;
  }
  private scav: Scavenge | null = null;

  private updateDay(): void {
    if (!this.scav) return;
    this.el.dayCrates.textContent = `SUPPLIES ${this.scav.got}/${this.scav.total}`;
    const f = Math.max(0, this.scav.timeLeft) / 26;
    this.el.dayFill.style.width = `${f * 100}%`;
  }
}
