import * as THREE from "three";
import type { Stage } from "./stage";
import { makeGlow } from "./textures";
import { clamp01, lerp } from "../core/math";
import { FIELD, PAL } from "../config";
import { Rng } from "../core/rng";

const EMBERS = 150;

/**
 * The static night environment around the wall: ground, the rampart the
 * defender stands on, a procedural gradient sky with moon + stars + a distant
 * treeline, drifting embers, and a dusk→dawn color/light progression that ramps
 * over the night (selling the "hold until dawn" goal). The wall itself lives in
 * game/wall.ts; everything else is here.
 */
export class World {
  private group = new THREE.Group();
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
  private lightningTimer = 9;
  private flashT = 0;
  /** main sets this to play thunder when a flash fires. */
  onFlash: (() => void) | null = null;
  private rng = new Rng(1337);
  private t = 0;
  private dawn = 0;

  private skyTopNight = new THREE.Color(0x05070e);
  private skyHorizonNight = new THREE.Color(0x141426);
  private skyTopDawn = new THREE.Color(0x243049);
  private skyHorizonDawn = new THREE.Color(0xb5683a);

  constructor(private stage: Stage) {
    this.buildGround();
    this.buildRampart();
    this.sky = this.buildSky();
    this.skyMat = this.sky.material as THREE.ShaderMaterial;
    this.stars = this.buildStars();
    this.moon = this.buildMoon();
    this.dawnGlow = this.buildDawnGlow();
    this.buildTreeline();
    this.buildRocks();
    this.buildProps();
    this.buildAtmosphere();
    const e = this.buildEmbers();
    this.embers = e.points;
    this.emberVel = e.vel;
    stage.scene.add(this.group);
    this.setDawn(0);
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(420, 320, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: PAL.ground,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -60;
    ground.receiveShadow = true;
    this.group.add(ground);

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

    // The road the convoy came in on — a darker asphalt strip down the field.
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 130),
      new THREE.MeshStandardMaterial({ color: 0x121519, roughness: 1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.015, -64);
    road.receiveShadow = true;
    this.group.add(road);
    for (let i = 0; i < 16; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.02, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x6a6038, roughness: 1, emissive: new THREE.Color(0x161203) })
      );
      dash.position.set(0, 0.04, -6 - i * 8);
      this.group.add(dash);
    }

    // Wrecked vehicles strewn along the road
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
      this.group.add(car);
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
      this.group.add(barrel);
      if (lit) {
        const fire = new THREE.PointLight(0xff7a2a, 6, 16, 2);
        fire.position.set(bx, 1.5, bz);
        this.group.add(fire);
        const flame = makeGlow(0xffa64a, 2.4, 0.8);
        flame.position.set(bx, 1.5, bz);
        this.group.add(flame);
        this.flicker.push({ light: fire, glow: flame, base: 6, phase: this.rng.range(0, 10), x: bx, z: bz });
      }
    }

    // Distant skyline silhouette behind the treeline
    const sky = new THREE.MeshStandardMaterial({ color: 0x05080a, roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const h = this.rng.range(14, 46);
      const b = new THREE.Mesh(new THREE.BoxGeometry(this.rng.range(8, 16), h, 6), sky);
      b.position.set(this.rng.range(-150, 150), h / 2, -150 - this.rng.range(0, 24));
      this.group.add(b);
    }

    // Broken chain-link fence posts down the field edges
    const postMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 1, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, this.rng.range(1.4, 2.6), 0.16), postMat);
      post.position.set(side * 27 + this.rng.range(-1, 1), 1, -8 - i * 4.2);
      post.rotation.z = this.rng.range(-0.2, 0.2);
      this.group.add(post);
    }
  }

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
      new THREE.SphereGeometry(10, 32, 32),
      new THREE.MeshBasicMaterial({ color: PAL.moon, fog: false })
    );
    g.add(moon);
    // Craters on the visible face (toward +Z, where the field looks from).
    const craterMat = new THREE.MeshBasicMaterial({ color: 0xb7c0ad, fog: false });
    const craters: [number, number, number, number][] = [
      [-2.5, 2, 9.4, 1.6],
      [3, -1, 9.3, 2.2],
      [0.5, 3.5, 9.2, 1.1],
      [-3.5, -3, 9.0, 1.3],
      [2, 4.5, 8.9, 0.9],
    ];
    for (const [cx, cy, cz, r] of craters) {
      const crater = new THREE.Mesh(new THREE.CircleGeometry(r, 12), craterMat);
      crater.position.set(cx, cy, cz);
      crater.lookAt(cx * 2, cy * 2, cz + 6);
      g.add(crater);
    }
    const glow = makeGlow(0xdfeaff, 64, 0.85);
    glow.material.depthWrite = false;
    g.add(glow);
    g.position.set(-62, 66, -150);
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

  private buildTreeline(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x070b0d, roughness: 1 });
    for (let i = 0; i < 60; i++) {
      const x = this.rng.range(-180, 180);
      const z = -120 - this.rng.range(0, 30) - Math.abs(x) * 0.1;
      const h = this.rng.range(8, 20);
      const tree = new THREE.Mesh(new THREE.ConeGeometry(this.rng.range(2, 4.5), h, 6), mat);
      tree.position.set(x, h / 2, z);
      tree.rotation.y = this.rng.range(0, Math.PI);
      this.group.add(tree);
    }
  }

  private buildRocks(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0e1418, roughness: 1, flatShading: true });
    for (let i = 0; i < 40; i++) {
      const s = this.rng.range(0.4, 1.6);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      rock.position.set(this.rng.range(-50, 50), s * 0.4, this.rng.range(-78, -6));
      rock.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3));
      rock.castShadow = true;
      this.group.add(rock);
    }
  }

  private buildAtmosphere(): void {
    // Low-lying drifting ground mist
    const mistTex = makeGlow(0xffffff, 1).material.map;
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: mistTex,
        color: 0x3b4654,
        transparent: true,
        opacity: 0.12,
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

    // Distant sweeping searchlight beams
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xbcd6ff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const spots: [number, number, number][] = [
      [-95, -120, 0.34],
      [82, -135, -0.4],
    ];
    for (const [sx, sz, tilt] of spots) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 1, sz);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 80, 18, 1, true), beamMat);
      beam.position.y = 40;
      beam.rotation.x = Math.PI; // wide at top, narrow at the source
      beam.position.z = 6;
      pivot.rotation.z = tilt;
      pivot.add(beam);
      // A bright source at the base
      const src = makeGlow(0xcfe0ff, 4, 0.7);
      src.position.set(0, 1.5, 0);
      pivot.add(src);
      this.group.add(pivot);
      this.searchlights.push({ pivot, phase: this.rng.range(0, 6), speed: this.rng.range(0.25, 0.45) });
    }

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
    this.group.add(bus);

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
    this.stage.fog.color.set(PAL.fogNight).lerp(new THREE.Color(PAL.fogDawn), d);
    this.stage.fog.density = lerp(0.017, 0.01, d);
    this.stage.scene.background = this.stage.fog.color;
    this.stage.hemiLight.intensity = lerp(0.8, 1.4, d);
    this.stage.keyLight.intensity = lerp(0.62, 1.5, d);
    this.stage.keyLight.color.set(0xaecbe8).lerp(new THREE.Color(0xffd9a8), d);
    (this.stars.material as THREE.PointsMaterial).opacity = lerp(0.9, 0, d);
    const moonGlow = this.moon.children[1] as THREE.Sprite;
    (this.moon.children[0] as THREE.Mesh).visible = d < 0.85;
    moonGlow.material.opacity = lerp(0.8, 0, d);
    this.dawnGlow.material.opacity = d * 0.9;
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

    // Distant lightning (night only): a quick flash + delayed thunder
    if (this.dawn < 0.55) {
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
      this.stage.hemiLight.intensity += boost * 1.8;
      this.stage.keyLight.intensity += boost * 1.4;
    }
  }
}
