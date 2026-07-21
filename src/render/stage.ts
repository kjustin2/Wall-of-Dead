import * as THREE from "three";
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  VignetteEffect,
  type Effect,
} from "postprocessing";
import { clamp01, damp } from "../core/math";
import { PAL } from "../config";

export type Quality = "low" | "medium" | "high";

/**
 * Owns the renderer, scene, post chain and screen-level feedback (hurt vignette
 * pulse + chromatic-aberration kick). The post chain is what makes flat-shaded
 * procedural geometry read as "finished": ACES tone mapping + bloom on every
 * emissive accent (eyes, muzzle, acid, dawn) + a subtle grade + grain.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  quality: Quality = "high";

  private composer!: EffectComposer;
  private vignette!: VignetteEffect;
  private aberration: ChromaticAberrationEffect | null = null;
  private bloom: BloomEffect | null = null;

  /** 0..1 transient screen stress — pushed by hits/crashes, decays fast. */
  private stress = 0;
  private baseVignette = 0.62;
  private baseAberration = 0.0011;
  private reduced = false;
  /** User render-scale (resolution) multiplier on top of the quality DPR cap. */
  private renderScale = 1;
  /** Brightness exposure the user picked; the lightning flash adds onto this. */
  private baseExposure = 1;
  /** Transient additive exposure spike for a lightning flash (decays in update). */
  private lightningBoost = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      powerPreference: "high-performance",
      antialias: false,
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.bg);
    this.fog = new THREE.FogExp2(PAL.fogNight, 0.017);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.5,
      260
    );
    this.camera.position.set(0, 9, 15);
    this.camera.lookAt(0, 1.5, -20);

    // Dim cool moonlight — the world is mostly lit by the player's flashlight
    // and emissive accents; this just keeps shapes legible.
    // Deliberately dim — the field is meant to be dark and revealed by the
    // player's flashlight + emissive accents, not flooded by ambient (which
    // washes the ground into a bright wedge over the wall).
    this.hemiLight = new THREE.HemisphereLight(0x3a4a64, 0x0a0608, 0.26);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xaecbe8, 0.62);
    this.keyLight.position.set(-26, 34, -14);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const sc = this.keyLight.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.far = 120;
    this.keyLight.shadow.bias = -0.0008;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.buildPost();
    window.addEventListener("resize", () => this.onResize());
  }

  private buildPost(): void {
    if (this.composer) this.composer.dispose();
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const effects: Effect[] = [];
    this.bloom = null;
    this.aberration = null;

    if (this.quality !== "low") {
      // Threshold kept high so only true emissive accents (eyes, muzzle, acid,
      // neon, dawn) bloom — NOT ordinary lit surfaces like the flashlight's cone
      // on the ground, which at a low threshold blooms into a blinding wedge.
      this.bloom = new BloomEffect({
        intensity: 0.55,
        luminanceThreshold: 0.8,
        luminanceSmoothing: 0.18,
        mipmapBlur: true,
        radius: 0.5,
      });
      effects.push(this.bloom);
    }
    if (this.quality === "high") {
      this.aberration = new ChromaticAberrationEffect({
        offset: new THREE.Vector2(this.baseAberration, this.baseAberration),
        radialModulation: true,
        modulationOffset: 0.4,
      });
      effects.push(this.aberration);
    }
    this.vignette = new VignetteEffect({ darkness: this.baseVignette, offset: 0.22 });
    effects.push(this.vignette);
    effects.push(new HueSaturationEffect({ saturation: 0.1 }));
    effects.push(new BrightnessContrastEffect({ contrast: 0.08 }));
    if (this.quality === "high") {
      const noise = new NoiseEffect({ premultiply: true });
      noise.blendMode.opacity.value = 0.42;
      effects.push(noise);
    }
    this.composer.addPass(new EffectPass(this.camera, ...effects));
    if (this.quality !== "low") {
      this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
    }
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Cheap, mid-fight perf relief: drop render resolution one step WITHOUT
   * rebuilding the post chain. Rebuilding (applyQuality→buildPost) disposes and
   * recreates the whole composer, forcing synchronous shader recompilation that
   * stalls the main thread for hundreds of ms — perceived as a random freeze.
   * Returns false once it's at the resolution floor. */
  downscale(): boolean {
    const cur = this.renderer.getPixelRatio();
    if (cur <= 0.75) return false;
    this.renderer.setPixelRatio(Math.max(0.75, cur - 0.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    return true;
  }

  /** Max device-pixel-ratio for the current quality preset (the "native" cap). */
  private qualityDprCap(): number {
    return this.quality === "high" ? 2 : this.quality === "medium" ? 1.5 : 1;
  }

  /** Re-derive the render resolution from quality cap × user render scale, then
   * size the renderer + composer. The single funnel both quality and resolution
   * changes (and resizes) flow through, so the two settings compose cleanly. */
  private applyResolution(): void {
    const pr = Math.max(0.4, Math.min(window.devicePixelRatio, this.qualityDprCap()) * this.renderScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Resolution scale (e.g. 0.5 = half-res upscaled, 1.25 = supersampled). The
   * effective pixel ratio is this × the quality preset's DPR cap. */
  setRenderScale(scale: number): void {
    this.renderScale = scale;
    this.applyResolution();
  }

  /** Brightness / gamma: scales ACES exposure (1 = default). */
  setExposure(value: number): void {
    this.baseExposure = value;
    this.renderer.toneMappingExposure = value + this.lightningBoost;
  }

  /** A brief additive exposure spike — lightning as a real light event (paired in
   * world.ts with a key/hemi-light boost). Honors reduced-flashing. */
  flashExposure(amount: number): void {
    if (this.reduced) return;
    this.lightningBoost = Math.max(this.lightningBoost, amount);
  }

  applyQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.applyResolution();
    this.keyLight.castShadow = q !== "low";
    const size = q === "high" ? 2048 : 1024;
    if (this.keyLight.shadow.mapSize.x !== size) {
      this.keyLight.shadow.mapSize.set(size, size);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.buildPost();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyResolution();
  }

  /** Photosensitivity-safe mode: tames stress aberration/vignette swings. */
  setReduced(b: boolean): void {
    this.reduced = b;
  }

  /** Punch the screen — hurt, breach, crash, big impacts. amount 0..1. */
  punch(amount: number): void {
    this.stress = clamp01(this.stress + amount);
  }

  update(dt: number): void {
    this.stress = damp(this.stress, 0, 6, dt);
    const s = this.reduced ? this.stress * 0.3 : this.stress;
    this.vignette.darkness = this.baseVignette + s * 0.4;
    if (this.aberration) {
      const ab = this.reduced ? this.baseAberration : this.baseAberration + s * 0.012;
      this.aberration.offset.set(ab, ab);
    }
    // Lightning exposure flash decays back to the user's brightness.
    if (this.lightningBoost > 0.0008) {
      this.lightningBoost = damp(this.lightningBoost, 0, 9, dt);
      this.renderer.toneMappingExposure = this.baseExposure + this.lightningBoost;
    } else if (this.lightningBoost !== 0) {
      this.lightningBoost = 0;
      this.renderer.toneMappingExposure = this.baseExposure;
    }
  }

  /** Pre-compile shaders + warm the composer once at boot so the first heavy
   * frame (first wave / first bloom) doesn't hitch on lazy GLSL compilation. */
  warmUp(): void {
    this.renderer.compile(this.scene, this.camera);
    this.composer.render(0);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
