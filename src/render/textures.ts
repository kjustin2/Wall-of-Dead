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
