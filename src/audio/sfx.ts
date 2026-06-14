import type { EventBus } from "../core/events";

/**
 * Web Audio synthesis — every sound is built from oscillator/noise primitives
 * at play time; there are no audio assets. Subscribes to the generic SFX event
 * so any system can `events.emit("SFX", { id })`. Headless-safe: if there is no
 * AudioContext, every method is a silent no-op.
 */
export class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private vol = 0.7;
  private ambientNodes: AudioNode[] = [];
  private ambientOn = false;
  private noiseBuf: AudioBuffer | null = null;

  constructor(events: EventBus) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ac.destination);
      this.noiseBuf = this.makeNoise(2);
    } catch {
      this.ac = null;
    }
    events.on("SFX", ({ id }) => this.play(id));
    events.on("LAST_STAND", () => this.play("last_stand"));
    events.on("RUN_VICTORY", () => this.play("victory"));
    events.on("PLAYER_DIED", () => this.play("defeat"));
  }

  resume(): void {
    this.ac?.resume();
  }

  setVolume(v: number): void {
    this.vol = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.vol;
  }

  get volume(): number {
    return this.vol;
  }
  get isMuted(): boolean {
    return this.muted;
  }

  private makeNoise(seconds: number): AudioBuffer | null {
    if (!this.ac) return null;
    const len = Math.floor(this.ac.sampleRate * seconds);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0
  ): void {
    if (!this.ac || !this.master) return;
    const t0 = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    const g = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private burst(dur: number, gain: number, filterFreq: number, delay = 0): void {
    if (!this.ac || !this.master || !this.noiseBuf) return;
    const t0 = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ac.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = filterFreq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(id: string): void {
    if (!this.ac) return;
    switch (id) {
      case "shot_pistol":
        this.burst(0.09, 0.5, 1800);
        this.tone(220, 0.08, "square", 0.18, 90);
        break;
      case "shot_smg":
        this.burst(0.06, 0.36, 2200);
        this.tone(260, 0.05, "square", 0.12, 120);
        break;
      case "shot_shotgun":
        this.burst(0.18, 0.7, 1300);
        this.tone(120, 0.16, "sawtooth", 0.25, 50);
        break;
      case "shot_rifle":
        this.burst(0.12, 0.7, 2600);
        this.tone(180, 0.12, "square", 0.28, 70);
        break;
      case "dry_fire":
        this.tone(900, 0.03, "square", 0.06);
        break;
      case "reload":
        this.tone(420, 0.05, "square", 0.1, 600, 0);
        this.tone(300, 0.05, "square", 0.1, 200, 0.18);
        break;
      case "swap":
        this.tone(520, 0.06, "triangle", 0.12, 780);
        break;
      case "zombie_hit":
        this.burst(0.08, 0.3, 900);
        break;
      case "zombie_head":
        this.burst(0.1, 0.45, 1400);
        this.tone(160, 0.08, "square", 0.16, 60);
        break;
      case "zombie_die":
        this.tone(160, 0.4, "sawtooth", 0.22, 50);
        this.burst(0.3, 0.3, 700);
        break;
      case "zombie_claw":
        this.burst(0.12, 0.28, 500);
        break;
      case "brute_slam":
        this.tone(70, 0.5, "sawtooth", 0.4, 40);
        this.burst(0.4, 0.5, 400);
        break;
      case "spit":
        this.tone(600, 0.2, "sawtooth", 0.12, 200);
        break;
      case "acid_hit":
        this.burst(0.25, 0.3, 1600);
        this.tone(400, 0.18, "sine", 0.1, 120);
        break;
      case "wall_breach":
        this.tone(80, 0.7, "sawtooth", 0.45, 40);
        this.burst(0.6, 0.5, 500);
        break;
      case "player_hurt":
        this.tone(200, 0.25, "sawtooth", 0.3, 90);
        break;
      case "thunder":
        this.tone(48, 1.1, "sawtooth", 0.3, 28);
        this.burst(1.0, 0.45, 320);
        this.burst(0.3, 0.3, 1200, 0.05);
        break;
      case "dawn_chime":
        this.tone(523, 0.6, "sine", 0.2, 784);
        this.tone(659, 0.7, "sine", 0.18, 988, 0.15);
        break;
      case "last_stand":
        // grenade throw — a short rising whoosh + pin pop
        this.tone(300, 0.18, "triangle", 0.16, 700);
        this.tone(900, 0.04, "square", 0.08);
        break;
      case "explosion":
        this.tone(58, 0.6, "sawtooth", 0.45, 28);
        this.burst(0.5, 0.6, 600);
        this.burst(0.2, 0.45, 2200, 0.02);
        break;
      case "crate":
        this.tone(440, 0.1, "triangle", 0.18, 660);
        break;
      case "ui_click":
        this.tone(660, 0.05, "triangle", 0.12, 880);
        break;
      case "victory":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.2, undefined, i * 0.16));
        break;
      case "defeat":
        [330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.6, "sawtooth", 0.22, undefined, i * 0.2));
        break;
      default:
        break;
    }
  }

  startAmbient(): void {
    if (!this.ac || !this.master || this.ambientOn || !this.noiseBuf) return;
    this.ambientOn = true;

    // Low dread drone (two detuned saws through a lowpass)
    const drone = this.ac.createGain();
    drone.gain.value = 0.08;
    const lp = this.ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    drone.connect(lp);
    lp.connect(this.master);
    for (const f of [55, 58.2]) {
      const o = this.ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(drone);
      o.start();
      this.ambientNodes.push(o);
    }

    // Wind: looping noise through a slowly-wavering bandpass
    const wind = this.ac.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const bp = this.ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const wg = this.ac.createGain();
    wg.gain.value = 0.05;
    const lfo = this.ac.createOscillator();
    lfo.frequency.value = 0.1;
    const lfoGain = this.ac.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(wg.gain);
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(this.master);
    wind.start();
    lfo.start();
    this.ambientNodes.push(wind, lfo, drone as unknown as AudioNode);
  }

  stopAmbient(): void {
    this.ambientOn = false;
    for (const n of this.ambientNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* gain nodes have no stop */
      }
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
    this.ambientNodes = [];
  }
}
