import * as THREE from "three";

const CAP = 1400;
const GRAVITY = -26;

/**
 * One additive THREE.Points cloud, ring-buffer recycled, for every impact
 * effect (blood, gore, muzzle sparks, shell casings, acid). Additive + bloom
 * makes hits pop. Allocation-free in the hot path.
 */
export class Particles {
  readonly points: THREE.Points;
  private px = new Float32Array(CAP);
  private py = new Float32Array(CAP);
  private pz = new Float32Array(CAP);
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  private vz = new Float32Array(CAP);
  private life = new Float32Array(CAP);
  private maxLife = new Float32Array(CAP);
  private drag = new Float32Array(CAP);
  private cursor = 0;

  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private lifeAttr: THREE.BufferAttribute;
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(CAP * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(CAP * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(CAP), 1);
    this.lifeAttr = new THREE.BufferAttribute(new Float32Array(CAP), 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aColor", this.colAttr);
    geo.setAttribute("aSize", this.sizeAttr);
    geo.setAttribute("aLife", this.lifeAttr);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aLife;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vColor = aColor;
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * aLife * (320.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float soft = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vColor * (0.4 + vLife), soft * vLife);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: number,
    drag: number
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % CAP;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.tmp.set(color);
    this.colAttr.setXYZ(i, this.tmp.r, this.tmp.g, this.tmp.b);
    this.sizeAttr.setX(i, size);
  }

  burst(
    x: number,
    y: number,
    z: number,
    count: number,
    color: number,
    opts: { speed?: number; up?: number; life?: number; size?: number; drag?: number } = {}
  ): void {
    const speed = opts.speed ?? 7;
    const up = opts.up ?? 4;
    const life = opts.life ?? 0.6;
    const size = opts.size ?? 7;
    const drag = opts.drag ?? 1.5;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      this.emit(
        x,
        y,
        z,
        Math.cos(a) * r,
        up + Math.random() * up,
        Math.sin(a) * r,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.8),
        color,
        drag
      );
    }
  }

  /** Directional cone — muzzle sparks fly outward along (dx,dz). */
  cone(
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    count: number,
    color: number,
    speed = 18
  ): void {
    for (let k = 0; k < count; k++) {
      const spread = 0.5;
      const ang = Math.atan2(dz, dx) + (Math.random() - 0.5) * spread;
      const s = speed * (0.5 + Math.random());
      this.emit(
        x,
        y,
        z,
        Math.cos(ang) * s,
        (Math.random() - 0.3) * 3,
        Math.sin(ang) * s,
        0.18 + Math.random() * 0.16,
        6,
        color,
        4
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < CAP; i++) {
      let l = this.life[i];
      if (l <= 0) {
        this.lifeAttr.setX(i, 0);
        continue;
      }
      l -= dt;
      this.life[i] = l;
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k;
      this.vz[i] *= k;
      this.vy[i] = this.vy[i] * k + GRAVITY * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0) {
        this.py[i] = 0;
        this.vy[i] *= -0.3;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      this.posAttr.setXYZ(i, this.px[i], this.py[i], this.pz[i]);
      this.lifeAttr.setX(i, Math.max(0, l / this.maxLife[i]));
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < CAP; i++) this.lifeAttr.setX(i, 0);
    this.lifeAttr.needsUpdate = true;
  }
}
