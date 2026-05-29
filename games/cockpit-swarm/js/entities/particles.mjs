import { rand } from "../core/math.mjs";

export function spawnExplosion(game, x, y, scale, kind) {
  const count = kind === "enemyKill" ? 24 : 12;

  for (let i = 0; i < count; i++) {
    game.explosions.push({
      x,
      y,
      vx: rand(-3.2, 3.2) * scale,
      vy: rand(-3.2, 3.2) * scale,
      r: rand(2, 6) * scale,
      life: rand(220, 520),
      maxLife: 520,
      kind
    });
  }
}

export function spawnMissSpark(game, x, y) {
  for (let i = 0; i < 5; i++) {
    game.explosions.push({
      x,
      y,
      vx: rand(-1.4, 1.4),
      vy: rand(-1.4, 1.4),
      r: rand(1.5, 3.5),
      life: rand(120, 260),
      maxLife: 260,
      kind: "miss"
    });
  }
}
