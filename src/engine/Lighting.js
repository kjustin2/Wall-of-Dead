// Deferred-ish 2D lighting. The world is drawn fully lit, then we overlay a
// darkness layer with light shapes punched out of it (destination-out), so
// only lit areas show through. This is what turns flat shapes into a moody
// night scene and makes the player's mouse-aimed flashlight the focal point.
//
// Headless-safe: if an offscreen canvas can't be created, every method is a
// no-op and the scene simply renders unlit.

export class Lighting {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.ok = false;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = w; this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d');
      this.ok = !!this.ctx;
    } catch (e) { this.ok = false; }
  }

  // Start a frame. ambient = how dark unlit areas are (0 none .. 1 pitch).
  begin(ambient = 0.86, tint = '4,7,10') {
    if (!this.ok) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = `rgba(${tint},${ambient})`;
    c.fillRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'destination-out';
  }

  // Soft round light (lantern, muzzle flash, glow).
  radial(x, y, r, strength = 1) {
    if (!this.ok || r <= 0) return;
    const c = this.ctx;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.6, `rgba(0,0,0,${strength * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
  }

  // Flashlight wedge from (x,y) along `angle`, reaching `len`, half-angle `spread`.
  cone(x, y, angle, len, spread = 0.5, strength = 1) {
    if (!this.ok || len <= 0) return;
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    const g = c.createRadialGradient(0, 0, 6, 0, 0, len);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.65, `rgba(0,0,0,${strength * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, len, -spread, spread);
    c.closePath();
    c.fill();
    // A tight hot core near the lens.
    this.radial(x, y, 46 * strength, strength * 0.9);
    c.restore();
  }

  // Composite the darkness layer over the main canvas.
  end(mainCtx) {
    if (!this.ok) return;
    mainCtx.globalCompositeOperation = 'source-over';
    mainCtx.drawImage(this.canvas, 0, 0);
  }
}
