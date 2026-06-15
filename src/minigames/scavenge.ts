import * as THREE from "three";
import type { Ctx } from "../game/ctx";
import { makeGlow, makeLabel, concreteTexture, stencilTexture } from "../render/textures";
import { clamp } from "../core/math";
import { TRAITS } from "../game/traits";

const SURVIVOR_NAMES = ["Cole", "Reyes", "Tess", "Vance", "Okafor", "Lin", "Brenner"];

const DURATION = 62;
const AREA = { minX: -40, maxX: 40, minZ: -66, maxZ: -3 };
const SNEAK = 6.4;
const SPRINT = 12;
const CRATES = 8; // supply crates that count toward the run rating
const KIT_CRATES = 2; // bonus wall-repair-kit pickups
const AV_R = 0.6;
const VISION_RANGE = 15;
const CONE_HALF = 0.52; // radians, half-angle of a guard's sight cone
const TD_RANGE = 2.4; // takedown reach
const TD_TIME = 0.7; // hold time for a silent takedown
const NOISE_SPRINT = 12; // a sprinting avatar is heard within this radius
const LURE_RANGE = 20; // guards within this of a lure go investigate it
const LURE_CD = 8;
const HIDE_R = 2.6; // radius of a hiding alcove
const MAX_CATCHES = 3; // caught this many times → dragged off (run ends)

export type Tier = "S" | "A" | "B" | "C" | "D";

export function tierFromFrac(f: number): Tier {
  if (f >= 0.95) return "S";
  if (f >= 0.75) return "A";
  if (f >= 0.55) return "B";
  if (f >= 0.3) return "C";
  return "D";
}

interface Wall {
  x: number;
  z: number;
  w: number;
  d: number;
  car?: boolean;
}
interface Crate {
  group: THREE.Group;
  x: number;
  z: number;
  got: boolean;
  gold: boolean;
  kit: boolean;
}
interface Survivor {
  group: THREE.Group;
  x: number;
  z: number;
  taken: boolean;
}
interface Guard {
  group: THREE.Group;
  cone: THREE.Mesh;
  coneMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  facing: number;
  patrol: { x: number; z: number }[];
  pIdx: number;
  state: "patrol" | "chase" | "investigate";
  alertT: number;
  speed: number;
  stuckT: number;
  px: number;
  pz: number;
  invX: number;
  invZ: number;
  dead: boolean;
}
interface Lure {
  x: number;
  z: number;
  life: number;
  glow: THREE.Sprite;
}
interface HideZone {
  x: number;
  z: number;
}

const AMBER = 0xffb24a;
const THREAT = 0xff4030;

// Static maze-ish layout (corners to break line of sight). Concrete barriers
// plus a couple of wrecked cars — all solid cover.
const WALLS: Wall[] = [
  { x: -14, z: -14, w: 20, d: 1.4 },
  { x: 12, z: -13, w: 1.4, d: 14 },
  { x: 26, z: -20, w: 1.4, d: 18 },
  { x: -2, z: -27, w: 22, d: 1.4 },
  { x: -26, z: -26, w: 1.4, d: 22 },
  { x: 18, z: -34, w: 1.4, d: 22 },
  { x: 4, z: -42, w: 18, d: 1.4 },
  { x: -16, z: -44, w: 14, d: 1.4 },
  { x: -30, z: -52, w: 1.4, d: 16 },
  { x: 28, z: -50, w: 1.4, d: 18 },
  { x: 8, z: -58, w: 22, d: 1.4 },
  { x: -10, z: -58, w: 1.4, d: 12 },
  { x: -8, z: -22, w: 2.4, d: 4.6, car: true },
  { x: 16, z: -40, w: 4.6, d: 2.4, car: true },
  { x: -22, z: -50, w: 2.4, d: 4.6, car: true },
];

function pushOutAABB(px: number, pz: number, r: number, w: Wall): [number, number] {
  const minX = w.x - w.w / 2;
  const maxX = w.x + w.w / 2;
  const minZ = w.z - w.d / 2;
  const maxZ = w.z + w.d / 2;
  const cx = clamp(px, minX, maxX);
  const cz = clamp(pz, minZ, maxZ);
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [px, pz];
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return [px + (dx / d) * push, pz + (dz / d) * push];
  }
  // centre inside the box — eject along the nearest face
  const dl = px - minX;
  const dr = maxX - px;
  const dt = pz - minZ;
  const db = maxZ - pz;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return [minX - r, pz];
  if (m === dr) return [maxX + r, pz];
  if (m === dt) return [px, minZ - r];
  return [px, maxZ + r];
}

function segAABB(ax: number, az: number, bx: number, bz: number, w: Wall): boolean {
  const minX = w.x - w.w / 2;
  const maxX = w.x + w.w / 2;
  const minZ = w.z - w.d / 2;
  const maxZ = w.z + w.d / 2;
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? ax : az;
    const dd = axis === 0 ? dx : dz;
    const lo = axis === 0 ? minX : minZ;
    const hi = axis === 0 ? maxX : maxZ;
    if (Math.abs(dd) < 1e-6) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / dd;
      let t2 = (hi - o) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Entry parameter t in [0,1] where segment a→b first enters the box, else Infinity. */
function segEntryT(ax: number, az: number, bx: number, bz: number, w: Wall): number {
  const minX = w.x - w.w / 2;
  const maxX = w.x + w.w / 2;
  const minZ = w.z - w.d / 2;
  const maxZ = w.z + w.d / 2;
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? ax : az;
    const dd = axis === 0 ? dx : dz;
    const lo = axis === 0 ? minX : minZ;
    const hi = axis === 0 ? maxX : maxZ;
    if (Math.abs(dd) < 1e-6) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / dd;
      let t2 = (hi - o) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/**
 * The day "Supply Run" — a moody stealth crawl. The map is dark; your avatar has
 * a flashlight and moves slow (hold Shift to sprint a short burst). Zombies
 * patrol with visible sight cones; step into one (with line of sight, not behind
 * a wall) and they give chase. Find the crates in the dark; returns { tier, frac }.
 */
export class Scavenge {
  active = false;
  done = false;
  got = 0;
  total = CRATES;
  timeLeft = DURATION;
  readonly maxTime = DURATION;
  stamina = 1;
  spotted = false;
  // HUD-facing state (read by the day HUD)
  promptText = "";
  takedownFrac = 0;
  lightOn = true;
  catches = 0;
  extractOpen = false;

  private group = new THREE.Group();
  private stunT = 0; // post-catch stun (can't move)
  private graceT = 0; // post-catch detection grace
  private lures: Lure[] = [];
  private lureCd = 0;
  private hideZones: HideZone[] = [];
  private extractZone = { x: 0, z: -5 };
  private extractMarker = new THREE.Group();
  private tdGuard: Guard | null = null;
  private tdProgress = 0;
  private hidden = false;
  private lightDefault = 19;
  private avatar = new THREE.Group();
  private light: THREE.SpotLight;
  private ax = 0;
  private az = -7;
  private crates: Crate[] = [];
  private guards: Guard[] = [];
  private survivor: Survivor | null = null;
  private redLights: { light: THREE.PointLight; glow: THREE.Sprite; phase: number }[] = [];
  private signs: { mat: THREE.MeshBasicMaterial; glow: THREE.Sprite; phase: number }[] = [];
  private fogPrev = 0.017;
  private groanT = 4;
  private t = 0;
  private tmp = new THREE.Vector2();
  private coneGeo: THREE.BufferGeometry;
  private nearest = new THREE.Vector3();

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    this.buildAvatar();
    this.light = new THREE.SpotLight(0xfff0d0, 18, 26, 0.62, 0.5, 1.0);
    this.light.position.set(0, 3.5, 0);
    this.light.target.position.set(0, -1, 10); // local +Z = the way the avatar faces
    this.avatar.add(this.light);
    this.avatar.add(this.light.target);
    this.avatar.add(makeGlow(0x6fc3ff, 2.4, 0.5));
    this.group.add(this.avatar);

    this.buildFloor();
    this.buildWalls();
    this.buildBoundary();
    this.buildSetDressing();
    this.buildScaryExtras();
    this.buildHideAndExtract();

    // Sight-cone sector geometry (points +Z; rotated to each guard's facing).
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.absarc(0, 0, VISION_RANGE, Math.PI / 2 - CONE_HALF, Math.PI / 2 + CONE_HALF, false);
    shape.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(shape, 16);
    g.rotateX(Math.PI / 2);
    this.coneGeo = g;

    this.group.visible = false;
    scene.add(this.group);
  }

  private buildAvatar(): void {
    const coat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x223043, roughness: 1, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 1, flatShading: true });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.45), coat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), dark);
    pack.position.set(0, 1.05, 0.34);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skin);
    head.position.y = 1.72;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.46), dark);
    helmet.position.y = 1.95;
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), dark);
      leg.position.set(lx, 0.42, 0);
      this.avatar.add(leg);
    }
    this.avatar.add(torso, pack, head, helmet);
  }

  /** A dedicated cracked-concrete lot floor under the run, with faded painted
   * lane lines — reads as an urban yard rather than open ground. */
  private buildFloor(): void {
    const tex = concreteTexture();
    tex.repeat.set(11, 9);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 76),
      new THREE.MeshStandardMaterial({ color: 0x2b323a, map: tex, roughness: 0.85, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, (AREA.minZ + AREA.maxZ) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    // Faded yellow parking/lane lines.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x6a5a22, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 9), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-30 + i * 12, 0.03, -20);
      this.group.add(line);
    }
  }

  private buildWalls(): void {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 1, flatShading: true });
    const cap = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 1, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8, metalness: 0.3, flatShading: true });
    const tire = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 });
    for (const w of WALLS) {
      if (w.car) {
        const car = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.9, w.d), rust);
        body.position.y = 0.7;
        body.castShadow = true;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(w.w * 0.85, 0.8, w.d * 0.5), metal);
        cabin.position.set(0, 1.4, 0);
        car.add(body, cabin);
        const along = w.w > w.d; // orient wheels along the longer axis
        for (const a of [-0.32, 0.32])
          for (const b of [-0.34, 0.34]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), tire);
            wheel.rotation.z = Math.PI / 2;
            if (along) wheel.position.set(a * w.w, 0.4, b * w.d);
            else wheel.position.set(b * w.w, 0.4, a * w.d);
            car.add(wheel);
          }
        car.position.set(w.x, 0, w.z);
        this.group.add(car);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, 1.8, w.d), concrete);
        m.position.set(w.x, 0.9, w.z);
        m.castShadow = true;
        m.receiveShadow = true;
        const top = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.1, 0.25, w.d + 0.1), cap);
        top.position.set(w.x, 1.85, w.z);
        this.group.add(m, top);
      }
    }
  }

  /** Decorative clutter to make the dark map intense: rubble, barrels, debris,
   * blood, and flickering red emergency lights. No collision — placed for mood. */
  private buildSetDressing(): void {
    const rng = this.ctx.rng;
    const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 1, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e2316, roughness: 1, flatShading: true });
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x3a0608, transparent: true, opacity: 0.5, depthWrite: false });

    const spot = () => {
      for (let i = 0; i < 20; i++) {
        const x = rng.range(AREA.minX + 2, AREA.maxX - 2);
        const z = rng.range(AREA.minZ + 2, AREA.maxZ - 2);
        if (!this.inWall(x, z, 1.4)) return { x, z };
      }
      return { x: 0, z: -20 };
    };

    // Rubble piles
    for (let i = 0; i < 16; i++) {
      const s = rng.range(0.4, 1.2);
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), dark);
      const p = spot();
      r.position.set(p.x, s * 0.3, p.z);
      r.scale.y = 0.5;
      r.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      this.group.add(r);
    }
    // Barrels + scattered debris
    for (let i = 0; i < 7; i++) {
      const p = spot();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), rust);
      barrel.position.set(p.x, 0.55, p.z);
      barrel.rotation.z = rng.chance(0.3) ? Math.PI / 2 : 0;
      barrel.castShadow = true;
      this.group.add(barrel);
    }
    for (let i = 0; i < 8; i++) {
      const p = spot();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(rng.range(0.8, 1.6), 0.1, 0.22), wood);
      plank.position.set(p.x, 0.06, p.z);
      plank.rotation.y = rng.range(0, Math.PI);
      this.group.add(plank);
    }
    // Blood pools
    for (let i = 0; i < 8; i++) {
      const p = spot();
      const blood = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.6, 1.4), 12), bloodMat);
      blood.rotation.x = -Math.PI / 2;
      blood.position.set(p.x, 0.03, p.z);
      this.group.add(blood);
    }
    // Flickering red emergency lights
    for (let i = 0; i < 3; i++) {
      const p = spot();
      const light = new THREE.PointLight(0xff2820, 0, 18, 2);
      light.position.set(p.x, 4, p.z);
      const glow = makeGlow(0xff3a30, 2.6, 0.5);
      glow.position.set(p.x, 4, p.z);
      this.group.add(light, glow);
      this.redLights.push({ light, glow, phase: rng.range(0, 6) });
    }
  }

  /** Hiding alcoves (dumpsters you can tuck behind to break a chase) + the
   * extraction point that opens once the supplies are secured. */
  private buildHideAndExtract(): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a3a2e, roughness: 0.9, flatShading: true });
    const spots: [number, number][] = [
      [-32, -12],
      [30, -30],
      [-4, -38],
      [22, -56],
      [-26, -60],
    ];
    for (const [x, z] of spots) {
      this.hideZones.push({ x, z });
      const bin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 1.4), metal);
      bin.position.set(x, 0.75, z);
      bin.castShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 1.5), metal);
      lid.position.set(x, 1.6, z);
      lid.rotation.z = 0.12;
      // a soft shadow-glow so the dark alcove reads as a safe pocket
      const g = makeGlow(0x2a6a4a, 3.0, 0.18);
      g.position.set(x, 0.4, z);
      this.group.add(bin, lid, g);
    }

    // Extraction beacon — hidden until the run goal is met.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.4, 28),
      new THREE.MeshBasicMaterial({ color: 0x6fffa8, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6fffa8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    pillar.position.y = 4.5;
    this.extractMarker.add(ring, pillar, makeGlow(0x6fffa8, 4, 0.6));
    this.extractMarker.position.set(this.extractZone.x, 0, this.extractZone.z);
    this.extractMarker.visible = false;
    this.group.add(this.extractMarker);
  }

  /** Mood layer: floor graffiti, a flickering neon hazard sign, drifting fog,
   * hanging cables, and glints of broken glass. */
  private buildScaryExtras(): void {
    const rng = this.ctx.rng;
    const spot = () => {
      for (let i = 0; i < 16; i++) {
        const x = rng.range(AREA.minX + 3, AREA.maxX - 3);
        const z = rng.range(AREA.minZ + 3, AREA.maxZ - 3);
        if (!this.inWall(x, z, 1.6)) return { x, z };
      }
      return { x: 0, z: -24 };
    };

    // Stencilled graffiti on the floor.
    const words = ["RUN", "NO EXIT", "QUARANTINE", "TURN BACK", "DEAD ZONE", "HELP US"];
    for (let i = 0; i < 4; i++) {
      const p = spot();
      const tex = stencilTexture(rng.pick(words), i === 0 ? "#c23a2a" : "#7a8a3a");
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), mat);
      tag.rotation.x = -Math.PI / 2;
      tag.rotation.z = rng.range(0, Math.PI);
      tag.position.set(p.x, 0.04, p.z);
      this.group.add(tag);
    }

    // A couple of flickering neon hazard signs mounted high.
    for (let i = 0; i < 2; i++) {
      const p = spot();
      const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff3a2a : 0x3affc0, fog: false, transparent: true, opacity: 0.9 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), mat);
      sign.position.set(p.x, 3.4, p.z);
      sign.rotation.y = rng.range(-0.5, 0.5);
      const glow = makeGlow(i === 0 ? 0xff5a3a : 0x5affd0, 4, 0.6);
      glow.position.copy(sign.position);
      this.group.add(sign, glow);
      this.signs.push({ mat, glow, phase: rng.range(0, 6) });
    }

    // Drifting low fog cards.
    const fogTex = makeGlow(0xffffff, 1).material.map;
    for (let i = 0; i < 7; i++) {
      const p = spot();
      const fmat = new THREE.MeshBasicMaterial({ map: fogTex, color: 0x2a3540, transparent: true, opacity: 0.14, depthWrite: false });
      const fog = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), fmat);
      fog.rotation.x = -Math.PI / 2;
      fog.position.set(p.x, rng.range(0.3, 1.0), p.z);
      this.group.add(fog);
    }

    // Hanging cables strung across the lot.
    const cableMat = new THREE.LineBasicMaterial({ color: 0x05080a, transparent: true, opacity: 0.6, fog: true });
    for (let i = 0; i < 4; i++) {
      const ax = rng.range(AREA.minX + 4, AREA.maxX - 4);
      const az = rng.range(AREA.minZ + 6, AREA.maxZ - 6);
      const pts: THREE.Vector3[] = [];
      const len = rng.range(8, 16);
      const dir = rng.range(0, Math.PI);
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const sag = Math.sin(t * Math.PI) * 1.6;
        pts.push(new THREE.Vector3(ax + Math.cos(dir) * (t - 0.5) * len, 3.6 - sag, az + Math.sin(dir) * (t - 0.5) * len));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat);
      line.frustumCulled = false;
      this.group.add(line);
    }

    // Glints of broken glass scattered on the ground (cheap additive sprites).
    for (let i = 0; i < 18; i++) {
      const p = spot();
      const glint = makeGlow(0xbfe0ff, rng.range(0.2, 0.5), rng.range(0.2, 0.5));
      glint.position.set(p.x + rng.range(-2, 2), 0.06, p.z + rng.range(-2, 2));
      this.group.add(glint);
    }
  }

  private buildBoundary(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3a6a8a,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const w = AREA.maxX - AREA.minX;
    const d = AREA.maxZ - AREA.minZ;
    const cx = (AREA.minX + AREA.maxX) / 2;
    const cz = (AREA.minZ + AREA.maxZ) / 2;
    const edges: [number, number, number, number][] = [
      [cx, AREA.minZ, w, 0.15],
      [cx, AREA.maxZ, w, 0.15],
      [AREA.minX, cz, 0.15, d],
      [AREA.maxX, cz, 0.15, d],
    ];
    for (const [ex, ez, ew, ed] of edges) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.06, ed), mat);
      bar.position.set(ex, 0.04, ez);
      this.group.add(bar);
    }
  }

  private inWall(x: number, z: number, pad = 1): boolean {
    for (const w of WALLS) {
      if (x > w.x - w.w / 2 - pad && x < w.x + w.w / 2 + pad && z > w.z - w.d / 2 - pad && z < w.z + w.d / 2 + pad)
        return true;
    }
    return false;
  }

  private freeSpot(minZ: number, maxZ: number): { x: number; z: number } {
    for (let i = 0; i < 30; i++) {
      const x = this.ctx.rng.range(AREA.minX + 3, AREA.maxX - 3);
      const z = this.ctx.rng.range(minZ, maxZ);
      if (!this.inWall(x, z, 1.2)) return { x, z };
    }
    return { x: this.ctx.rng.range(AREA.minX + 3, AREA.maxX - 3), z: this.ctx.rng.range(minZ, maxZ) };
  }

  private makeCrate(x: number, z: number, gold: boolean, kit: boolean): Crate {
    const g = new THREE.Group();
    const beacon = kit ? 0x5fd8ff : gold ? 0xffd84a : AMBER;
    const tint = kit ? 0x244a5a : gold ? 0xb8881e : 0x5a4a2a;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.72, 0.72),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, emissive: new THREE.Color(kit ? 0x06303a : gold ? 0x4a3000 : 0x221a08), flatShading: true })
    );
    box.position.y = 0.4;
    box.castShadow = true;
    g.add(box);

    if (kit) {
      // Repair kit — a white maintenance cross
      const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0x88c0ff), emissiveIntensity: 0.9 });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.16), cm);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.5), cm);
      c1.position.y = 0.82;
      c2.position.y = 0.82;
      g.add(c1, c2);
    } else {
      // Ammo crate — brass rounds standing on top
      const brass = new THREE.MeshStandardMaterial({ color: 0xdca94a, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(0x3a2a08) });
      const n = gold ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8), brass);
        b.position.set((i / (n - 1) - 0.5) * 0.5, 0.92, 0);
        g.add(b);
      }
    }

    g.add(makeGlow(beacon, gold || kit ? 2.2 : 1.7, 0.6));
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, got: false, gold, kit };
  }

  private makeSurvivor(x: number, z: number): Survivor {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xa98a63, roughness: 1, flatShading: true });
    const rags = new THREE.MeshStandardMaterial({ color: 0x6a5436, roughness: 1, flatShading: true });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), rags);
    torso.position.y = 0.9;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.55;
    g.add(torso, head, makeGlow(0x9dffd0, 2.6, 0.55));
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.22, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })
    );
    beam.position.y = 3.6;
    const label = makeLabel("SURVIVOR", "#9dffd0");
    label.position.y = 2.5;
    g.add(beam, label);
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, taken: false };
  }

  private makeGuard(center?: { x: number; z: number }): Guard {
    const g = new THREE.Group();
    const flesh = new THREE.MeshStandardMaterial({ color: 0x35402c, roughness: 1, flatShading: true });
    const coat = new THREE.MeshStandardMaterial({ color: 0x232a1c, roughness: 1, flatShading: true });
    // A hunched, gaunt patroller — reads as a threat, not a tidy soldier.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.0, 0.4), coat);
    torso.position.set(0, 0.95, 0);
    torso.rotation.x = 0.28; // hunched forward
    torso.castShadow = true;
    const hump = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.34), coat);
    hump.position.set(0, 1.2, -0.16);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), flesh);
    head.position.set(0, 1.5, 0.26); // jutting ahead
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.26), flesh);
    jaw.position.set(0, 1.36, 0.42);
    jaw.rotation.x = 0.4;
    // Long gaunt arms hanging forward.
    for (const ax of [-0.42, 0.42]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.9, 0.13), flesh);
      arm.position.set(ax, 0.85, 0.24);
      arm.rotation.x = 0.5;
      g.add(arm);
    }
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.18), coat);
      leg.position.set(lx, 0.4, 0);
      g.add(leg);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: AMBER, fog: false });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
      eye.position.set(ex, 1.53, 0.46);
      g.add(eye);
    }
    // A faint eye-glow so cones read back to a face in the dark.
    const eyeGlow = makeGlow(AMBER, 0.9, 0.5);
    eyeGlow.position.set(0, 1.52, 0.5);
    g.add(torso, hump, head, jaw, eyeGlow);
    const coneMat = new THREE.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const cone = new THREE.Mesh(this.coneGeo, coneMat);
    cone.position.y = 0.06;
    g.add(cone);
    this.group.add(g);
    const patrol: { x: number; z: number }[] = [];
    for (let i = 0; i < 3; i++) {
      if (center) {
        let pt = { x: 0, z: 0 };
        for (let tries = 0; tries < 12; tries++) {
          pt = {
            x: clamp(center.x + this.ctx.rng.range(-7, 7), AREA.minX + 2, AREA.maxX - 2),
            z: clamp(center.z + this.ctx.rng.range(-7, 7), AREA.minZ + 2, AREA.maxZ - 2),
          };
          if (!this.inWall(pt.x, pt.z, 1.2)) break;
        }
        patrol.push(pt);
      } else {
        patrol.push(this.freeSpot(AREA.minZ + 2, AREA.maxZ - 8));
      }
    }
    return { group: g, cone, coneMat, eyeMat, x: patrol[0].x, z: patrol[0].z, facing: 0, patrol, pIdx: 1, state: "patrol", alertT: 0, speed: 3, stuckT: 0, px: patrol[0].x, pz: patrol[0].z, invX: 0, invZ: 0, dead: false };
  }

  start(): void {
    this.active = true;
    this.done = false;
    this.got = 0;
    this.timeLeft = DURATION;
    this.stamina = 1;
    this.spotted = false;
    this.ax = 0;
    this.az = -7;
    this.group.visible = true;
    this.groanT = 4;
    this.stunT = 0;
    this.graceT = 0;
    this.lureCd = 0;
    this.catches = 0;
    this.extractOpen = false;
    this.extractMarker.visible = false;
    this.lightOn = true;
    this.tdGuard = null;
    this.tdProgress = 0;
    this.takedownFrac = 0;
    this.promptText = "";
    for (const l of this.lures) this.group.remove(l.glow);
    this.lures = [];
    this.ctx.world.setDawn(0.08); // dark + moody, but still navigable
    // Thicker fog + a dimmer, tighter flashlight = scarier.
    this.fogPrev = this.ctx.stage.fog.density;
    this.ctx.stage.fog.density = 0.038;
    this.light.distance = 23;
    this.light.intensity = this.lightDefault;

    for (const c of this.crates) this.group.remove(c.group);
    this.crates = [];
    for (let i = 0; i < CRATES; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 10);
      this.crates.push(this.makeCrate(s.x, s.z, i < 2, false));
    }
    for (let i = 0; i < KIT_CRATES; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 14);
      this.crates.push(this.makeCrate(s.x, s.z, false, true));
    }

    // A survivor deep in the map, heavily guarded.
    if (this.survivor) this.group.remove(this.survivor.group);
    const sv = this.freeSpot(AREA.minZ + 4, AREA.minZ + 20);
    this.survivor = this.makeSurvivor(sv.x, sv.z);

    for (const g of this.guards) this.group.remove(g.group);
    this.guards = [];
    for (let i = 0; i < 5; i++) this.guards.push(this.makeGuard());
    for (let i = 0; i < 3; i++) this.guards.push(this.makeGuard(sv)); // defending the survivor
    for (const g of this.guards) g.group.position.set(g.x, 0, g.z);

    this.ctx.cam.mode = "topdown";
    this.ctx.cam.target.set(this.ax, 0, this.az);
    this.ctx.cam.snap();
  }

  update(dt: number): void {
    if (!this.active || this.done) return;
    this.t += dt;
    this.timeLeft -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.graceT > 0) this.graceT -= dt;
    if (this.lureCd > 0) this.lureCd -= dt;
    this.promptText = "";

    // Flashlight toggle (F) — off = harder to be seen, but you see far less.
    if (this.ctx.input.pressed("KeyF")) {
      this.lightOn = !this.lightOn;
      this.light.intensity = this.lightOn ? this.lightDefault : 3.5;
      this.ctx.events.emit("SFX", { id: "ui_click" });
    }

    // Move (sneak, or sprint while stamina holds) — frozen briefly when grabbed.
    const a = this.stunT > 0 ? this.tmp.set(0, 0) : this.ctx.input.axis(this.tmp);
    const moving = a.x !== 0 || a.y !== 0;
    const sprint = this.ctx.input.down("ShiftLeft") && this.stamina > 0.05 && moving;
    this.stamina = sprint ? Math.max(0, this.stamina - dt * 0.55) : Math.min(1, this.stamina + dt * 0.3);
    const sp = sprint ? SPRINT : SNEAK;
    let nx = this.ax + a.x * sp * dt;
    let nz = this.az + a.y * sp * dt;
    nx = clamp(nx, AREA.minX, AREA.maxX);
    nz = clamp(nz, AREA.minZ, AREA.maxZ);
    for (const w of WALLS) [nx, nz] = pushOutAABB(nx, nz, AV_R, w);
    this.ax = nx;
    this.az = nz;
    this.avatar.position.set(this.ax, 0, this.az);
    if (moving) {
      this.avatar.rotation.y = Math.atan2(a.x, a.y);
    }

    // Hidden when tucked into an alcove — guards can't see you there.
    this.hidden = false;
    for (const h of this.hideZones) {
      if ((h.x - this.ax) ** 2 + (h.z - this.az) ** 2 < HIDE_R * HIDE_R) {
        this.hidden = true;
        break;
      }
    }
    if (this.hidden) this.promptText = "HIDDEN";

    // Throw a distraction lure (Q) — pulls patrolling guards toward the noise.
    if (this.ctx.input.pressed("KeyQ") && this.lureCd <= 0) this.throwLure();
    this.updateLures(dt);

    // Sprinting is loud: nearby patrolling guards investigate the sound.
    if (sprint && moving) {
      for (const g of this.guards) {
        if (g.dead || g.state === "chase") continue;
        if ((g.x - this.ax) ** 2 + (g.z - this.az) ** 2 < NOISE_SPRINT * NOISE_SPRINT) {
          g.state = "investigate";
          g.invX = this.ax;
          g.invZ = this.az;
          g.alertT = 3;
        }
      }
    }

    // Stealth takedown (hold E behind an unaware guard).
    this.updateTakedown(dt);

    // Guards
    let anyChase = false;
    for (const g of this.guards) this.updateGuard(g, dt);
    for (const g of this.guards) if (!g.dead && g.state === "chase") anyChase = true;
    if (anyChase && !this.spotted) {
      this.spotted = true;
      this.ctx.events.emit("SFX", { id: "scream" });
      this.ctx.stage.punch(0.3);
      this.ctx.cam.addTrauma(0.3);
    } else if (!anyChase) {
      this.spotted = false;
    }

    // Ambient dread — distant groans
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 3 + this.ctx.rng.next() * 5;
      this.ctx.events.emit("SFX", { id: "groan", pan: this.ctx.rng.range(-1, 1) });
    }
    // Pulsing red emergency lights
    for (const r of this.redLights) {
      const n = 0.5 + 0.5 * Math.sin(this.t * 3 + r.phase);
      r.light.intensity = 1 + n * 4;
      r.glow.material.opacity = 0.25 + n * 0.45;
    }
    // Failing neon signs — a stuttering flicker.
    for (const s of this.signs) {
      const f = Math.sin(this.t * 17 + s.phase) * Math.sin(this.t * 4.3 + s.phase * 2);
      const on = f > -0.4;
      const lvl = on ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 40)) : 0.05;
      s.mat.opacity = lvl;
      s.glow.material.opacity = lvl * 0.7;
    }
    // Time pressure — heartbeat in the final stretch
    if (this.timeLeft < 12 && Math.floor(this.timeLeft) !== Math.floor(this.timeLeft + dt)) {
      this.ctx.events.emit("SFX", { id: "heartbeat" });
    }

    // Grab crates (supply, gold, or repair-kit)
    for (const c of this.crates) {
      if (c.got) continue;
      c.group.rotation.y += dt * 0.5;
      const dx = c.x - this.ax;
      const dz = c.z - this.az;
      if (dx * dx + dz * dz >= 2.4) continue;
      c.got = true;
      c.group.visible = false;
      if (c.kit) {
        this.ctx.run.repairKits++;
        this.ctx.floaters.spawn(c.x, 1.6, c.z, "+REPAIR KIT", "crit");
        this.ctx.fx.burst(c.x, 1.0, c.z, 18, 0x5fd8ff, { speed: 8, up: 6, life: 0.6, size: 7 });
        this.ctx.events.emit("SFX", { id: "pickup" });
        continue;
      }
      this.got++;
      if (c.gold) {
        this.ctx.stats.cratesGrabbed += 1;
        this.ctx.run.addAmmo(80); // ammo cache
        this.ctx.floaters.spawn(c.x, 1.6, c.z, "+AMMO CACHE", "crit");
        this.ctx.fx.burst(c.x, 1.0, c.z, 22, 0xffd84a, { speed: 8, up: 6, life: 0.6, size: 7 });
      } else {
        this.ctx.run.addAmmo(35);
        this.ctx.floaters.spawn(c.x, 1.5, c.z, "+AMMO", "heal");
        this.ctx.fx.burst(c.x, 0.9, c.z, 12, AMBER, { speed: 6, up: 5, life: 0.5 });
      }
      this.ctx.events.emit("CRATE_GRABBED", { got: this.got, total: this.total });
      this.ctx.events.emit("SFX", { id: "pickup" });
    }

    // Rescue the survivor (recruit a new ally)
    if (this.survivor && !this.survivor.taken) {
      const dx = this.survivor.x - this.ax;
      const dz = this.survivor.z - this.az;
      if (dx * dx + dz * dz < 3.0) {
        this.survivor.taken = true;
        this.survivor.group.visible = false;
        const name = SURVIVOR_NAMES.find((n) => !this.ctx.run.companions.includes(n));
        if (name && this.ctx.run.companions.length < 4) {
          const trait = this.ctx.run.recruit(name);
          const t = TRAITS[trait];
          this.ctx.floaters.spawn(this.survivor.x, 2.2, this.survivor.z, `RESCUED ${name} · ${t.label.toUpperCase()}`, "crit");
          this.ctx.events.emit("NOTICE", { text: `${name} joins you`, sub: `${t.label} — "${t.recruitLine}"` });
        } else {
          this.ctx.floaters.spawn(this.survivor.x, 2, this.survivor.z, "RESCUED!", "heal");
        }
        this.ctx.fx.burst(this.survivor.x, 1.2, this.survivor.z, 24, 0x7dffb0, { speed: 9, up: 7, life: 0.7, size: 8 });
        this.ctx.events.emit("SFX", { id: "meter_full" });
      }
    }

    // Extraction beat: once the supplies are secured an exit opens near the road
    // — reach it before the clock for a clean-getaway bonus.
    if (!this.extractOpen && this.got >= this.total) {
      this.extractOpen = true;
      this.extractMarker.visible = true;
      this.ctx.floaters.spawn(this.extractZone.x, 2.6, this.extractZone.z, "SUPPLIES SECURED — REACH THE EXIT", "crit");
      this.ctx.events.emit("SFX", { id: "meter_full" });
    }
    if (this.extractOpen) {
      this.extractMarker.rotation.y += dt * 1.5;
      this.promptText = "↑ REACH THE EXIT";
      const edx = this.extractZone.x - this.ax;
      const edz = this.extractZone.z - this.az;
      if (edx * edx + edz * edz < 6.25) {
        this.ctx.run.addAmmo(60);
        this.ctx.floaters.spawn(this.ax, 2.4, this.az, "CLEAN EXTRACTION  +AMMO", "crit");
        this.finish();
        return;
      }
    }

    this.ctx.cam.target.set(this.ax, 0, this.az);
    if (this.timeLeft <= 0) this.finish();
  }

  /** Throw a clattering lure ahead — patrolling guards go investigate the noise. */
  private throwLure(): void {
    this.lureCd = LURE_CD;
    let lx = clamp(this.ax + Math.sin(this.avatar.rotation.y) * 10, AREA.minX + 2, AREA.maxX - 2);
    let lz = clamp(this.az + Math.cos(this.avatar.rotation.y) * 10, AREA.minZ + 2, AREA.maxZ - 2);
    for (const w of WALLS) [lx, lz] = pushOutAABB(lx, lz, 0.6, w);
    const glow = makeGlow(0x9dd0ff, 2.4, 0.7);
    glow.position.set(lx, 0.6, lz);
    this.group.add(glow);
    this.lures.push({ x: lx, z: lz, life: 4, glow });
    this.ctx.fx.burst(lx, 0.5, lz, 8, 0x9dd0ff, { speed: 5, up: 3, life: 0.4, size: 5 });
    this.ctx.events.emit("SFX", { id: "crate" });
    for (const g of this.guards) {
      if (g.dead || g.state === "chase") continue;
      if ((g.x - lx) ** 2 + (g.z - lz) ** 2 < LURE_RANGE * LURE_RANGE) {
        g.state = "investigate";
        g.invX = lx;
        g.invZ = lz;
        g.alertT = 4;
      }
    }
  }

  private updateLures(dt: number): void {
    for (let i = this.lures.length - 1; i >= 0; i--) {
      const l = this.lures[i];
      l.life -= dt;
      const p = 0.5 + 0.5 * Math.sin(this.t * 12);
      (l.glow.material as THREE.SpriteMaterial).opacity = Math.max(0, (l.life / 4) * (0.35 + p * 0.45));
      if (l.life <= 0) {
        this.group.remove(l.glow);
        this.lures.splice(i, 1);
      }
    }
  }

  /** Hold E behind an unaware guard to take it down silently. */
  private updateTakedown(dt: number): void {
    let target: Guard | null = null;
    let bestD = TD_RANGE * TD_RANGE;
    for (const g of this.guards) {
      if (g.dead || g.state === "chase") continue;
      const dx = this.ax - g.x;
      const dz = this.az - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD) continue;
      const dot = dx * Math.sin(g.facing) + dz * Math.cos(g.facing); // <0 ⇒ behind
      if (dot >= 0) continue;
      bestD = d2;
      target = g;
    }
    if (!target) {
      this.tdGuard = null;
      this.tdProgress = 0;
      this.takedownFrac = 0;
      return;
    }
    this.promptText = "HOLD  E  — TAKEDOWN";
    if (this.ctx.input.down("KeyE")) {
      if (this.tdGuard !== target) {
        this.tdGuard = target;
        this.tdProgress = 0;
      }
      this.tdProgress += dt;
      this.takedownFrac = clamp(this.tdProgress / TD_TIME, 0, 1);
      if (this.tdProgress >= TD_TIME) this.doTakedown(target);
    } else {
      this.tdGuard = null;
      this.tdProgress = 0;
      this.takedownFrac = 0;
    }
  }

  /** Grabbed by a chaser: a setback (drop supplies, shoved free, brief grace),
   * unless it's the final grab — then you're dragged off and the run ends. */
  private onCaught(g: Guard): void {
    this.catches++;
    this.ctx.cam.addTrauma(0.5);
    this.ctx.stage.punch(0.45);
    this.ctx.events.emit("SFX", { id: "player_hurt" });
    if (this.catches >= MAX_CATCHES) {
      this.ctx.floaters.spawn(this.ax, 2.2, this.az, "DRAGGED OFF!", "warn");
      this.finish();
      return;
    }
    const drop = Math.min(this.got, 2);
    this.got = Math.max(0, this.got - drop);
    this.ctx.floaters.spawn(this.ax, 2.2, this.az, drop > 0 ? `GRABBED!  -${drop} SUPPLIES` : "GRABBED!", "warn");
    this.stunT = 0.6;
    this.graceT = 2.2;
    // Shove the guard back and reset it so you get a moment to break away.
    const bdx = g.x - this.ax;
    const bdz = g.z - this.az;
    const bd = Math.hypot(bdx, bdz) || 1;
    g.x = clamp(g.x + (bdx / bd) * 6, AREA.minX, AREA.maxX);
    g.z = clamp(g.z + (bdz / bd) * 6, AREA.minZ, AREA.maxZ);
    g.state = "patrol";
    g.alertT = 0;
  }

  private doTakedown(g: Guard): void {
    g.dead = true;
    g.group.visible = false;
    this.tdGuard = null;
    this.tdProgress = 0;
    this.takedownFrac = 0;
    this.ctx.floaters.spawn(g.x, 2, g.z, "TAKEDOWN", "crit");
    this.ctx.fx.burst(g.x, 1.0, g.z, 14, 0x7a0d10, { speed: 6, up: 5, life: 0.5, size: 6 });
    this.ctx.events.emit("SFX", { id: "shove" });
  }

  private losBlocked(ax: number, az: number, bx: number, bz: number): boolean {
    for (const w of WALLS) if (segAABB(ax, az, bx, bz, w)) return true;
    return false;
  }

  /** Distance to the first wall along `facing` (so the cone stops at cover). */
  private coneDist(gx: number, gz: number, facing: number): number {
    const bx = gx + Math.sin(facing) * VISION_RANGE;
    const bz = gz + Math.cos(facing) * VISION_RANGE;
    let best = VISION_RANGE;
    for (const w of WALLS) {
      const t = segEntryT(gx, gz, bx, bz, w);
      if (t !== Infinity) best = Math.min(best, t * VISION_RANGE);
    }
    return Math.max(2, best);
  }

  private updateGuard(g: Guard, dt: number): void {
    if (g.dead) {
      g.cone.visible = false;
      return;
    }
    // Detection: in range, within the cone, not behind a wall — and not while
    // you're hidden in an alcove or in the brief grace window after a grab. The
    // flashlight gives you away: with it off, guards spot you only up close.
    const dx = this.ax - g.x;
    const dz = this.az - g.z;
    const dist = Math.hypot(dx, dz);
    const range = this.lightOn ? VISION_RANGE : VISION_RANGE * 0.5;
    let sees = false;
    if (dist < range && !this.hidden && this.graceT <= 0) {
      const toAvatar = Math.atan2(dx, dz);
      let diff = toAvatar - g.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < CONE_HALF && !this.losBlocked(g.x, g.z, this.ax, this.az)) sees = true;
    }

    if (sees) {
      g.state = "chase";
      g.alertT = 2.5;
    } else if (g.state === "chase") {
      // Lose the chase faster while you're tucked out of sight.
      g.alertT -= dt * (this.hidden ? 4 : 1);
      if (g.alertT <= 0) g.state = "patrol";
    } else if (g.state === "investigate") {
      g.alertT -= dt;
      if (g.alertT <= 0 || Math.hypot(g.invX - g.x, g.invZ - g.z) < 1.6) g.state = "patrol";
    }

    let tx: number;
    let tz: number;
    let speed: number;
    if (g.state === "chase") {
      tx = this.ax;
      tz = this.az;
      speed = 8.2;
      // Caught — a setback, not an instant loss: you're grabbed, drop some
      // supplies, get shoved free with a brief grace. Too many grabs and you're
      // dragged off (run ends).
      if (dist < 1.4 && this.graceT <= 0) {
        this.onCaught(g);
        return;
      }
    } else if (g.state === "investigate") {
      tx = g.invX;
      tz = g.invZ;
      speed = g.speed * 1.3;
    } else {
      const p = g.patrol[g.pIdx];
      tx = p.x;
      tz = p.z;
      speed = g.speed;
      if (Math.hypot(p.x - g.x, p.z - g.z) < 1.5) g.pIdx = (g.pIdx + 1) % g.patrol.length;
    }

    const mdx = tx - g.x;
    const mdz = tz - g.z;
    const md = Math.hypot(mdx, mdz) || 1;
    g.x += (mdx / md) * speed * dt;
    g.z += (mdz / md) * speed * dt;
    g.x = clamp(g.x, AREA.minX, AREA.maxX);
    g.z = clamp(g.z, AREA.minZ, AREA.maxZ);
    // Guards collide with walls too (no walking through cover).
    for (const w of WALLS) [g.x, g.z] = pushOutAABB(g.x, g.z, 0.55, w);

    // Stuck recovery: if a patrolling guard hasn't progressed (wedged on a wall),
    // pick a fresh patrol target so it never jams (e.g. around the survivor).
    if (g.state === "patrol") {
      const moved = Math.hypot(g.x - g.px, g.z - g.pz);
      g.stuckT = moved < 0.04 ? g.stuckT + dt : 0;
      if (g.stuckT > 1.3) {
        g.patrol[g.pIdx] = this.freeSpot(AREA.minZ + 2, AREA.maxZ - 6);
        g.stuckT = 0;
      }
    } else {
      g.stuckT = 0;
    }
    g.px = g.x;
    g.pz = g.z;

    g.facing = Math.atan2(mdx, mdz);
    g.group.position.set(g.x, 0, g.z);
    g.group.rotation.y = g.facing;

    // Cone visual: amber when patrolling, red + brighter when hunting; clipped
    // to the nearest wall so it visibly stops at cover (matches the LoS check).
    const hunting = g.state === "chase";
    const cd = this.coneDist(g.x, g.z, g.facing);
    g.cone.scale.set(1, 1, cd / VISION_RANGE);
    g.coneMat.color.set(hunting ? THREAT : AMBER);
    g.coneMat.opacity = hunting ? 0.28 : 0.14;
    g.eyeMat.color.set(hunting ? THREAT : AMBER);
  }

  private nearestCrate(): Crate | null {
    let best: Crate | null = null;
    let bestD = Infinity;
    for (const c of this.crates) {
      if (c.got || c.kit) continue; // lead to supplies, not bonus kits
      const d = (c.x - this.ax) ** 2 + (c.z - this.az) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  nearestCratePos(): THREE.Vector3 | null {
    const c = this.nearestCrate();
    return c ? this.nearest.set(c.x, 1, c.z) : null;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.active = false;
    this.timeLeft = Math.max(0, this.timeLeft);
    this.ctx.stats.cratesGrabbed += this.got;
    const frac = this.got / this.total;
    this.ctx.events.emit("DAY_DONE", { tier: tierFromFrac(frac), frac });
  }

  debugComplete(): void {
    if (!this.active) return;
    this.got = this.total;
    this.finish();
  }

  getResult(): { tier: Tier; frac: number } {
    const frac = this.got / this.total;
    return { tier: tierFromFrac(frac), frac };
  }

  hide(): void {
    this.group.visible = false;
    this.active = false;
    this.ctx.stage.fog.density = this.fogPrev;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Object count in the run scene — a coarse regression guard that the floor,
   * walls, dressing, guards and crates all built. */
  get objectCount(): number {
    return this.group.children.length;
  }
}
