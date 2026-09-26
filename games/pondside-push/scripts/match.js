import { bumpPowerForSpeed, movementProfile } from "./balance.js";

export const ARENA_RADIUS = 260;
export const WINS_TO_MATCH = 3;
const BUMP_SECONDS = 0.2;
const BUMP_COOLDOWN = 0.85;
const BUMP_DASH_SPEED = 95;
const BUMP_RECOIL = 0.18;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const magnitude = (x, y) => Math.hypot(x, y);

function spawnPlayer(pet, index, count) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  const profile = movementProfile(pet.stats, pet.speciesId);
  return {
    id: pet.instanceId,
    player: index === 0,
    pet,
    x: Math.cos(angle) * 92,
    y: Math.sin(angle) * 92,
    vx: 0,
    vy: 0,
    facingX: -Math.cos(angle),
    facingY: -Math.sin(angle),
    momentum: 0,
    radius: profile.radius,
    wins: 0,
    eliminated: false,
    bumpTimer: 0,
    bumpCooldown: 0,
    bumpSourceSpeed: 0,
    bumpHits: [],
    impact: 0,
    fallHeight: 0,
    fallSpeed: 0,
    splashAge: -1,
  };
}

export function createMatch(pets) {
  if (!Array.isArray(pets) || pets.length < 2) throw new Error("Pondside Push needs at least two pets");
  return {
    players: pets.map((pet, index) => spawnPlayer(pet, index, pets.length)),
    phase: "playing",
    round: 1,
    tick: 0,
    roundWinnerId: null,
    matchWinnerId: null,
  };
}

export function resetRound(match) {
  const count = match.players.length;
  match.players.forEach((player, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    Object.assign(player, {
      x: Math.cos(angle) * 92,
      y: Math.sin(angle) * 92,
      vx: 0,
      vy: 0,
      facingX: -Math.cos(angle),
      facingY: -Math.sin(angle),
      momentum: 0,
      eliminated: false,
      bumpTimer: 0,
      bumpCooldown: 0,
      bumpSourceSpeed: 0,
      bumpHits: [],
      impact: 0,
      fallHeight: 0,
      fallSpeed: 0,
      splashAge: -1,
    });
  });
  match.phase = "playing";
  match.round += 1;
  match.roundWinnerId = null;
}

function movePlayer(player, input, dt) {
  player.impact = Math.max(0, player.impact - dt * 4.5);
  if (player.eliminated) {
    player.fallSpeed += 520 * dt;
    player.fallHeight += player.fallSpeed * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.vx *= Math.pow(0.985, dt * 60);
    player.vy *= Math.pow(0.985, dt * 60);
    if (player.fallHeight >= 19 && player.splashAge < 0) player.splashAge = 0;
    else if (player.splashAge >= 0) player.splashAge += dt;
    return;
  }
  const profile = movementProfile(player.pet.stats, player.pet.speciesId);
  const inputLength = magnitude(input?.x || 0, input?.y || 0);
  const previousSpeed = magnitude(player.vx, player.vy);

  if (inputLength > 0.1) {
    const dx = input.x / inputLength;
    const dy = input.y / inputLength;
    const travelX = previousSpeed > 4 ? player.vx / previousSpeed : player.facingX;
    const travelY = previousSpeed > 4 ? player.vy / previousSpeed : player.facingY;
    const alignment = dx * travelX + dy * travelY;
    player.momentum = alignment > 0.72
      ? clamp(player.momentum + dt / profile.momentumBuildSeconds, 0, 1)
      : clamp(player.momentum - dt * 2.8, 0, 1);
    player.facingX = dx;
    player.facingY = dy;
    const targetSpeed = profile.maxSpeed * (0.42 + player.momentum * 0.58);
    player.vx += dx * profile.acceleration * dt;
    player.vy += dy * profile.acceleration * dt;
    const speed = magnitude(player.vx, player.vy);
    if (speed > targetSpeed) {
      player.vx *= targetSpeed / speed;
      player.vy *= targetSpeed / speed;
    }
  } else {
    player.momentum = clamp(player.momentum - dt * 1.4, 0, 1);
  }

  if (input?.bump && player.bumpCooldown <= 0) {
    player.bumpSourceSpeed = previousSpeed;
    player.bumpHits = [];
    player.bumpTimer = BUMP_SECONDS;
    player.bumpCooldown = BUMP_COOLDOWN;
    player.vx += player.facingX * BUMP_DASH_SPEED;
    player.vy += player.facingY * BUMP_DASH_SPEED;
  }

  player.bumpTimer = Math.max(0, player.bumpTimer - dt);
  player.bumpCooldown = Math.max(0, player.bumpCooldown - dt);
  const drag = Math.pow(inputLength > 0.1 ? 0.994 : 0.965, dt * 60);
  player.vx *= drag;
  player.vy *= drag;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
}

function applyBump(attacker, target, nx, ny) {
  if (attacker.bumpHits.includes(target.id)) return;
  attacker.bumpHits.push(target.id);
  const force = bumpPowerForSpeed(attacker.bumpSourceSpeed, attacker.pet.stats);
  target.vx += nx * force;
  target.vy += ny * force;
  attacker.vx -= nx * force * BUMP_RECOIL;
  attacker.vy -= ny * force * BUMP_RECOIL;
  target.impact = 1;
  attacker.impact = Math.max(attacker.impact, 0.58);
}

function resolvePair(a, b) {
  if (a.eliminated || b.eliminated) return;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distance = magnitude(dx, dy);
  const bumpReach = a.bumpTimer > 0 || b.bumpTimer > 0 ? 8 : 0;
  const minimum = a.radius + b.radius + bumpReach;
  if (distance > minimum) return;
  if (distance < 0.001) { dx = 1; dy = 0; distance = 1; }
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimum - distance;
  a.x -= nx * overlap / 2;
  a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2;
  b.y += ny * overlap / 2;

  const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (relative > 0) {
    const impulse = relative * 0.58;
    a.vx -= nx * impulse;
    a.vy -= ny * impulse;
    b.vx += nx * impulse;
    b.vy += ny * impulse;
  }
  if (a.bumpTimer > 0 && a.facingX * nx + a.facingY * ny > 0.35) {
    applyBump(a, b, nx, ny);
  }
  if (b.bumpTimer > 0 && -(b.facingX * nx + b.facingY * ny) > 0.35) {
    applyBump(b, a, -nx, -ny);
  }
}

function settleRound(match) {
  for (const player of match.players) {
    if (!player.eliminated && magnitude(player.x, player.y) > ARENA_RADIUS + player.radius * 0.25) {
      player.eliminated = true;
      player.fallHeight = 0;
      player.fallSpeed = 0;
      player.splashAge = -1;
    }
  }
  const survivors = match.players.filter((player) => !player.eliminated);
  if (survivors.length !== 1) return;
  const winner = survivors[0];
  winner.wins += 1;
  match.roundWinnerId = winner.id;
  if (winner.wins >= WINS_TO_MATCH) {
    match.phase = "match-over";
    match.matchWinnerId = winner.id;
  } else {
    match.phase = "round-over";
  }
}

export function stepMatch(match, controls = {}, dt = 1 / 60) {
  if (match.phase !== "playing") {
    match.players.forEach((player) => movePlayer(player, {}, dt));
    return match;
  }
  match.tick += 1;
  match.players.forEach((player) => movePlayer(player, controls[player.id] || {}, dt));
  for (let a = 0; a < match.players.length; a += 1) {
    for (let b = a + 1; b < match.players.length; b += 1) resolvePair(match.players[a], match.players[b]);
  }
  settleRound(match);
  return match;
}
