import { PIN_POSITIONS, SHOT_X_SCALE, normalizedZ } from './geometry.mjs';

// The original planner targets a different deck geometry. This planner solves
// a physical line to the front surviving pin; tier error is applied afterward.
export function create3dCpu(physics) {
  return {
    createCpuPlan({ pins, balls, levelId = 'casual', random = Math.random }) {
      const standing = pins.filter(p => p.standing);
      const front = standing.slice().sort((a,b) => a.id - b.id)[0] || { id: 1 };
      const [px,pz] = PIN_POSITIONS[front.id - 1];
      const ballIndex = standing.length === 10 ? 7 : 5;
      const profile = balls[ballIndex] || balls[0];
      const noise = { rookie: .16, casual: .09, competitive: .045, pro: .018, champion: .008 }[levelId] ?? .09;
      const error = () => (random() - .5) * 2;
      const target = standing.length === 10 ? .36 : px;
      const position = Math.max(-.44, Math.min(.44, target / SHOT_X_SCALE));
      const shot = { ...profile, position, aim: 0, hook: 0, power: .82 + error() * .08, ballIndex, release: 0 };
      const z = normalizedZ(pz);
      shot.aim = Math.max(-.45, Math.min(.45,
        (target / SHOT_X_SCALE - physics.trajectoryX(z, shot)) / z + error() * noise));
      shot.position = Math.max(-.46, Math.min(.46, position + error() * noise));
      return shot;
    },
  };
}
