// Lighting overlay. Renders to a half-resolution offscreen canvas, punches
// "light holes" in a dark vignette using `destination-out`, then upscales.
// Half-res (mirror of roguehero2's _mapGridCache pattern) keeps the cost
// roughly 4× cheaper than rendering at full canvas size.
//
// Usage from CombatScene.render, AFTER drawing the world but BEFORE the HUD:
//   lighting.beginFrame(ctx);
//   lighting.addLight(player.x, player.y, 130, 1.0);              // flashlight glow
//   lighting.addCone(player.x, player.y, player.aim, 0.6, 280);    // flashlight cone
//   for each muzzle flash → lighting.addLight(...)
//   lighting.commit(ctx);

const SCALE = 0.5;            // 0.5 = half-resolution → 4× faster
const MAX_LIGHTS = 8;         // cap on dynamic light sources per frame

export class Lighting {
  constructor() {
    this._lightCanvas = null;
    this._lightCtx = null;
    this._w = 0; this._h = 0;
    // Bumped from 0.78 → 0.84 for the horror tone shift. Per-floor themes
    // can override via FloorDef.theme.darkness (e.g., basement = 0.92).
    this.darkness = 0.84;     // 0 = no shadows, 1 = pitch-black between lights
    this.enabled = true;
    this._lightsThisFrame = 0;
  }

  // Deterministic flicker — returns a 0..1 modulation. Caller passes a
  // unique seed string per light source so multiple flickering lights
  // pulse out of phase with each other. Used by FuseBox shorts and any
  // other "tube about to die" effects.
  flicker(seed, freq = 6, depth = 0.5) {
    let h = 0;
    if (typeof seed === 'string') {
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    } else if (typeof seed === 'number') {
      h = seed | 0;
    }
    const t = performance.now() * 0.001 * freq + (h & 0xff) * 0.05;
    // Two sines + a fast jitter — the jitter is what sells "fluorescent
    // tube" rather than a smooth pulse.
    const base = 0.5 + 0.5 * Math.sin(t);
    const jitter = ((h ^ Math.floor(t * 13)) & 0xf) / 15;
    return 1 - depth * (0.6 * base + 0.4 * jitter);
  }

  _ensure(w, h) {
    if (this._lightCanvas && this._w === w && this._h === h) return;
    this._w = w; this._h = h;
    this._lightCanvas = document.createElement('canvas');
    this._lightCanvas.width  = Math.floor(w * SCALE);
    this._lightCanvas.height = Math.floor(h * SCALE);
    this._lightCtx = this._lightCanvas.getContext('2d');
  }

  beginFrame(ctx) {
    if (!this.enabled) return;
    this._ensure(ctx.canvas.width, ctx.canvas.height);
    const lc = this._lightCtx;
    lc.globalCompositeOperation = 'source-over';
    // Fill the light canvas with darkness — anything we draw next using
    // destination-out punches transparency into this layer.
    lc.fillStyle = `rgba(8, 6, 8, ${this.darkness})`;
    lc.fillRect(0, 0, this._lightCanvas.width, this._lightCanvas.height);
    lc.globalCompositeOperation = 'destination-out';
    this._lightsThisFrame = 0;
  }

  // Radial light — punches a soft round hole.
  addLight(x, y, radius, intensity) {
    if (!this.enabled) return;
    if (this._lightsThisFrame >= MAX_LIGHTS) return;
    this._lightsThisFrame++;
    const lc = this._lightCtx;
    const sx = x * SCALE, sy = y * SCALE, sr = radius * SCALE;
    const grad = lc.createRadialGradient(sx, sy, 0, sx, sy, sr);
    const a = Math.max(0, Math.min(1, intensity != null ? intensity : 1));
    grad.addColorStop(0,   `rgba(0,0,0,${a})`);
    grad.addColorStop(0.6, `rgba(0,0,0,${a * 0.55})`);
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    lc.fillStyle = grad;
    lc.beginPath();
    lc.arc(sx, sy, sr, 0, Math.PI * 2);
    lc.fill();
  }

  // Cone light — flashlight beam projecting forward.
  addCone(x, y, angle, halfArc, length) {
    if (!this.enabled) return;
    if (this._lightsThisFrame >= MAX_LIGHTS) return;
    this._lightsThisFrame++;
    const lc = this._lightCtx;
    const sx = x * SCALE, sy = y * SCALE, sLen = length * SCALE;
    const grad = lc.createRadialGradient(sx, sy, 0, sx, sy, sLen);
    grad.addColorStop(0,   'rgba(0,0,0,0.95)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    lc.fillStyle = grad;
    lc.beginPath();
    lc.moveTo(sx, sy);
    lc.arc(sx, sy, sLen, angle - halfArc, angle + halfArc);
    lc.closePath();
    lc.fill();
  }

  // Composite the lighting layer onto the main canvas.
  commit(ctx) {
    if (!this.enabled) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._lightCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
