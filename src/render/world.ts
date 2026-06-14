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
    // The raised platform the defender walks on, just behind the wall.
    const geo = new THREE.BoxGeometry(FIELD.wallHalf * 2 + 6, FIELD.rampartHeight, 9);
    const mat = new THREE.MeshStandardMaterial({ color: PAL.rampart, roughness: 0.95 });
    const ramp = new THREE.Mesh(geo, mat);
    ramp.position.set(0, FIELD.rampartHeight / 2, FIELD.rampartZ + 2.5);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.group.add(ramp);

    // A low back parapet with sandbag bumps for depth behind the player.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.wallHalf * 2 + 6, 1.4, 0.8),
      new THREE.MeshStandardMaterial({ color: PAL.wallDark, roughness: 1 })
    );
    back.position.set(0, 0.7 + FIELD.rampartHeight, FIELD.rampartZ + 6.6);
    back.castShadow = true;
    this.group.add(back);
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
      new THREE.SphereGeometry(7, 24, 24),
      new THREE.MeshBasicMaterial({ color: PAL.moon, fog: false })
    );
    const glow = makeGlow(0xdfeaff, 46, 0.8);
    glow.material.depthWrite = false;
    g.add(moon, glow);
    g.position.set(-58, 64, -150);
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
  }
}
