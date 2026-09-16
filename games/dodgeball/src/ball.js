import { CONFIG } from './config.js';
import { chooseEarliestCollision, sweepCircleAabb } from './collision.js';

const NUDGE = 0.02;

export class Ball {
  constructor(x, y) {
    this.radius = CONFIG.ball.radius;
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.returns = 0;
    this.wallBounces = 0;
    this.lastReturnBy = null;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  launch(angle, horizontalSign, verticalSign) {
    const speed = CONFIG.ball.baseSpeed;
    this.vx = Math.cos(angle) * speed * horizontalSign;
    this.vy = Math.sin(angle) * speed * verticalSign;
  }

  step({ arena, players, onDeath }) {
    let remaining = 1;
    let iterations = 0;
    const returnedBy = new Set();

    while (remaining > 1e-8 && iterations < CONFIG.ball.maxCollisionIterations) {
      iterations += 1;
      const delta = { x: this.vx * remaining, y: this.vy * remaining };
      const events = this.#wallEvents(arena, delta);

      for (const player of players) {
        const attack = returnedBy.has(player.id)
          ? null
          : sweepCircleAabb(this, player.getAttackBox(), delta);
        if (attack) events.push({ ...attack, type: 'attack', priority: 0, player });
        if (!player.invulnerable) {
          const hurt = sweepCircleAabb(this, player.getHurtbox(), delta);
          if (hurt) events.push({ ...hurt, type: 'hurt', priority: 1, player });
        }
      }

      const event = chooseEarliestCollision(events);
      if (!event) {
        this.x += delta.x;
        this.y += delta.y;
        break;
      }

      const travel = Math.max(0, Math.min(1, event.time));
      this.x += delta.x * travel;
      this.y += delta.y * travel;
      remaining *= 1 - travel;

      if (event.type === 'attack') {
        this.#returnFrom(event.player, players);
        returnedBy.add(event.player.id);
      } else if (event.type === 'hurt') {
        onDeath(event.player);
        return;
      } else {
        this.#bounce(event);
      }

      this.x += event.type === 'wall' ? event.normal.x * NUDGE : (this.vx / this.speed) * (this.radius + NUDGE);
      this.y += event.type === 'wall' ? event.normal.y * NUDGE : (this.vy / this.speed) * (this.radius + NUDGE);
      if (travel < 1e-8) remaining -= Math.min(remaining, 1e-7);
    }
  }

  #wallEvents(arena, delta) {
    const events = [];
    const add = (time, normal) => {
      if (time >= -1e-8 && time <= 1 + 1e-8) {
        events.push({ type: 'wall', priority: 2, time: Math.max(0, time), normal });
      }
    };
    if (delta.x < 0) add((arena.left + this.radius - this.x) / delta.x, { x: 1, y: 0 });
    if (delta.x > 0) add((arena.right - this.radius - this.x) / delta.x, { x: -1, y: 0 });
    if (delta.y < 0) add((arena.ceiling + this.radius - this.y) / delta.y, { x: 0, y: 1 });
    if (delta.y > 0) add((arena.floor - this.radius - this.y) / delta.y, { x: 0, y: -1 });
    return events;
  }

  #bounce(event) {
    const newSpeed = this.speed * CONFIG.ball.wallSpeedMultiplier;
    if (event.normal.x) this.vx *= -1;
    if (event.normal.y) this.vy *= -1;
    const scale = newSpeed / this.speed;
    this.vx *= scale;
    this.vy *= scale;
    this.wallBounces += 1;
  }

  #returnFrom(attacker, players) {
    const opponent = players.find((player) => player.id !== attacker.id);
    if (!opponent) return;
    const targetY = opponent.y - (opponent.crouching ? 36 : 70);
    let dx = opponent.x - this.x;
    let dy = targetY - this.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speed = this.speed * CONFIG.ball.returnSpeedMultiplier;
    this.vx = dx * speed;
    this.vy = dy * speed;
    this.returns += 1;
    this.lastReturnBy = attacker.id;
  }
}
