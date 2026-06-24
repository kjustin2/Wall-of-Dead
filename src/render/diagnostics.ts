// =============================================================================
// Wall of Dead — live render / scene-graph diagnostics.
// =============================================================================
// Read-only introspection of the real renderer, exposed on window.__wod so the
// headless harnesses (and the dev console) can answer two questions the old
// luminance-only checks couldn't:
//
//   renderStats(stage) — the GPU cost of ONE frame: draw calls, triangles, and
//     the resident geometry/texture/program counts. This is THE signal for
//     "did my optimization actually reduce work" — a merged draw call or a
//     pooled geometry shows up here as fewer calls / fewer geometries.
//
//   sceneAudit(stage)  — a health walk of the live scene graph that flags the
//     class of bug that ships past a type-check and a mocked canvas: NaN/Inf
//     object positions, absurd scales, and — the one that shipped a black
//     screen here before — a geometry whose bounding-sphere radius is NaN,
//     negative, or astronomically huge (a bad/negative primitive radius). It
//     also returns the static visible-triangle/mesh budget of the scene.
//
// Pure reads (plus one forced render for the frame counters); harmless in prod.
// =============================================================================

import * as THREE from "three";
import type { Stage } from "./stage";

export interface RenderStats {
  /** Draw calls for one full frame (scene + every post pass). */
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  /** Resident GPU resources (leak signal if these climb across identical scenes). */
  geometries: number;
  textures: number;
  programs: number;
}

export interface SceneProblem {
  kind: string;
  object: string;
  detail: string;
}

export interface SceneAudit {
  objects: number;
  meshes: number;
  visibleMeshes: number;
  instancedMeshes: number;
  lights: number;
  uniqueGeometries: number;
  /** Static triangle count of everything currently visible (× instance count). */
  triangles: number;
  problems: SceneProblem[];
}

const HUGE = 1e5;
const _v = new THREE.Vector3();

function label(o: THREE.Object3D): string {
  return o.name || `${o.type}#${o.id}`;
}

function finite3(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function geomTriangles(g: THREE.BufferGeometry): number {
  const idx = g.getIndex();
  if (idx) return idx.count / 3;
  const pos = g.getAttribute("position");
  return pos ? pos.count / 3 : 0;
}

function parentsVisible(o: THREE.Object3D): boolean {
  let p = o.parent;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}

/**
 * One full composer frame with renderer.info auto-reset disabled, so the
 * counters reflect the WHOLE frame (scene render + every post-processing pass)
 * rather than just the last fullscreen pass. Restores autoReset afterwards.
 */
export function renderStats(stage: Stage): RenderStats {
  const r = stage.renderer;
  const prevAuto = r.info.autoReset;
  r.info.autoReset = false;
  r.info.reset();
  stage.render(0);
  const info = r.info;
  const out: RenderStats = {
    calls: info.render.calls,
    triangles: info.render.triangles,
    lines: info.render.lines,
    points: info.render.points,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs ? info.programs.length : 0,
  };
  r.info.autoReset = prevAuto;
  return out;
}

/**
 * Walk the live scene graph and report structural health + the visible
 * triangle budget. `problems` is capped so a pathological scene can't produce
 * an unbounded payload.
 */
export function sceneAudit(stage: Stage, maxProblems = 40): SceneAudit {
  const out: SceneAudit = {
    objects: 0,
    meshes: 0,
    visibleMeshes: 0,
    instancedMeshes: 0,
    lights: 0,
    uniqueGeometries: 0,
    triangles: 0,
    problems: [],
  };
  const seenGeom = new Set<number>();
  const push = (kind: string, o: THREE.Object3D, detail: string): void => {
    if (out.problems.length < maxProblems) out.problems.push({ kind, object: label(o), detail });
  };

  // Bring world matrices up to date so getWorldPosition is meaningful even on a
  // paused frame.
  stage.scene.updateMatrixWorld(true);

  stage.scene.traverse((o) => {
    out.objects++;

    o.getWorldPosition(_v);
    if (!finite3(_v)) push("nan-position", o, `world pos (${_v.x}, ${_v.y}, ${_v.z})`);

    const s = o.scale;
    if (!finite3(s)) push("nan-scale", o, `scale (${s.x}, ${s.y}, ${s.z})`);
    else if (Math.abs(s.x) > HUGE || Math.abs(s.y) > HUGE || Math.abs(s.z) > HUGE)
      push("huge-scale", o, `scale (${s.x}, ${s.y}, ${s.z})`);

    if ((o as THREE.Light).isLight) out.lights++;

    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    out.meshes++;
    const vis = o.visible && parentsVisible(o);
    if (vis) out.visibleMeshes++;
    const inst = o as THREE.InstancedMesh;
    const count = inst.isInstancedMesh ? inst.count : 1;
    if (inst.isInstancedMesh) out.instancedMeshes++;

    const g = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!g) return;

    if (!seenGeom.has(g.id)) {
      seenGeom.add(g.id);
      out.uniqueGeometries++;

      // Bounding-sphere sanity — the negative/NaN radius class that no mocked
      // canvas catches (it shipped a full black screen here once).
      if (!g.boundingSphere) {
        try {
          g.computeBoundingSphere();
        } catch {
          /* malformed geometry; the position-attribute scan below will catch it */
        }
      }
      const bs = g.boundingSphere;
      if (bs) {
        const radius = bs.radius;
        if (!Number.isFinite(radius)) push("nan-radius", o, `bounding radius ${radius}`);
        else if (radius < 0) push("negative-radius", o, `bounding radius ${radius}`);
        else if (radius > HUGE) push("huge-radius", o, `bounding radius ${radius}`);
        if (!finite3(bs.center)) push("nan-bounds-center", o, "bounding center NaN");
      }

      // Sample the position attribute for NaN/Inf vertices.
      const pos = g.getAttribute("position");
      if (pos) {
        const arr = pos.array as ArrayLike<number>;
        const step = Math.max(1, Math.floor(arr.length / 300));
        for (let i = 0; i < arr.length; i += step) {
          if (!Number.isFinite(arr[i])) {
            push("nan-geometry", o, `position[${i}] = ${arr[i]}`);
            break;
          }
        }
      }
    }

    if (vis) out.triangles += geomTriangles(g) * count;
  });

  out.triangles = Math.round(out.triangles);
  return out;
}
