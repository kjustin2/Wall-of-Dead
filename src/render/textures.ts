import * as THREE from "three";

let glowCache: THREE.Texture | null = null;

/** Soft radial-gradient sprite texture (white → transparent), cached + reused
 * for moon halo, light glows, flares. Procedural — no asset file. */
export function glowTexture(): THREE.Texture {
  if (glowCache) return glowCache;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowCache = tex;
  return tex;
}

/** Billboarded text label (canvas-rendered, procedural — no font file needed at
 * the texture level; the page fonts are used). For ally nameplates etc. */
export function makeLabel(text: string, color = "#7dffb0"): THREE.Sprite {
  const w = 256;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx) {
    // Auto-shrink the font so long labels (e.g. "⚠ SIDEARM — give a gun") fit the
    // fixed-width canvas instead of clipping at the edges.
    const maxW = w - 16; // a little horizontal padding
    let size = 34;
    ctx.font = `700 ${size}px Oswald, sans-serif`;
    while (size > 12 && ctx.measureText(text).width > maxW) {
      size -= 2;
      ctx.font = `700 ${size}px Oswald, sans-serif`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(4, 1, 1);
  return s;
}

// ---- Procedural surface textures (canvas-generated, no asset files) ----

const texCache: Record<string, THREE.Texture> = {};

/** A dark, grimy tiling surface: base color + speckle noise + a few cracks.
 * Used for the field ground and the rampart so surfaces read as real, not flat. */
export function groundTexture(opts: { base?: string; speck?: string; cracks?: number; key?: string } = {}): THREE.Texture {
  const key = opts.key ?? `g:${opts.base}:${opts.speck}:${opts.cracks}`;
  if (texCache[key]) return texCache[key];
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = opts.base ?? "#0c1014";
    ctx.fillRect(0, 0, S, S);
    // speckle / grain
    const speck = opts.speck ?? "#161c22";
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * 0.5;
      ctx.fillStyle = speck;
      ctx.globalAlpha = a;
      const r = Math.random() * 2.2;
      ctx.fillRect(Math.random() * S, Math.random() * S, r, r);
    }
    // lighter flecks
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#2a333c";
    for (let i = 0; i < 600; i++) ctx.fillRect(Math.random() * S, Math.random() * S, Math.random() * 1.6, Math.random() * 1.6);
    // cracks
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#05080a";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < (opts.cracks ?? 7); i++) {
      ctx.beginPath();
      let x = Math.random() * S;
      let y = Math.random() * S;
      ctx.moveTo(x, y);
      const segs = 3 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segs; s++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  texCache[key] = tex;
  return tex;
}

/** Cracked-concrete floor for the supply run, with optional painted hazard lines. */
export function concreteTexture(): THREE.Texture {
  if (texCache.concrete) return texCache.concrete;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1b2026";
    ctx.fillRect(0, 0, S, S);
    // panel grid (expansion joints)
    ctx.strokeStyle = "#0c1014";
    ctx.lineWidth = 3;
    for (const p of [0, S / 2]) {
      ctx.strokeRect(p - S / 4, p - S / 4, S / 2, S / 2);
    }
    ctx.strokeRect(2, 2, S - 4, S - 4);
    // grime + speckle
    for (let i = 0; i < 3000; i++) {
      ctx.globalAlpha = Math.random() * 0.4;
      ctx.fillStyle = Math.random() < 0.5 ? "#0e1217" : "#2a323a";
      ctx.fillRect(Math.random() * S, Math.random() * S, Math.random() * 2.4, Math.random() * 2.4);
    }
    // hazard stripe corner
    ctx.globalAlpha = 0.5;
    for (let i = -S; i < S; i += 22) {
      ctx.fillStyle = "#8a7a2a";
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 11, 0);
      ctx.lineTo(i + 11 - S, S);
      ctx.lineTo(i - S, S);
      ctx.closePath();
      ctx.globalAlpha = 0.0; // keep the diagonal off the main tile; corners only
    }
    // cracks
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#070a0c";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = Math.random() * S;
      let y = Math.random() * S;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  texCache.concrete = tex;
  return tex;
}

/** A stencilled-text decal (graffiti / signage) on transparent — for flat ground
 * or wall splats. Returns a fresh texture per call (text varies). */
export function stencilTexture(text: string, color = "#b6452f"): THREE.Texture {
  const w = 256;
  const h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.font = "800 64px Oswald, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillText(text, w / 2, h / 2);
    // rough it up with knockout speckles
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 700; i++) {
      ctx.globalAlpha = Math.random() * 0.5;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 3, Math.random() * 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Make a billboarded glow sprite of a given color/size. */
export function makeGlow(color: number, size: number, opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}
