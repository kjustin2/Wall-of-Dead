// Win screen — you reached the safe zone. Warm dawn light, your final tally,
// R to play again.

import { Scene } from './Scene.js';
import { VIEW, PAL } from '../Config.js';
import { TAU } from '../util/math.js';

export class VictoryScene extends Scene {
  enter() {
    this.t = 0;
    this.audio.ambient.stop();
    this.audio.play('dawn_chime');
    this.embers = [];
    for (let i = 0; i < 40; i++) {
      this.embers.push({ x: Math.random() * VIEW.W, y: Math.random() * VIEW.H, s: 6 + Math.random() * 16, ph: Math.random() * TAU });
    }
  }

  update(dt) {
    this.t += dt;
    if (this.t > 0.8 && (this.input.consumeKey('r') || this.input.consumeKey(' ') || this.input.consumeClick())) {
      this.audio.play('ui_confirm');
      this.game.toTitle();
    }
  }

  render(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.H);
    sky.addColorStop(0, '#3a2a20');
    sky.addColorStop(0.5, '#a06a3a');
    sky.addColorStop(1, '#d8a05a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    // Rising sun.
    ctx.globalCompositeOperation = 'lighter';
    const sun = ctx.createRadialGradient(VIEW.W / 2, 460, 20, VIEW.W / 2, 460, 420);
    sun.addColorStop(0, 'rgba(255,240,200,0.9)');
    sun.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    // Drifting embers.
    for (const e of this.embers) {
      const a = 0.4 + 0.4 * Math.sin(this.t * 1.5 + e.ph);
      ctx.fillStyle = `rgba(255,220,150,${a * 0.5})`;
      const y = (e.y - this.t * e.s) % VIEW.H;
      ctx.fillRect(e.x, (y + VIEW.H) % VIEW.H, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.textAlign = 'center';
    ctx.fillStyle = '#2a1a10';
    ctx.font = 'bold 60px monospace';
    ctx.fillText('THE SAFE ZONE', VIEW.W / 2, 230);
    ctx.fillStyle = '#fff2d8';
    ctx.fillText('THE SAFE ZONE', VIEW.W / 2, 227);

    ctx.fillStyle = '#1a120a';
    ctx.font = '18px monospace';
    ctx.fillText('You held every wall on the road. The gates open for you.', VIEW.W / 2, 280);

    const s = this.run.stats;
    ctx.fillStyle = '#2a1a10';
    ctx.font = '15px monospace';
    ctx.fillText(`Nights survived: ${s.nightsSurvived}     Dead put down: ${s.kills}`, VIEW.W / 2, 330);
    if (this.run.companions.length) {
      ctx.fillText(`Survivors brought home: ${this.run.companions.map(c => c.name).join(', ')}`, VIEW.W / 2, 356);
    }

    if (this.t > 0.8) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      ctx.fillStyle = `rgba(40,26,16,${0.5 + pulse * 0.4})`;
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Press R to play again', VIEW.W / 2, 430);
    }
  }
}
