import { H, HORIZON_Y, TUNING, W } from "../core/constants.mjs";
import { rand } from "../core/math.mjs";

export function makeStars() {
  const stars = [];

  for (let i = 0; i < TUNING.starCount; i++) {
    stars.push({
      x: rand(-W, W),
      y: rand(20, HORIZON_Y + 180),
      z: rand(0.45, 2.2),
      r: rand(0.7, 2.1),
      tw: rand(0, Math.PI * 2)
    });
  }

  return stars;
}
