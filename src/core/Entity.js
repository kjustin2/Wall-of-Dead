// Base class for all in-world entities (player, zombies, projectiles,
// pickups, mines). Ported from roguehero2/src/Entity.js.

export class Entity {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.r = radius;
    this.vx = 0;
    this.vy = 0;
    this.hp = 1;
    this.maxHp = 1;
    this.alive = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) { /* abstract */ }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
  }

  collidesWith(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const t = this.r + other.r;
    return dx * dx + dy * dy < t * t;
  }
}
