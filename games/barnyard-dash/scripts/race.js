import { racePetProfile } from "./balance.js?v=20260925-track-fix-2";
import { cpuControls } from "./cpu.js?v=20260926-course-walls";
import { confineToCourse, crossesGate, distanceFromRoad, pointInRect, segmentCapsuleIntersection, segmentCircleIntersection } from "./track.js?v=20260926-course-walls";

const BASE_TOP_SPEED = 165;
const ACCELERATION = 100;
const BRAKING = 185;
const COAST_DRAG = 28;
const STEER_RATE = 2.45;
const GRAVITY = 13;

function racer(pet, start, laneOffset, id, player = false) {
  return {
    id,
    player,
    x: start.x - Math.sin(start.angle) * laneOffset,
    y: start.y + Math.cos(start.angle) * laneOffset,
    angle: start.angle,
    speed: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    jumpHeld: false,
    checkpoint: 0,
    lap: 1,
    finishedAt: null,
    lastImpact: null,
    pet,
    profile: racePetProfile(pet),
  };
}

export function createRace({ track, playerPet, cpuPets = [], countdownSeconds = 3, totalLaps = 3 }) {
  const rivalsInput = Array.isArray(cpuPets) ? cpuPets.slice(0, 7) : [];
  const count = rivalsInput.length + 1;
  const laneAt = (index) => (index - (count - 1) / 2) * Math.min(18, 105 / Math.max(1, count - 1));
  const player = racer(playerPet, track.start, laneAt(0), "player", true);
  const rivals = rivalsInput.map((pet, index) => racer(pet, track.start, laneAt(index + 1), `cpu-${index + 1}`));
  return {
    track,
    elapsed: 0,
    countdown: Math.max(0, countdownSeconds),
    status: countdownSeconds > 0 ? "countdown" : "racing",
    totalLaps: Math.max(1, Math.min(9, Math.round(Number(totalLaps) || 3))),
    player,
    rivals,
    racers: [player, ...rivals],
    brokenObstacles: [],
  };
}

function controlsOf(value = {}) {
  return {
    throttle: value.throttle === true,
    brake: value.brake === true,
    left: value.left === true,
    right: value.right === true,
    jump: value.jump === true,
  };
}

function obstacleHit(start, end, obstacle, racerRadius) {
  if (Number.isFinite(obstacle.length) && Number.isFinite(obstacle.angle)) {
    const halfLength = obstacle.length / 2;
    const dx = Math.cos(obstacle.angle) * halfLength;
    const dy = Math.sin(obstacle.angle) * halfLength;
    return segmentCapsuleIntersection(
      start,
      end,
      { x: obstacle.x - dx, y: obstacle.y - dy },
      { x: obstacle.x + dx, y: obstacle.y + dy },
      racerRadius + Math.max(0, Number(obstacle.thickness) || 0) / 2,
    );
  }
  const radius = racerRadius + Math.max(0, Number(obstacle.radius) || 0);
  const hit = segmentCircleIntersection(start, end, obstacle, radius);
  return hit ? { ...hit, closestX: obstacle.x, closestY: obstacle.y } : null;
}

/** A gate checkpoint spans the course; a bare {x, y, radius} one is a circle (small test tracks). */
function checkpointReached(start, end, checkpoint) {
  return checkpoint.gate
    ? crossesGate(start, end, checkpoint)
    : Boolean(segmentCircleIntersection(start, end, checkpoint, checkpoint.radius));
}

function separateRacers(entries) {
  const racers = entries.map((entry) => ({ ...entry }));
  for (let leftIndex = 0; leftIndex < racers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < racers.length; rightIndex += 1) {
      const left = racers[leftIndex];
      const right = racers[rightIndex];
      if (left.finishedAt !== null || right.finishedAt !== null || Math.abs(left.jumpHeight - right.jumpHeight) > 0.55) continue;
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const distance = Math.hypot(dx, dy);
      const minimum = (left.profile.radius + right.profile.radius) * 0.72;
      if (distance >= minimum) continue;
      const normalX = distance ? dx / distance : left.id.localeCompare(right.id) <= 0 ? 1 : -1;
      const normalY = distance ? dy / distance : 0;
      const correction = (minimum - distance) / 2 + 0.01;
      left.x -= normalX * correction;
      left.y -= normalY * correction;
      right.x += normalX * correction;
      right.y += normalY * correction;
      left.speed *= 0.97;
      right.speed *= 0.97;
    }
  }
  return racers;
}

function advanceRacer(source, rawControls, dt, track, brokenObstacles, totalLaps) {
  if (source.finishedAt !== null) return { racer: source, brokenObstacles };
  const input = controlsOf(rawControls);
  const racer = { ...source, lastImpact: null };
  const previous = { x: racer.x, y: racer.y };
  const maxSpeed = BASE_TOP_SPEED * racer.profile.speedMultiplier;

  if (input.throttle) racer.speed = Math.min(maxSpeed, racer.speed + ACCELERATION * dt);
  else racer.speed = Math.max(0, racer.speed - COAST_DRAG * dt);
  if (input.brake) racer.speed = Math.max(0, racer.speed - BRAKING * dt);

  const steering = (Number(input.right) - Number(input.left)) * STEER_RATE * (0.22 + 0.78 * Math.min(1, racer.speed / maxSpeed));
  racer.angle += steering * dt;

  if (input.jump && !racer.jumpHeld && racer.jumpHeight <= 0) racer.jumpVelocity = 5.7;
  racer.jumpHeld = input.jump;
  racer.jumpVelocity -= GRAVITY * dt;
  racer.jumpHeight = Math.max(0, racer.jumpHeight + racer.jumpVelocity * dt);
  if (racer.jumpHeight === 0 && racer.jumpVelocity < 0) racer.jumpVelocity = 0;

  racer.x += Math.cos(racer.angle) * racer.speed * dt;
  racer.y += Math.sin(racer.angle) * racer.speed * dt;

  if (distanceFromRoad(racer, track) > track.roadWidth / 2) racer.speed *= Math.max(0, 1 - 2.8 * dt);
  if (track.mud.some((zone) => pointInRect(racer, zone))) {
    racer.speed *= Math.max(0, 1 - (1 - racer.profile.mudGrip) * 3.8 * dt);
  }

  let broken = brokenObstacles;
  for (const obstacle of track.obstacles) {
    if (broken.includes(obstacle.id)) continue;
    const hit = obstacleHit(previous, racer, obstacle, racer.profile.radius);
    if (!hit) continue;
    if (racer.jumpHeight > 0.45 && (obstacle.kind === "hurdle" || obstacle.kind === "hay")) continue;

    const gateForce = racer.speed * racer.profile.gatePower;
    const canBreak = obstacle.kind === "hay" ? gateForce >= 65 : obstacle.kind === "gate" && gateForce >= 90;
    if (canBreak) {
      broken = [...broken, obstacle.id];
      racer.speed *= 0.92;
      racer.lastImpact = obstacle.kind;
      continue;
    }

    racer.speed *= racer.profile.impactRetention;
    racer.lastImpact = obstacle.kind;
    const distance = Math.hypot(hit.x - hit.closestX, hit.y - hit.closestY);
    const nx = distance ? (hit.x - hit.closestX) / distance : -Math.cos(racer.angle);
    const ny = distance ? (hit.y - hit.closestY) / distance : -Math.sin(racer.angle);
    const clearance = racer.profile.radius + Math.max(0, Number(obstacle.thickness) || Number(obstacle.radius) * 2 || 0) / 2 + 0.1;
    racer.x = hit.closestX + nx * clearance;
    racer.y = hit.closestY + ny * clearance;
  }

  // The course fence is a wall: nothing, jumping included, leaves the track.
  // Head-on contact costs most of the speed, a glancing scrape very little.
  const wall = confineToCourse(racer, track, racer.profile.radius);
  if (wall) {
    racer.x = wall.x;
    racer.y = wall.y;
    const into = Math.max(0, Math.cos(racer.angle) * wall.normalX + Math.sin(racer.angle) * wall.normalY);
    racer.speed *= 1 - 0.6 * into;
    racer.lastImpact = racer.lastImpact ?? "fence";
  }

  const checkpoint = track.checkpoints[racer.checkpoint];
  if (checkpoint && checkpointReached(previous, racer, checkpoint)) {
    if (racer.checkpoint === track.checkpoints.length - 1 && racer.lap < totalLaps) {
      racer.lap += 1;
      racer.checkpoint = 0;
    } else {
      racer.checkpoint += 1;
    }
  }
  return { racer, brokenObstacles: broken };
}

export function stepRace(source, playerControls = {}, dt = 1 / 60) {
  const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
  if (seconds === 0 || source.status === "finished") return source;
  let countdown = Math.max(0, source.countdown - seconds);
  let status = countdown > 0 ? "countdown" : "racing";
  if (source.countdown > 0) return { ...source, countdown, status };

  const elapsed = source.elapsed + seconds;
  const playerStep = advanceRacer(source.player, playerControls, seconds, source.track, source.brokenObstacles, source.totalLaps);
  let brokenObstacles = playerStep.brokenObstacles;
  const rivals = source.rivals.map((rival) => {
    const cpuInput = cpuControls(rival, source.track, brokenObstacles);
    const stepped = advanceRacer(rival, cpuInput, seconds, source.track, brokenObstacles, source.totalLaps);
    brokenObstacles = stepped.brokenObstacles;
    return stepped.racer;
  });
  const separated = separateRacers([playerStep.racer, ...rivals]);
  const finish = (entry) => entry.finishedAt === null && entry.checkpoint >= source.track.checkpoints.length
    ? { ...entry, finishedAt: elapsed }
    : entry;
  const player = finish(separated[0]);
  const finishedRivals = separated.slice(1).map(finish);
  if (player.finishedAt !== null && finishedRivals.every((rival) => rival.finishedAt !== null)) status = "finished";

  return { ...source, elapsed, countdown, status, player, rivals: finishedRivals, racers: [player, ...finishedRivals], brokenObstacles };
}

export function raceOrder(race) {
  const checkpoint = (racer) => (racer.lap - 1) * race.track.checkpoints.length + racer.checkpoint;
  const targetDistance = (racer) => {
    const target = race.track.checkpoints[Math.min(racer.checkpoint, race.track.checkpoints.length - 1)];
    return target ? Math.hypot(racer.x - target.x, racer.y - target.y) : 0;
  };
  return [...race.racers].sort((left, right) => {
    if (left.finishedAt !== null || right.finishedAt !== null) {
      if (left.finishedAt === null) return 1;
      if (right.finishedAt === null) return -1;
      return left.finishedAt - right.finishedAt;
    }
    return checkpoint(right) - checkpoint(left) || targetDistance(left) - targetDistance(right);
  });
}
