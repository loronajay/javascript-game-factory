import { onFighterLanded } from './fighter-state.js';
import { getMainLedges, getStagePlatforms } from './platform-stage.js';

export function applyFighterPhysics(fighter, input, inputBuffer = null) {
  const stats = fighter.archetype;
  const moveDirection = getMoveDirection(input, stats);
  const stickMagnitude = getStickMagnitude(input);

  if (fighter.platformDropTimer > 0) fighter.platformDropTimer -= 1;
  if (fighter.ledgeLockoutTimer > 0) fighter.ledgeLockoutTimer -= 1;

  if (fighter.state.name === 'ledgeHang' || fighter.state.name === 'ledgeGetup') return fighter;

  if (fighter.grounded) {
    applyGroundPhysics(fighter, moveDirection, stickMagnitude);
    fighter.velocity.y = 0;
    return fighter;
  }

  if (!isFullDownHeld(input, stats)) fighter.fastFallArmed = true;

  if (moveDirection !== 0) {
    fighter.facing = moveDirection;
    const currentDirection = Math.sign(fighter.velocity.x);
    const acceleration = currentDirection !== 0 && currentDirection !== moveDirection
      ? stats.airTurnAcceleration
      : stats.airAcceleration;
    fighter.velocity.x += moveDirection * acceleration * Math.max(0.40, stickMagnitude);
  }

  if (Math.abs(fighter.velocity.x) > stats.maxAirSpeed) {
    fighter.velocity.x = clamp(fighter.velocity.x, -stats.maxAirSpeed, stats.maxAirSpeed);
  }
  fighter.velocity.x *= stats.airFriction ?? 1;

  if (!fighter.fastFalling
    && fighter.fastFallArmed
    && fighter.velocity.y >= 0
    && didFullDownTap(inputBuffer, stats)) {
    fighter.fastFalling = true;
    fighter.fastFallArmed = false;
    fighter.velocity.y = Math.max(fighter.velocity.y, stats.fastFallSpeed * 0.72);
  }

  const fallCap = fighter.fastFalling ? stats.fastFallSpeed : stats.maxFallSpeed;
  fighter.velocity.y += stats.gravity * (stats.weight ?? 1);
  fighter.velocity.y = Math.min(fighter.velocity.y, fallCap);
  if (fighter.fastFalling) fighter.state.name = 'fastFall';
  return fighter;
}

export function integrateFighter(fighter) {
  fighter.previousPosition = { ...fighter.position };
  fighter.position.x += fighter.velocity.x;
  fighter.position.y += fighter.velocity.y;
  return fighter;
}

export function resolveStageCollision(fighter, stage, input = {}) {
  if (!stage.main && Number.isFinite(stage.floorY)) {
    if (fighter.position.y < stage.floorY) return fighter;

    const wasAirborne = !fighter.grounded || fighter.velocity.y > 0;
    fighter.position.y = stage.floorY;
    fighter.velocity.y = 0;

    if (wasAirborne) {
      onFighterLanded(fighter);
    } else {
      fighter.grounded = true;
    }

    return fighter;
  }

  const wasAirborne = !fighter.grounded;
  let landedPlatform = null;

  if (fighter.velocity.y >= 0) {
    for (const platform of getStagePlatforms(stage)) {
      if (isLandingOnPlatform(fighter, platform, input)) {
        landedPlatform = platform;
        break;
      }
    }
  }

  if (landedPlatform) {
    fighter.position.y = landedPlatform.y;
    fighter.velocity.y = 0;
    fighter.groundPlatformId = landedPlatform.id;
    fighter.groundPlatformKind = landedPlatform.kind;
    fighter.platformDropTimer = 0;
    if (wasAirborne) onFighterLanded(fighter);
    else fighter.grounded = true;
    return fighter;
  }

  if (fighter.grounded && !isStandingOnAnyPlatform(fighter, stage)) {
    fighter.grounded = false;
    fighter.groundPlatformId = null;
    fighter.groundPlatformKind = null;
    fighter.jumpsUsed = Math.max(fighter.jumpsUsed, 1);
    fighter.state.name = 'airborne';
  }

  if (!fighter.grounded) trySnapToLedge(fighter, stage, input);
  return fighter;
}

function applyGroundPhysics(fighter, moveDirection, stickMagnitude) {
  const stats = fighter.archetype;

  if (fighter.attack || fighter.hitstunFrames > 0 || fighter.state.name.startsWith('attack_')) {
    applyTraction(fighter, stats.brakeTraction);
    return;
  }

  switch (fighter.state.name) {
    case 'jump_squat':
      return;
    case 'walk': {
      if (moveDirection === 0) {
        applyTraction(fighter, stats.brakeTraction);
        return;
      }
      const currentDirection = Math.sign(fighter.velocity.x);
      const acceleration = currentDirection !== 0 && currentDirection !== moveDirection
        ? stats.turnaroundAcceleration
        : stats.walkAcceleration;
      fighter.velocity.x += moveDirection * acceleration * Math.max(0.35, stickMagnitude);
      const speedCap = stickMagnitude < stats.walkThreshold
        ? getMaxWalkSpeed(stats)
        : getMaxRunSpeed(stats) * 0.74;
      fighter.velocity.x = clamp(fighter.velocity.x, -speedCap, speedCap);
      return;
    }
    case 'dash':
      if (fighter.state.framesElapsed > 0) {
        fighter.velocity.x += fighter.facing * stats.runAcceleration * 0.20;
        fighter.velocity.x = clamp(fighter.velocity.x, -stats.maxRunSpeed, stats.maxRunSpeed);
      }
      return;
    case 'run':
      if (moveDirection === 0) {
        applyTraction(fighter, stats.skidTraction);
        return;
      }
      fighter.velocity.x += moveDirection * stats.runAcceleration * Math.max(0.55, stickMagnitude);
      fighter.velocity.x = clamp(fighter.velocity.x, -stats.maxRunSpeed, stats.maxRunSpeed);
      return;
    case 'skid':
      applyTraction(fighter, stats.skidTraction);
      if (Math.abs(fighter.velocity.x) < 0.08) fighter.state.name = moveDirection === 0 ? 'idle' : 'walk';
      return;
    case 'crouch':
      applyTraction(fighter, stats.brakeTraction);
      return;
    case 'landing':
      applyTraction(fighter, fighter.wasFastFallingOnLanding ? stats.skidTraction : stats.traction);
      return;
    default:
      if (moveDirection !== 0) {
        fighter.velocity.x += moveDirection * stats.walkAcceleration * Math.max(0.35, stickMagnitude);
        const maxWalkSpeed = getMaxWalkSpeed(stats);
        fighter.velocity.x = clamp(fighter.velocity.x, -maxWalkSpeed, maxWalkSpeed);
      } else {
        applyTraction(fighter, stats.traction);
      }
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyTraction(fighter, multiplier) {
  if (Math.abs(fighter.velocity.x) <= 0.025) {
    fighter.velocity.x = 0;
    return;
  }
  fighter.velocity.x *= multiplier;
}

function isLandingOnPlatform(fighter, platform, input) {
  const stats = fighter.archetype;
  const horizontalPadding = (fighter.ecb?.width ?? stats.width) * 0.34;
  const withinX = fighter.position.x >= platform.x - horizontalPadding
    && fighter.position.x <= platform.x + platform.w + horizontalPadding;
  const crossedTop = fighter.previousPosition.y <= platform.y && fighter.position.y >= platform.y;
  const droppingThrough = platform.kind === 'semisolid'
    && (isFullDownHeld(input, stats) || fighter.platformDropTimer > 0);
  const ledgeLocked = fighter.state.name === 'ledgeHang' || fighter.state.name === 'ledgeGetup';
  return withinX && crossedTop && !droppingThrough && !ledgeLocked;
}

function isStandingOnAnyPlatform(fighter, stage) {
  const horizontalPadding = (fighter.ecb?.width ?? fighter.archetype.width) * 0.34;
  return getStagePlatforms(stage).some(platform => {
    return Math.abs(fighter.position.y - platform.y) <= 0.5
      && fighter.position.x >= platform.x - horizontalPadding
      && fighter.position.x <= platform.x + platform.w + horizontalPadding;
  });
}

function trySnapToLedge(fighter, stage, input) {
  const stats = fighter.archetype;
  if (isFullDownHeld(input, stats)) return false;
  if (fighter.ledgeLockoutTimer > 0 || fighter.grounded || fighter.velocity.y < -0.25) return false;
  if (fighter.state.name === 'ledgeHang' || fighter.state.name === 'ledgeGetup') return false;

  for (const ledge of getMainLedges(stage)) {
    const outside = ledge.side < 0
      ? fighter.position.x <= ledge.x + 12
      : fighter.position.x >= ledge.x - 12;
    const closeX = Math.abs(fighter.position.x - ledge.x) <= stats.ledgeSnapX;
    const closeY = fighter.position.y >= ledge.y - stats.ledgeSnapTop
      && fighter.position.y <= ledge.y + stats.ledgeSnapBottom;
    if (!outside || !closeX || !closeY) continue;

    fighter.ledge = ledge;
    fighter.grounded = false;
    fighter.groundPlatformId = null;
    fighter.groundPlatformKind = null;
    fighter.platformDropTimer = 0;
    fighter.fastFalling = false;
    fighter.fastFallArmed = true;
    fighter.velocity.x = 0;
    fighter.velocity.y = 0;
    fighter.position.x = ledge.x - ledge.side * 18;
    fighter.position.y = ledge.y + stats.ledgeHangYOffset;
    fighter.facing = -ledge.side;
    fighter.jumpsUsed = 1;
    fighter.state.name = 'ledgeHang';
    fighter.state.framesElapsed = 0;
    fighter.state.framesRemaining = 0;
    return true;
  }
  return false;
}

function didFullDownTap(inputBuffer, stats) {
  if (!inputBuffer) return false;
  const current = inputBuffer.current ?? {};
  const previous = inputBuffer.previous ?? {};
  const crossed = current.moveY >= stats.platformDropThreshold
    && (previous.moveY ?? 0) < stats.platformDropThreshold;
  if (!crossed) return false;

  if (typeof inputBuffer.consumeBuffered === 'function') inputBuffer.consumeBuffered('down');
  return true;
}

function isFullDownHeld(input, stats) {
  return (input.moveY ?? 0) >= stats.platformDropThreshold;
}

function getMoveDirection(input, stats) {
  return Math.abs(input.moveX ?? 0) >= (stats.stickDeadzone ?? 0.16) ? Math.sign(input.moveX) : 0;
}

function getStickMagnitude(input) {
  return Math.min(1, Math.hypot(input.moveX ?? 0, input.moveY ?? 0));
}

function getMaxWalkSpeed(stats) {
  return stats.maxWalkSpeed ?? stats.walkSpeed ?? stats.maxGroundSpeed ?? 1;
}

function getMaxRunSpeed(stats) {
  return stats.maxRunSpeed ?? stats.runSpeed ?? stats.maxGroundSpeed ?? getMaxWalkSpeed(stats);
}
