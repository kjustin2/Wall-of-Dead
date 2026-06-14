// Cheap full-screen post effects: animated film grain (a tiled noise pattern
// nudged each frame) and a chromatic-aberration flash on impacts. Both degrade
// to no-ops without an offscreen canvas (headless).

export class PostFX {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.noise = null;
    this.pattern = null;
    try {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 160;
      const x = c.getContext('2d');
      const img = x.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (170 + Math.random() * 85) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      this.noise = c;
    } catch (e) { this.noise = null; }
  }

  grain(ctx, amount, t) {
    if (!this.noise) return;
    if (!this.pattern) {
      try { this.pattern = ctx.createPattern(this.noise, 'repeat'); } catch (e) { this.noise = null; return; }
    }
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.globalCompositeOperation = 'overlay';
    const ox = ((Math.sin(t * 53.1) * 0.5 + 0.5) * 160) | 0;
    const oy = ((Math.cos(t * 41.7) * 0.5 + 0.5) * 160) | 0;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = this.pattern;
    ctx.fillRect(0, 0, this.w + 160, this.h + 160);
    ctx.restore();
  }

  // Red/cyan split fringe at the screen edges; intensity 0..1.
  aberration(ctx, intensity) {
    if (intensity <= 0.01) return;
    const W = this.w, H = this.h;
    const a = Math.min(0.4, intensity * 0.4);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(1, `rgba(200,40,40,${a})`);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
