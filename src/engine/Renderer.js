import { events } from './EventBus.js';

// Adapted from roguehero2/src/Renderer.js. Owns shake, vignette, scanlines,
// chromatic-aberration flash. Lighting (flashlight cone, muzzle-flash punches)
// will live in a separate Lighting.js module added in M6.

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeElapsed = 0;
    this._shakenScope = false;

    this._scanlineCanvas = null;
    this._vignetteCanvas = null;

    this.caTimer = 0;
    this._caMaxTime = 0.16;
    this._caGradL = null;
    this._caGradR = null;
    this._caGradW = 0;

    // Dread-driven post-process modulation. Combat scene writes these each
    // frame; menus/maps leave them at defaults.
    //   dreadVignette: target alpha for the outer vignette ring (0–1)
    //   dreadCA:       slow heartbeat-rate CA pulse on top of caTimer spikes
    this.dreadVignette = 0.72;
    this.dreadCA = 0;
    this._vignetteIntensityCached = -1;

    events.on('SCREEN_SHAKE', ({ duration, intensity }) => {
      this.shakeDuration = Math.max(this.shakeDuration - this.shakeElapsed, duration);
      this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
      this.shakeElapsed = 0;
    });
    events.on('CA_FLASH', () => { this.caTimer = this._caMaxTime; });
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    // Invalidate caches — they're sized to canvas dims.
    this._scanlineCanvas = null;
    this._vignetteCanvas = null;
    this._caGradL = null;
    this._caGradR = null;
  }

  updateShake(dt) {
    if (this.shakeElapsed < this.shakeDuration) {
      this.shakeElapsed += dt;
      const decay = 1 - this.shakeElapsed / this.shakeDuration;
      this.shakeOffsetX = (Math.random() * 2 - 1) * this.shakeIntensity * decay * 14;
      this.shakeOffsetY = (Math.random() * 2 - 1) * this.shakeIntensity * decay * 14;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeIntensity = 0;
    }
  }

  updateCA(dt) {
    if (this.caTimer > 0) this.caTimer = Math.max(0, this.caTimer - dt);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  // Shake is applied via translate; skip save/restore when intensity is zero.
  beginShakeScope() {
    if (this.shakeOffsetX === 0 && this.shakeOffsetY === 0) {
      this._shakenScope = false;
      return;
    }
    this._shakenScope = true;
    this.ctx.save();
    this.ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
  }

  endShakeScope() {
    if (this._shakenScope) this.ctx.restore();
  }

  // ── Cached scanline overlay ──
  _buildScanlines() {
    const off = document.createElement('canvas');
    off.width = this.width; off.height = this.height;
    const ctx = off.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 1; y < this.height; y += 3) ctx.fillRect(0, y, this.width, 1);
    this._scanlineCanvas = off;
  }

  drawScanlines() {
    if (!this._scanlineCanvas || this._scanlineCanvas.width !== this.width) this._buildScanlines();
    this.ctx.drawImage(this._scanlineCanvas, 0, 0);
  }

  // ── Cached screen vignette ──
  // Cache key includes the current dreadVignette intensity so the cache is
  // only rebuilt when the dread bucket actually changes (every ~0.05 step).
  // That keeps us off the per-frame `createRadialGradient` allocation path.
  _buildVignette(intensity) {
    const off = document.createElement('canvas');
    off.width = this.width; off.height = this.height;
    const ctx = off.getContext('2d');
    const cx = this.width / 2, cy = this.height / 2;
    const grad = ctx.createRadialGradient(cx, cy, this.height * 0.22, cx, cy, this.height * 0.85);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${intensity.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
    this._vignetteCanvas = off;
    this._vignetteIntensityCached = intensity;
  }

  drawVignette() {
    const target = Math.max(0.5, Math.min(0.95, this.dreadVignette));
    const stale = !this._vignetteCanvas
      || this._vignetteCanvas.width !== this.width
      || Math.abs(target - this._vignetteIntensityCached) > 0.05;
    if (stale) this._buildVignette(target);
    this.ctx.drawImage(this._vignetteCanvas, 0, 0);
  }

  // ── Edge CA flash — combines impact-spike (caTimer, set by CA_FLASH
  // events) with a slow dread-driven heartbeat pulse (dreadCA, written by
  // CombatScene each frame). Spike dominates when both are active.
  drawCAFlash() {
    const spike = this.caTimer > 0 ? this.caTimer / this._caMaxTime : 0;
    const dread = Math.max(0, Math.min(1, this.dreadCA || 0));
    const p = Math.max(spike, dread * 0.7);
    if (p <= 0) return;
    const w = this.width, h = this.height;
    if (!this._caGradL || this._caGradW !== w) {
      this._caGradW = w;
      this._caGradL = this.ctx.createLinearGradient(0, 0, w * 0.28, 0);
      this._caGradL.addColorStop(0, 'rgba(255,30,60,1)');
      this._caGradL.addColorStop(1, 'rgba(255,30,60,0)');
      this._caGradR = this.ctx.createLinearGradient(w * 0.72, 0, w, 0);
      this._caGradR.addColorStop(0, 'rgba(60,180,255,0)');
      this._caGradR.addColorStop(1, 'rgba(60,180,255,1)');
    }
    this.ctx.save();
    this.ctx.globalAlpha = p * 0.42;
    this.ctx.fillStyle = this._caGradL;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.fillStyle = this._caGradR;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();
  }

  drawCursor(mx, my, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color || '#ffffff';
    ctx.fillStyle   = color || '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.9;
    const s = 9, g = 4;
    ctx.beginPath();
    ctx.moveTo(mx - g - s, my); ctx.lineTo(mx - g, my);
    ctx.moveTo(mx + g,     my); ctx.lineTo(mx + g + s, my);
    ctx.moveTo(mx, my - g - s); ctx.lineTo(mx, my - g);
    ctx.moveTo(mx, my + g);     ctx.lineTo(mx, my + g + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
