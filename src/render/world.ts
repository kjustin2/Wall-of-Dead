import * as THREE from "three";
import type { Stage } from "./stage";
import { makeGlow, groundTexture } from "./textures";
import { clamp, clamp01, lerp } from "../core/math";
import { FIELD, PAL, CHOKES } from "../config";
import { Rng } from "../core/rng";

const EMBERS = 150;

/**
 * One environment theme per leg of the road to the safe zone. Geometry is shared
 * across all of them; a zone only swaps the sky/fog/ground/window/ember colors
 * and the weather, so each night reads as a distinct place. `name` shows on the
 * road map + the night banner.
 */
/** A signature visual feature toggled per act so the campaign reads as three
 * places, not just one dark map with different text. */
export type ZoneFeature = "outer" | "flood" | "haven";

export interface Zone {
  name: string;
  skyTopNight: number;
  skyHorizonNight: number;
  skyTopDawn: number;
  skyHorizonDawn: number;
  fogNight: number;
  fogDawn: number;
  key: number; // key-light night tint
  ground: number;
  window: number;
  ember: number;
  storm: boolean;
  /** Night-fog density multiplier (>1 = thicker, murkier; <1 = clearer). */
  fogScale: number;
  /** A standout per-zone feature (standing water / ashfall / cold floodlights). */
  feature: ZoneFeature;
}

/** The themed name of a leg (1-based night), for the road map + night banner. */
export function zoneName(night: number): string {
  return ZONES[clamp(night - 1, 0, ZONES.length - 1)].name;
}

export const ZONES: Zone[] = [
  {
    name: "THE OUTER ROAD",
    skyTopNight: 0x04050a,
    skyHorizonNight: 0x120b08,
    skyTopDawn: 0x243049,
    skyHorizonDawn: 0xb5683a,
    fogNight: 0x0b0908,
    fogDawn: 0x55382d,
    key: 0xffc08a,
    ground: 0x110f0c,
    window: 0xb05a24,
    ember: 0xff7a32,
    storm: true,
    fogScale: 1.08,
    feature: "outer",
  },
  {
    name: "THE FLOODLINE",
    skyTopNight: 0x02060a,
    skyHorizonNight: 0x06121a,
    skyTopDawn: 0x1c3a44,
    skyHorizonDawn: 0x6a9ab0,
    fogNight: 0x08161c,
    fogDawn: 0x3a5560,
    key: 0x9ad8e8,
    ground: 0x0a161c,
    window: 0x3a8a9a,
    ember: 0x6ad8ff,
    storm: true,
    fogScale: 1.2,
    feature: "flood",
  },
  {
    name: "HAVEN APPROACH",
    skyTopNight: 0x060a12,
    skyHorizonNight: 0x0e1a24,
    skyTopDawn: 0x2a4a5a,
    skyHorizonDawn: 0xbcdcec,
    fogNight: 0x0c141c,
    fogDawn: 0x4a6470,
    key: 0xcfe6f4,
    ground: 0x141a20,
    window: 0x9fd8ff,
    ember: 0x8fbfe0,
    storm: false,
    fogScale: 0.9,
    feature: "haven",
  },
];

/**
 * The static night environment around the wall: ground, the rampart the
 * defender stands on, a procedural gradient sky with moon + stars + a distant
 * treeline, drifting embers, and a dusk→dawn color/light progression that ramps
 * over the night (selling the "hold until dawn" goal). The wall itself lives in
 * game/wall.ts; everything else is here.
 */
export class World {
  private group = new THREE.Group();
  // Field-level clutter (wrecks, barrels, rubble, fences) — hidden during the
  // day so the stealth run doesn't collide-lessly overlap them.
  private field = new THREE.Group();
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private moon: THREE.Group;
  private dawnGlow: THREE.Sprite;
  private embers: THREE.Points;
  private emberVel: Float32Array;
  private flicker: { light: THREE.PointLight; glow: THREE.Sprite; base: number; phase: number; x: number; z: number }[] = [];
  private mist: { mesh: THREE.Mesh; speed: number }[] = [];
  private clouds: { sprite: THREE.Sprite; speed: number }[] = [];
  private searchlights: { pivot: THREE.Group; phase: number; speed: number }[] = [];
  private horde: { mesh: THREE.Group; phase: number; vx: number }[] = [];
  private rain!: THREE.LineSegments;
  private rainX = new Float32Array(0);
  private rainY = new Float32Array(0);
  private rainZ = new Float32Array(0);
  private flashes: { sprite: THREE.Sprite; timer: number }[] = [];
  private lightningTimer = 9;
  private flashT = 0;
  /** main sets this to play thunder when a flash fires. */
  onFlash: (() => void) | null = null;
  /** photosensitivity-safe: suppresses lightning flashes. */
  reducedFx = false;
  /** Storm night = rain + lightning; clear night = dry + brighter moon. */
  private storm = true;
  private rng = new Rng(1337);
  private t = 0;
  private dawn = 0;

  private skyTopNight = new THREE.Color(0x03040a);
  private skyHorizonNight = new THREE.Color(0x080a12);
  private skyTopDawn = new THREE.Color(0x243049);
  private skyHorizonDawn = new THREE.Color(0xb5683a);
  private fogNight = new THREE.Color(PAL.fogNight);
  private fogDawn = new THREE.Color(PAL.fogDawn);
  // Captured at build time so setZone() can retint per night.
  private groundMat!: THREE.MeshStandardMaterial;
  private winMat!: THREE.MeshBasicMaterial;
  private keyNight = new THREE.Color(0xaecbe8);
  private fogScale = 1;
  // Base scene-light levels set by setDawn — the lightning flash adds onto THESE
  // (absolute), so a flash can't accumulate when setDawn isn't called every frame
  // (e.g. during the day's supply run, which previously left the lights stuck on).
  private litHemi = 0.26;
  private litKey = 0.3;
  // Per-zone signature features (built once, shown/hidden by setZone).
  private outerGroup = new THREE.Group();
  private waterGroup = new THREE.Group();
  private ashGroup = new THREE.Group();
  private ash!: THREE.Points;
  private ashY = new Float32Array(0);
  private havenGroup = new THREE.Group();

  constructor(private stage: Stage) {
    this.group.add(this.field);
    this.buildGround();
    this.buildRampart();
    this.sky = this.buildSky();
    this.skyMat = this.sky.material as THREE.ShaderMaterial;
    this.stars = this.buildStars();
    this.moon = this.buildMoon();
    this.dawnGlow = this.buildDawnGlow();
    this.buildRubble();
    this.buildChokes();
    this.buildProps();
    this.buildFieldDetail();
    this.buildAtmosphere();
    const e = this.buildEmbers();
    this.embers = e.points;
    this.emberVel = e.vel;
    this.buildZoneFeatures();
    stage.scene.add(this.group);
    this.setDawn(0);
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(420, 320, 1, 1);
    const gtex = groundTexture({ base: "#0b0f13", speck: "#171e25", cracks: 8, key: "field" });
    gtex.repeat.set(34, 26);
    const mat = new THREE.MeshStandardMaterial({
      color: PAL.ground,
      map: gtex,
      roughness: 0.95,
      metalness: 0.05,
    });
    this.groundMat = mat;
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -60;
    ground.receiveShadow = true;
    this.group.add(ground);

    // A few damp patches near the wall — slightly slick, but not mirror-glossy
    // (a high-spec puddle under the flashlight blooms into a blinding wedge).
    const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0a0f15, roughness: 0.5, metalness: 0.25 });
    for (const [px, pz, pr] of [
      [-14, -8, 3.4],
      [9, -16, 2.6],
      [18, -5, 2.0],
      [-6, -26, 3.0],
    ] as [number, number, number][]) {
      const pud = new THREE.Mesh(new THREE.CircleGeometry(pr, 20), puddleMat);
      pud.rotation.x = -Math.PI / 2;
      pud.position.set(px, 0.025, pz);
      pud.scale.y = 0.7;
      this.field.add(pud); // night-only — hidden during the day's supply run
    }

    // Faint guide grid out in the field — eerie, catches the eye.
    const grid = new THREE.GridHelper(260, 52, 0x1c2630, 0x10161c);
    grid.position.set(0, 0.02, -70);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    this.group.add(grid);
  }

  private buildRampart(): void {
    // A low wooden firing step the defender stands on, just behind the barrier.
    const geo = new THREE.BoxGeometry(FIELD.wallHalf * 2 + 4, FIELD.rampartHeight, 5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e2419, roughness: 1, flatShading: true });
    const ramp = new THREE.Mesh(geo, mat);
    ramp.position.set(0, FIELD.rampartHeight / 2, FIELD.rampartZ + 1.4);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.group.add(ramp);
  }

  private buildProps(): void {
    const rust = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8, metalness: 0.3, flatShading: true });
    const tire = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 });

    // The road the convoy came in on — wet asphalt strip down the field.
    const roadTex = groundTexture({ base: "#0e1216", speck: "#1c232a", cracks: 10, key: "road" });
    roadTex.repeat.set(2, 20);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 130),
      new THREE.MeshStandardMaterial({ color: 0x121519, map: roadTex, roughness: 0.72, metalness: 0.12 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.015, -64);
    road.receiveShadow = true;
    this.field.add(road); // night-only — the day lot lays its own floor over this
    for (let i = 0; i < 16; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.02, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x6a6038, roughness: 1, emissive: new THREE.Color(0x161203) })
      );
      dash.position.set(0, 0.04, -6 - i * 8);
      this.field.add(dash);
    }

    // Wrecked vehicles strewn along the road (field clutter — hidden by day)
    const carSpots = [
      [-9, -22, 0.4],
      [11, -40, -0.6],
      [-13, -58, 1.4],
      [8, -74, 2.6],
      [-4, -90, 0.2],
    ];
    for (const [cx, cz, ry] of carSpots) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 4.6), rust);
      body.position.y = 0.7;
      body.castShadow = true;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 2.2), metal);
      cabin.position.set(0, 1.4, -0.2);
      car.add(body, cabin);
      for (const wx of [-1.1, 1.1])
        for (const wz of [-1.6, 1.6]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), tire);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.4, wz);
          car.add(w);
        }
      car.position.set(cx, 0, cz);
      car.rotation.y = ry;
      this.field.add(car);
    }

    // Burning barrels — warm rim light + embers near the wall ends and field
    const barrelSpots = [
      [-19, 1.6, true],
      [19, 1.6, true],
      [-15, -30, true],
      [14, -52, false],
    ];
    for (const [bx, bz, lit] of barrelSpots as [number, number, boolean][]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), rust);
      barrel.position.set(bx, 0.6, bz);
      barrel.castShadow = true;
      this.field.add(barrel);
      if (lit) {
        const fire = new THREE.PointLight(0xff7a2a, 6, 16, 2);
        fire.position.set(bx, 1.5, bz);
        this.field.add(fire);
        const flame = makeGlow(0xffa64a, 2.4, 0.8);
        flame.position.set(bx, 1.5, bz);
        this.field.add(flame);
        this.flicker.push({ light: fire, glow: flame, base: 6, phase: this.rng.range(0, 10), x: bx, z: bz });
      }
    }

    // Broken streetlights along the road — leaning poles, a few still flickering
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x171a1d, roughness: 1, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -14 - i * 13;
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), poleMat);
      pole.position.y = 3.25;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), poleMat);
      arm.position.set(side * -1.1, 6.3, 0);
      lamp.add(pole, arm);
      lamp.position.set(side * 8.5, 0, z);
      lamp.rotation.z = this.rng.range(-0.08, 0.08);
      this.field.add(lamp);
      if (i % 2 === 0) {
        const head = new THREE.PointLight(0xbfd0ff, 3, 14, 2);
        head.position.set(side * (8.5 - side * 2.2), 6.2, z);
        this.field.add(head);
        const glow = makeGlow(0xcfe0ff, 1.6, 0.7);
        glow.position.copy(head.position);
        this.field.add(glow);
        this.flicker.push({ light: head, glow, base: 3, phase: this.rng.range(0, 10), x: head.position.x, z });
      }
    }

    // Broken chain-link fence posts down the field edges
    const postMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 1, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, this.rng.range(1.4, 2.6), 0.16), postMat);
      post.position.set(side * 27 + this.rng.range(-1, 1), 1, -8 - i * 4.2);
      post.rotation.z = this.rng.range(-0.2, 0.2);
      this.field.add(post);
    }

    this.buildSkyline();
  }

  /** Extra field silhouettes: dead gnarled trees along the edges, scattered
   * concrete jersey barriers, and drooping power cables between the streetlights.
   * All in the `field` group so the day's stealth run doesn't overlap them. */
  private buildFieldDetail(): void {
    const bark = new THREE.MeshStandardMaterial({ color: 0x12100c, roughness: 1, flatShading: true });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 1, flatShading: true });

    // Dead trees down both field edges, thinning into the dark.
    for (let i = 0; i < 9; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tx = side * this.rng.range(22, 30);
      const tz = -16 - i * 8 - this.rng.range(0, 4);
      const tree = new THREE.Group();
      const h = this.rng.range(4.5, 7.5);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, h, 6), bark);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      tree.add(trunk);
      const branches = 3 + Math.floor(this.rng.range(0, 3));
      for (let b = 0; b < branches; b++) {
        const bl = this.rng.range(1.2, 2.6);
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, bl, 5), bark);
        const by = h * this.rng.range(0.55, 0.95);
        branch.position.y = by;
        branch.rotation.z = this.rng.range(-1.1, 1.1);
        branch.rotation.y = this.rng.range(0, Math.PI);
        branch.translateY(bl * 0.4);
        tree.add(branch);
      }
      tree.position.set(tx, 0, tz);
      tree.rotation.y = this.rng.range(0, Math.PI);
      tree.rotation.z = this.rng.range(-0.08, 0.08);
      this.field.add(tree);
    }

    // Jersey barriers in a couple of loose clusters near the road.
    const barrierSpots: [number, number, number][] = [
      [-6, -18, 0.1],
      [-3.4, -18.4, 0.1],
      [7, -46, 1.5],
      [9.4, -45.4, 1.5],
      [-12, -64, 0.3],
    ];
    for (const [bx, bz, ry] of barrierSpots) {
      const b = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.9), concrete);
      base.position.y = 0.25;
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.42), concrete);
      top.position.y = 0.78;
      base.castShadow = true;
      top.castShadow = true;
      b.add(base, top);
      b.position.set(bx, 0, bz);
      b.rotation.y = ry;
      this.field.add(b);
    }

    // Drooping power cables between same-side streetlights (catenary lines).
    const cableMat = new THREE.LineBasicMaterial({ color: 0x080a0c, transparent: true, opacity: 0.7, fog: true });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z0 = -14 - i * 26;
        const z1 = z0 - 26;
        const x = side * 8.5;
        const pts: THREE.Vector3[] = [];
        const N = 10;
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          const sag = Math.sin(t * Math.PI) * 1.4;
          pts.push(new THREE.Vector3(x, 6.0 - sag, z0 + (z1 - z0) * t));
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(g, cableMat);
        line.frustumCulled = false;
        this.field.add(line);
      }
    }
  }

  /** A coherent ruined-city skyline: two depth layers, some windows still lit. */
  private buildSkyline(): void {
    const dark = new THREE.MeshStandardMaterial({ color: 0x05080a, roughness: 1 });
    const near = new THREE.MeshStandardMaterial({ color: 0x0a1014, roughness: 1, flatShading: true });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x6a4e24, fog: true });
    this.winMat = winMat;
    const farthest = new THREE.MeshStandardMaterial({ color: 0x03060a, roughness: 1 });
    const rows: { z: number; mat: THREE.Material; min: number; max: number; n: number; windows: boolean }[] = [
      { z: -205, mat: farthest, min: 30, max: 80, n: 16, windows: false },
      { z: -165, mat: dark, min: 22, max: 60, n: 18, windows: false },
      { z: -128, mat: near, min: 14, max: 38, n: 14, windows: true },
    ];
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const h = this.rng.range(row.min, row.max);
        const w = this.rng.range(8, 17);
        const x = this.rng.range(-150, 150);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 7), row.mat);
        b.position.set(x, h / 2, row.z - this.rng.range(0, 18));
        this.group.add(b);
        if (row.windows && this.rng.chance(0.7)) {
          // a scattering of lit windows on the +Z face
          const cols = Math.max(2, Math.floor(w / 3));
          const rowsW = Math.max(3, Math.floor(h / 5));
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rowsW; r++) {
              if (!this.rng.chance(0.22)) continue;
              const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), winMat);
              win.position.set(
                b.position.x + (c / (cols - 1) - 0.5) * (w - 2),
                2 + (r / (rowsW - 1)) * (h - 4),
                b.position.z + 3.6
              );
              this.group.add(win);
            }
          }
        }
      }
    }

    // Landmarks: a water tower and a radio mast break up the silhouette.
    const steel = new THREE.MeshStandardMaterial({ color: 0x070b0f, roughness: 1, flatShading: true });
    const tower = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 9, 10), steel);
    tank.position.y = 40;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7.5, 4, 10), steel);
    cone.position.y = 46;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 36, 5), steel);
      leg.position.set(Math.cos(a) * 5, 18, Math.sin(a) * 5);
      leg.rotation.z = Math.cos(a) * 0.12;
      leg.rotation.x = -Math.sin(a) * 0.12;
      tower.add(leg);
    }
    tower.add(tank, cone);
    tower.position.set(-86, 0, -150);
    this.group.add(tower);

    const mast = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 70, 6), steel);
    pole.position.y = 35;
    mast.add(pole);
    for (const my of [22, 40, 56]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.5), steel);
      cross.position.y = my;
      mast.add(cross);
    }
    // Blinking aircraft-warning beacon at the top.
    const beacon = makeGlow(0xff3030, 5, 0.9);
    beacon.position.y = 71;
    mast.add(beacon);
    mast.position.set(78, 0, -158);
    this.group.add(mast);
    this.beacon = beacon;
  }

  private beacon: THREE.Sprite | null = null;

  private buildSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(200, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: this.skyTopNight.clone() },
        uHorizon: { value: this.skyHorizonNight.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 1.2 + 0.05, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.65));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(geo, mat);
    this.group.add(sky);
    return sky;
  }

  private buildStars(): THREE.Points {
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Upper hemisphere, biased away from the horizon.
      const u = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(0.05, 0.95);
      const y = v;
      const r = Math.sqrt(1 - y * y);
      const rad = 188;
      pos[i * 3] = Math.cos(u) * r * rad;
      pos[i * 3 + 1] = y * rad;
      pos[i * 3 + 2] = Math.sin(u) * r * rad;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcfd8ff,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    return pts;
  }

  private buildMoon(): THREE.Group {
    const g = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 20, 20),
      new THREE.MeshBasicMaterial({ color: PAL.moon, fog: false })
    );
    g.add(moon);
    // A couple of faint craters for character (sized to the small disc).
    const craterMat = new THREE.MeshBasicMaterial({ color: 0xa8b0a0, fog: false });
    for (const [cx, cy, r] of [[-0.9, 0.7, 0.6], [1.0, -0.4, 0.8], [0.2, 1.2, 0.4]] as [number, number, number][]) {
      const crater = new THREE.Mesh(new THREE.CircleGeometry(r, 10), craterMat);
      crater.position.set(cx, cy, 3.2);
      g.add(crater);
    }
    // A small, soft halo — kept tight so bloom can't smear it into a wedge.
    const glow = makeGlow(0xb9cde8, 9, 0.22);
    glow.material.depthWrite = false;
    g.add(glow);
    // Small, high, and pushed to the corner of the sky — well clear of the
    // skyline so it never reads as a glaring disc among the buildings.
    g.position.set(-72, 120, -172);
    this.group.add(g);
    return g;
  }

  private buildDawnGlow(): THREE.Sprite {
    const glow = makeGlow(0xff9a4c, 280, 0);
    glow.position.set(0, 2, -165);
    glow.scale.set(360, 150, 1);
    this.group.add(glow);
    return glow;
  }

  /** Field clutter is hidden during the day's stealth run. */
  setFieldClutter(visible: boolean): void {
    this.field.visible = visible;
  }

  /** Pick the night's weather: a storm (rain + lightning) or a clear moonlit
   * night (dry, brighter moon, more stars). */
  setWeather(storm: boolean): void {
    this.storm = storm;
    this.rain.visible = storm;
    const moonGlow = this.moon.children[1] as THREE.Sprite;
    moonGlow.scale.setScalar(storm ? 64 : 92);
    for (const c of this.clouds) (c.sprite.material as THREE.SpriteMaterial).opacity = storm ? 0.5 : 0.22;
  }

  get isStorm(): boolean {
    return this.storm;
  }

  private buildRubble(): void {
    // Concrete rubble + chunks of debris (urban, not forest).
    const mat = new THREE.MeshStandardMaterial({ color: 0x161b1f, roughness: 1, flatShading: true });
    for (let i = 0; i < 34; i++) {
      const s = this.rng.range(0.4, 1.5);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      rock.position.set(this.rng.range(-50, 50), s * 0.35, this.rng.range(-86, -6));
      rock.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3));
      rock.scale.y = 0.5;
      rock.castShadow = true;
      this.field.add(rock);
    }
  }

  /** Solid wrecks at the CHOKES that the horde funnels around — a bus blocking
   * one lane, a rubble heap blocking another. Sized to match the steering spans. */
  private buildChokes(): void {
    const busBody = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 1, flatShading: true });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.5, metalness: 0.3 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 1, flatShading: true });

    // Choke 0 — a wrecked bus lying across the lane (length runs along X).
    const c0 = CHOKES[0];
    if (c0) {
      const bus = new THREE.Group();
      const len = c0.halfW * 2 - 1;
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, 2.8, 3), busBody);
      body.position.y = 1.5;
      body.castShadow = true;
      body.receiveShadow = true;
      const win = new THREE.Mesh(new THREE.BoxGeometry(len - 1.5, 0.85, 3.05), glassMat);
      win.position.y = 2.25;
      bus.add(body, win);
      for (const wx of [-len * 0.32, 0, len * 0.32])
        for (const wz of [-1.1, 1.1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12), tireMat);
          wheel.position.set(wx, 0.5, wz);
          bus.add(wheel);
        }
      bus.position.set(c0.x, 0, c0.z);
      bus.rotation.set(0, 0.12, 0.06);
      this.field.add(bus);
    }

    // Choke 1 — a rubble heap (toppled slab + boulders).
    const c1 = CHOKES[1];
    if (c1) {
      const heap = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(c1.halfW * 1.7, 2.6, 1.1), rubbleMat);
      slab.position.set(0, 1.1, 0);
      slab.rotation.z = 0.4;
      slab.castShadow = true;
      heap.add(slab);
      for (let i = 0; i < 9; i++) {
        const s = this.rng.range(0.6, 1.6);
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rubbleMat);
        rock.position.set(this.rng.range(-c1.halfW, c1.halfW), s * 0.4, this.rng.range(-c1.halfD, c1.halfD));
        rock.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3));
        rock.castShadow = true;
        heap.add(rock);
      }
      heap.position.set(c1.x, 0, c1.z);
      this.field.add(heap);
    }
  }

  private buildAtmosphere(): void {
    // Low-lying drifting ground mist
    const mistTex = makeGlow(0xffffff, 1).material.map;
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: mistTex,
        color: 0x2a3340,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        fog: true,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(this.rng.range(-50, 50), this.rng.range(0.4, 1.4), this.rng.range(-70, -4));
      this.group.add(m);
      this.mist.push({ mesh: m, speed: this.rng.range(0.6, 1.8) });
    }

    // Drifting dark clouds across the upper sky
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({
        map: mistTex,
        color: 0x12161f,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        fog: false,
      });
      const s = new THREE.Sprite(mat);
      s.scale.set(this.rng.range(50, 90), this.rng.range(20, 34), 1);
      s.position.set(this.rng.range(-120, 120), this.rng.range(48, 92), -150 - this.rng.range(0, 30));
      this.group.add(s);
      this.clouds.push({ sprite: s, speed: this.rng.range(1.2, 3) });
    }

    // (Removed the big sweeping searchlight beam cones — from the rampart camera
    // a beam sweeping toward you filled the screen with a giant additive "wedge"
    // of light that washed out the field. The horizon reads fine without them.)

    // A crashed transit bus near the wall — a focal landmark
    const bus = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a5a26, roughness: 1, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 11), bodyMat);
    body.position.y = 1.5;
    body.castShadow = true;
    const windows = new THREE.Mesh(
      new THREE.BoxGeometry(3.05, 0.9, 9),
      new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.5, metalness: 0.3 })
    );
    windows.position.y = 2.2;
    bus.add(body, windows);
    for (const wz of [-3.6, 0, 3.6])
      for (const wx of [-1.5, 1.5]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.5, wz);
        bus.add(wheel);
      }
    bus.position.set(-21, 0, -7);
    bus.rotation.set(0, 0.5, 0.18);
    this.field.add(bus);

    // A far-off ambient horde shambling along the horizon (never reaches you).
    const figMat = new THREE.MeshStandardMaterial({ color: 0x070a0c, roughness: 1, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const fig = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.4), figMat);
      body.position.y = 1.0;
      body.rotation.x = 0.2;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), figMat);
      head.position.y = 1.85;
      fig.add(body, head);
      fig.position.set(this.rng.range(-90, 90), 0, -98 - this.rng.range(0, 18));
      fig.rotation.y = this.rng.range(-0.5, 0.5);
      this.group.add(fig);
      this.horde.push({ mesh: fig, phase: this.rng.range(0, 6), vx: this.rng.range(-0.6, 0.6) });
    }

    // Rain — falling streaks for atmosphere
    const N = 320;
    this.rainX = new Float32Array(N);
    this.rainY = new Float32Array(N);
    this.rainZ = new Float32Array(N);
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      this.rainX[i] = this.rng.range(-45, 45);
      this.rainY[i] = this.rng.range(0, 32);
      this.rainZ[i] = this.rng.range(-46, 10);
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const rmat = new THREE.LineBasicMaterial({ color: 0x9ab4d0, transparent: true, opacity: 0.2, fog: true });
    this.rain = new THREE.LineSegments(rgeo, rmat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);

    // Distant battle: faint muzzle flashes blinking on the horizon (kept dim so
    // they read as far-off, not a glow band).
    for (let i = 0; i < 4; i++) {
      const s = makeGlow(0xffd9a0, 4, 0);
      s.position.set(this.rng.range(-120, 120), this.rng.range(6, 22), -150 - this.rng.range(0, 20));
      this.group.add(s);
      this.flashes.push({ sprite: s, timer: this.rng.range(1, 6) });
    }
  }

  private buildEmbers(): { points: THREE.Points; vel: Float32Array } {
    const pos = new Float32Array(EMBERS * 3);
    const vel = new Float32Array(EMBERS * 3);
    for (let i = 0; i < EMBERS; i++) {
      pos[i * 3] = this.rng.range(-45, 45);
      pos[i * 3 + 1] = this.rng.range(0, 20);
      pos[i * 3 + 2] = this.rng.range(-72, 4);
      vel[i * 3] = this.rng.range(-0.3, 0.3);
      vel[i * 3 + 1] = this.rng.range(0.4, 1.4);
      vel[i * 3 + 2] = this.rng.range(-0.2, 0.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff8a3a,
      size: 0.5,
      map: makeGlow(0xffffff, 1).material.map,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    return { points: pts, vel };
  }

  /**
   * Standout per-zone features, built once and toggled by setZone: a sheet of
   * standing water for the drowned Floodline, drifting ashfall for the Ashfields,
   * and cold floodlight pylons for the sterile safe-zone gate. Each is hidden by
   * default; only one is shown at a time so each act reads as its own place.
   */
  private buildZoneFeatures(): void {
    // --- Outer Road: road markings, flare pools, barricades, and fuel-yard shapes. ---
    const asphaltStripe = new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.28, depthWrite: false, fog: true });
    for (const x of [-13, 13]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 112), asphaltStripe);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.052, -58);
      this.outerGroup.add(stripe);
    }
    const flareMat = new THREE.MeshBasicMaterial({ color: 0xff4a24, fog: false });
    for (const [x, z] of [
      [-28, -22],
      [26, -31],
      [-18, -54],
      [22, -66],
    ] as [number, number][]) {
      const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), flareMat);
      flare.rotation.z = Math.PI / 2;
      flare.position.set(x, 0.16, z);
      const glow = makeGlow(0xff5a2c, 5.4, 0.42);
      glow.position.set(x, 0.45, z);
      this.outerGroup.add(flare, glow);
    }
    const barricadeMat = new THREE.MeshStandardMaterial({ color: 0x3a2417, roughness: 1, flatShading: true });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffb24a, fog: false });
    for (const [x, z, r] of [
      [-33, -38, -0.35],
      [34, -50, 0.28],
      [-26, -75, 0.18],
    ] as [number, number, number][]) {
      const rail = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 0.35), barricadeMat);
      plank.position.y = 1.0;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.07, 0.39), stripeMat);
      stripe.position.y = 1.22;
      const legA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, 0.28), barricadeMat);
      const legB = legA.clone();
      legA.position.set(-2.4, 0.45, 0);
      legB.position.set(2.4, 0.45, 0);
      rail.add(plank, stripe, legA, legB);
      rail.position.set(x, 0, z);
      rail.rotation.y = r;
      this.outerGroup.add(rail);
    }
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x262a2d, roughness: 0.85, metalness: 0.28, flatShading: true });
    for (const [x, z, s] of [
      [-46, -88, 1.0],
      [42, -92, 0.82],
    ] as [number, number, number][]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8 * s, 1.8 * s, 11 * s, 14), tankMat);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(x, 1.8 * s, z);
      tank.castShadow = true;
      this.outerGroup.add(tank);
    }
    this.outerGroup.visible = false;
    this.group.add(this.outerGroup);

    // --- Floodline: a translucent sheet of standing water over the field. ---
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0a3a44,
      transparent: true,
      opacity: 0.55,
      roughness: 0.18,
      metalness: 0.6,
      depthWrite: false,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(180, 150), waterMat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(0, 0.06, -56);
    this.waterGroup.add(sheet);
    // A few brighter ripples so the flat sheet reads as wet, not glass.
    const rippleMat = new THREE.MeshBasicMaterial({ color: 0x2a8aa0, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (let i = 0; i < 7; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(this.rng.range(1, 2), this.rng.range(2.4, 4), 20), rippleMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(this.rng.range(-40, 40), 0.07, this.rng.range(-80, -8));
      this.waterGroup.add(r);
    }
    this.waterGroup.visible = false;
    this.group.add(this.waterGroup);

    // --- Ashfields: a slow grey ashfall drifting down across the field. ---
    const N = 220;
    const pos = new Float32Array(N * 3);
    this.ashY = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = this.rng.range(-50, 50);
      pos[i * 3 + 1] = this.rng.range(0, 30);
      pos[i * 3 + 2] = this.rng.range(-78, 6);
      this.ashY[i] = pos[i * 3 + 1];
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const ash = new THREE.Points(
      ashGeo,
      new THREE.PointsMaterial({ color: 0xb0a59a, size: 0.42, map: makeGlow(0xffffff, 1).material.map, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true, fog: true })
    );
    ash.frustumCulled = false;
    this.ash = ash;
    this.ashGroup.add(ash);
    this.ashGroup.visible = false;
    this.group.add(this.ashGroup);

    // --- Haven's Gate: cold floodlight pylons flanking the wall (the "safe" read). ---
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 1, flatShading: true });
    for (const px of [-22, -8, 8, 22]) {
      const pylon = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 9, 6), poleMat);
      pole.position.y = 4.5;
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.7), poleMat);
      head.position.set(0, 9, -0.4);
      head.rotation.x = 0.5;
      pylon.add(pole, head);
      const lamp = new THREE.PointLight(0xcfe6ff, 7, 30, 2);
      lamp.position.set(0, 9, -1.4);
      const glow = makeGlow(0xdff0ff, 3.4, 0.85);
      glow.position.copy(lamp.position);
      pylon.add(lamp, glow);
      pylon.position.set(px, 0, -6);
      this.havenGroup.add(pylon);
    }
    this.havenGroup.visible = false;
    this.group.add(this.havenGroup);
  }

  /**
   * Re-theme the environment for a given night (1-based). Each leg of the road to
   * the safe zone reads as a distinct place — the cold outer wall, a toxic
   * refinery, a drowned floodline, the ash-choked fields, then the sterile
   * safe-zone gate — by retinting sky/fog/ground/windows/embers, swapping the
   * weather, and toggling one signature feature. Geometry is shared.
   */
  setZone(night: number): void {
    const z = ZONES[clamp(night - 1, 0, ZONES.length - 1)];
    this.fogScale = z.fogScale;
    this.outerGroup.visible = z.feature === "outer";
    this.waterGroup.visible = z.feature === "flood";
    this.ashGroup.visible = z.feature === "haven";
    this.havenGroup.visible = z.feature === "haven";
    this.skyTopNight.setHex(z.skyTopNight);
    this.skyHorizonNight.setHex(z.skyHorizonNight);
    this.skyTopDawn.setHex(z.skyTopDawn);
    this.skyHorizonDawn.setHex(z.skyHorizonDawn);
    this.fogNight.setHex(z.fogNight);
    this.fogDawn.setHex(z.fogDawn);
    this.keyNight.setHex(z.key);
    this.groundMat.color.setHex(z.ground);
    this.winMat.color.setHex(z.window);
    (this.embers.material as THREE.PointsMaterial).color.setHex(z.ember);
    this.setWeather(z.storm);
    this.setDawn(this.dawn); // re-apply with the new palette
  }

  /** 0 = deep night, 1 = full dawn. Lerps sky, fog, lights, moon, embers. */
  setDawn(t: number): void {
    this.dawn = clamp01(t);
    const d = this.dawn;
    (this.skyMat.uniforms.uTop.value as THREE.Color)
      .copy(this.skyTopNight)
      .lerp(this.skyTopDawn, d);
    (this.skyMat.uniforms.uHorizon.value as THREE.Color)
      .copy(this.skyHorizonNight)
      .lerp(this.skyHorizonDawn, d);
    this.stage.fog.color.copy(this.fogNight).lerp(this.fogDawn, d);
    this.stage.fog.density = lerp(0.032, 0.012, d) * this.fogScale;
    this.stage.scene.background = this.stage.fog.color;
    this.stage.hemiLight.intensity = lerp(0.26, 0.8, d);
    this.stage.keyLight.intensity = lerp(0.3, 1.05, d);
    this.stage.keyLight.color.copy(this.keyNight).lerp(new THREE.Color(0xffd9a8), d);
    // Remember the resting levels so the lightning flash adds absolutely, not
    // cumulatively (the supply-run/pause "lights stuck bright" bug).
    this.litHemi = this.stage.hemiLight.intensity;
    this.litKey = this.stage.keyLight.intensity;
    (this.stars.material as THREE.PointsMaterial).opacity = lerp(0.5, 0, d);
    const moonGlow = this.moon.children[1] as THREE.Sprite;
    (this.moon.children[0] as THREE.Mesh).visible = d < 0.85;
    moonGlow.material.opacity = lerp(0.45, 0, d);
    // The big horizon "sun" glow only blooms at the actual dawn (report screen),
    // never during the night — so the field doesn't develop a bright wedge.
    this.dawnGlow.material.opacity = Math.max(0, d - 0.45) * 1.7;
  }

  update(dt: number): void {
    this.t += dt;
    const arr = this.embers.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < EMBERS; i++) {
      let y = arr.getY(i) + this.emberVel[i * 3 + 1] * dt;
      let x = arr.getX(i) + (this.emberVel[i * 3] + Math.sin(this.t + i) * 0.2) * dt;
      let z = arr.getZ(i) + this.emberVel[i * 3 + 2] * dt;
      if (y > 22) {
        y = 0;
        x = this.rng.range(-45, 45);
        z = this.rng.range(-72, 4);
      }
      arr.setXYZ(i, x, y, z);
    }
    arr.needsUpdate = true;
    // Embers fade as dawn comes.
    (this.embers.material as THREE.PointsMaterial).opacity = lerp(0.6, 0.05, this.dawn);

    // Ashfall (Ashfields only) — slow grey drift downward, recycled at the floor.
    if (this.ashGroup.visible) {
      const ap = this.ash.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < this.ashY.length; i++) {
        let y = this.ashY[i] - (2.6 + (i % 5) * 0.4) * dt;
        if (y < 0) y += 30;
        this.ashY[i] = y;
        ap.setXYZ(i, ap.getX(i) + Math.sin(this.t * 0.6 + i) * 0.18 * dt, y, ap.getZ(i));
      }
      ap.needsUpdate = true;
      (this.ash.material as THREE.PointsMaterial).opacity = lerp(0.5, 0.08, this.dawn);
    }
    // Standing water (Floodline only) — a faint shimmer on the sheet.
    if (this.waterGroup.visible) {
      const sheet = this.waterGroup.children[0] as THREE.Mesh;
      (sheet.material as THREE.MeshStandardMaterial).opacity = 0.45 + 0.12 * Math.sin(this.t * 0.8);
    }

    // Barrel fires flicker.
    for (const f of this.flicker) {
      const n = 0.78 + Math.sin(this.t * 13 + f.phase) * 0.12 + Math.sin(this.t * 27 + f.phase * 2) * 0.08;
      f.light.intensity = f.base * n * (1 - this.dawn * 0.6);
      f.glow.material.opacity = (0.55 * n + 0.2) * (1 - this.dawn * 0.5);
      const s = 2.0 + n * 0.7;
      f.glow.scale.set(s, s, 1);
    }

    // Drifting mist + clouds (wrap across the field/sky)
    for (const m of this.mist) {
      m.mesh.position.x += m.speed * dt;
      if (m.mesh.position.x > 60) m.mesh.position.x = -60;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = (0.06 + 0.08 * (0.5 + 0.5 * Math.sin(this.t * 0.3 + m.speed))) * (1 - this.dawn * 0.4);
    }
    for (const c of this.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 140) c.sprite.position.x = -140;
    }

    // Rain (storm nights only)
    if (this.storm) {
    const rp = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < this.rainY.length; i++) {
      let y = this.rainY[i] - 30 * dt;
      if (y < 0) y += 32;
      this.rainY[i] = y;
      const x = this.rainX[i];
      const z = this.rainZ[i];
      rp.setXYZ(i * 2, x, y, z);
      rp.setXYZ(i * 2 + 1, x - 0.12, y - 0.7, z);
    }
    rp.needsUpdate = true;
    (this.rain.material as THREE.LineBasicMaterial).opacity = lerp(0.22, 0.06, this.dawn);
    }

    // Radio-mast beacon: a slow red blink.
    if (this.beacon) {
      const b = (Math.sin(this.t * 2.2) + 1) * 0.5;
      this.beacon.material.opacity = (0.2 + b * b * 0.8) * (1 - this.dawn * 0.7);
    }

    // Distant battle flashes
    for (const f of this.flashes) {
      f.timer -= dt;
      if (f.timer <= 0) {
        f.timer = this.rng.range(1.5, 6);
        f.sprite.material.opacity = this.rng.range(0.12, 0.3) * (1 - this.dawn);
      } else {
        f.sprite.material.opacity = Math.max(0, f.sprite.material.opacity - dt * 3);
      }
    }

    // Ambient horde shuffle + sway
    for (const h of this.horde) {
      h.mesh.rotation.z = Math.sin(this.t * 1.5 + h.phase) * 0.12;
      h.mesh.position.x += h.vx * dt;
      if (h.mesh.position.x > 95) h.mesh.position.x = -95;
      else if (h.mesh.position.x < -95) h.mesh.position.x = 95;
    }

    // Sweeping searchlights
    for (const s of this.searchlights) {
      s.pivot.rotation.y = Math.sin(this.t * s.speed + s.phase) * 0.9;
      const vis = 1 - this.dawn;
      (s.pivot.children[0] as THREE.Mesh).visible = vis > 0.3;
    }

    // Distant lightning (storm nights only): a quick flash + delayed thunder
    if (this.storm && this.dawn < 0.55 && !this.reducedFx) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.rng.range(11, 26);
        this.flashT = 0.2;
        this.onFlash?.();
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT) / 0.2;
      const boost = f * (0.55 + 0.45 * Math.sin(this.t * 70));
      // Absolute (base + boost), never += — so a flash during the day (where
      // setDawn isn't re-applied each frame) decays back instead of sticking on.
      this.stage.hemiLight.intensity = this.litHemi + boost * 1.8;
      this.stage.keyLight.intensity = this.litKey + boost * 1.4;
    }
  }
}
