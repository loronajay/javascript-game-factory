import { FIGHTER_ARCHETYPES } from '../characters/archetypes.js';

export function createFighter({
  id,
  archetype = FIGHTER_ARCHETYPES.vanguard,
  position = { x: 0, y: 0 },
  facing = 1,
} = {}) {
  return {
    id,
    archetype,
    position: { x: position.x, y: position.y },
    previousPosition: { x: position.x, y: position.y },
    velocity: { x: 0, y: 0 },
    facing,
    grounded: position.y >= 0,
    jumpsUsed: 0,
    damage: archetype.damage,
    hitstunFrames: 0,
    attack: null,
    jumpType: 'none',
    dashTimer: 0,
    lastDashDirection: 0,
    fastFalling: false,
    fastFallArmed: true,
    wasFastFallingOnLanding: false,
    groundPlatformId: null,
    groundPlatformKind: null,
    platformDropTimer: 0,
    ledge: null,
    ledgeLockoutTimer: 0,
    ledgeGetupTimer: 0,
    ecb: { ...(archetype.ecb ?? { width: archetype.width, height: archetype.height }) },
    state: { name: 'idle', framesElapsed: 0, framesRemaining: 0 },
  };
}

export function setFighterState(fighter, name, framesRemaining = 0) {
  fighter.state = {
    name,
    framesElapsed: 0,
    framesRemaining,
  };
}

export function tickFighterState(fighter, inputBuffer) {
  if (fighter.state.name === 'ledgeHang' || fighter.state.name === 'ledgeGetup') {
    tickLedgeState(fighter, inputBuffer);
    return fighter.state;
  }

  if (fighter.hitstunFrames > 0) {
    fighter.attack = null;
    fighter.hitstunFrames -= 1;
    setFighterState(fighter, 'hitstun', fighter.hitstunFrames);
    return fighter.state;
  }

  if (fighter.attack) {
    tickAttackState(fighter);
    return fighter.state;
  }

  fighter.state.framesElapsed += 1;

  if (fighter.state.name === 'jump_squat') {
    fighter.state.framesRemaining -= 1;
    if (fighter.state.framesRemaining > 0) return fighter.state;
    fighter.velocity.y = inputBuffer.isHeld('jump')
      ? fighter.archetype.fullHopVelocity
      : fighter.archetype.shortHopVelocity;
    fighter.grounded = false;
    fighter.jumpsUsed += 1;
    fighter.fastFalling = false;
    fighter.fastFallArmed = true;
    fighter.jumpType = inputBuffer.isHeld('jump') ? 'full hop' : 'short hop';
    setFighterState(fighter, 'airborne');
    return fighter.state;
  }

  if (fighter.state.name === 'landing') {
    fighter.state.framesRemaining -= 1;
    if (fighter.state.framesRemaining > 0) return fighter.state;
    if (inputBuffer.consumeBuffered('jump')) {
      startJumpSquat(fighter);
      return fighter.state;
    }
    setFighterState(fighter, Math.abs(fighter.velocity.x) > 0.08 ? 'skid' : 'idle');
    return fighter.state;
  }

  if (inputBuffer.consumeBuffered('attack')) {
    startAttack(fighter, pickAttackName(fighter, inputBuffer.current));
    return fighter.state;
  }

  if (fighter.grounded && inputBuffer.consumeBuffered('jump')) {
    startJumpSquat(fighter);
    return fighter.state;
  }

  if (fighter.grounded && shouldDropThroughPlatform(fighter, inputBuffer.current)) {
    startPlatformDropThrough(fighter);
    return fighter.state;
  }

  if (fighter.grounded && isCrouchInput(fighter, inputBuffer.current)) {
    setFighterState(fighter, 'crouch');
    return fighter.state;
  }

  if (!fighter.grounded && inputBuffer.consumeBuffered('jump') && fighter.jumpsUsed < fighter.archetype.maxJumps) {
    fighter.velocity.y = fighter.archetype.doubleJumpVelocity;
    fighter.jumpsUsed += 1;
    fighter.fastFalling = false;
    fighter.fastFallArmed = true;
    fighter.jumpType = 'double jump';
    setFighterState(fighter, 'airborne');
    return fighter.state;
  }

  if (!fighter.grounded) {
    setFighterState(fighter, 'airborne');
    return fighter.state;
  }

  const moveX = inputBuffer.current.moveX;
  const moveAbs = Math.abs(moveX);
  const moveDirection = getMoveDirection(inputBuffer.current, fighter.archetype);
  const stickMagnitude = getStickMagnitude(inputBuffer.current);

  if (fighter.state.name === 'dash') {
    fighter.dashTimer += 1;
    if (moveDirection !== 0
      && moveDirection !== fighter.lastDashDirection
      && fighter.dashTimer <= fighter.archetype.dashDanceWindowFrames
      && isDashInput(fighter, inputBuffer)) {
      startDash(fighter, moveDirection, true);
      return fighter.state;
    }
    if (moveDirection === 0) {
      setFighterState(fighter, 'skid');
      return fighter.state;
    }
    fighter.facing = moveDirection;
    fighter.lastDashDirection = moveDirection;
    if (fighter.dashTimer >= fighter.archetype.initialDashFrames) {
      setFighterState(fighter, wantsRunHold(inputBuffer.current, fighter.archetype) ? 'run' : 'walk');
    }
    return fighter.state;
  }

  if (fighter.state.name === 'run' && moveDirection !== 0 && Math.sign(fighter.velocity.x || fighter.facing) !== moveDirection) {
    setFighterState(fighter, 'skid');
    return fighter.state;
  }

  if (moveDirection !== 0) fighter.facing = moveDirection;

  if (isDashInput(fighter, inputBuffer)) {
    startDash(fighter, moveDirection);
    return fighter.state;
  }

  if (moveAbs >= (fighter.archetype.stickDeadzone ?? fighter.archetype.walkThreshold) || moveDirection !== 0) {
    setFighterState(fighter, stickMagnitude >= fighter.archetype.walkThreshold ? 'run' : 'walk');
    return fighter.state;
  }

  if (fighter.state.name === 'skid' && Math.abs(fighter.velocity.x) > 0.08) {
    return fighter.state;
  }

  setFighterState(fighter, 'idle');
  return fighter.state;
}

export function onFighterLanded(fighter) {
  fighter.grounded = true;
  fighter.jumpsUsed = 0;
  fighter.wasFastFallingOnLanding = fighter.fastFalling;
  fighter.fastFalling = false;
  fighter.fastFallArmed = true;
  fighter.jumpType = 'none';
  const landingFrames = fighter.wasFastFallingOnLanding
    ? fighter.archetype.hardLandingLagFrames
    : fighter.archetype.landingLagFrames;
  setFighterState(fighter, 'landing', landingFrames);
}

export function getFighterActionLock(fighter) {
  return Boolean(fighter.attack || fighter.hitstunFrames > 0 || fighter.state.name === 'jump_squat');
}

function startAttack(fighter, attackName) {
  const definition = fighter.archetype.attacks?.[attackName] ?? fighter.archetype.attacks?.neutral;
  if (!definition) return;

  fighter.attack = {
    name: attackName,
    definition,
    frame: 0,
    hitVictims: new Set(),
  };
  setFighterState(fighter, `attack_${attackName}`, definition.totalFrames);
}

function tickAttackState(fighter) {
  fighter.attack.frame += 1;
  fighter.state.framesElapsed += 1;
  fighter.state.framesRemaining = Math.max(fighter.attack.definition.totalFrames - fighter.attack.frame, 0);

  if (fighter.attack.frame >= fighter.attack.definition.totalFrames) {
    fighter.attack = null;
    setFighterState(fighter, fighter.grounded ? 'idle' : 'airborne');
  }
}

function pickAttackName(fighter, inputFrame) {
  if ((inputFrame.attackX === fighter.facing || inputFrame.moveX * fighter.facing > 0.5) && fighter.archetype.attacks?.forward) {
    return 'forward';
  }
  return 'neutral';
}

function isDashInput(fighter, inputBuffer) {
  const currentDirection = getMoveDirection(inputBuffer.current, fighter.archetype);
  const previousDirection = getMoveDirection(inputBuffer.previous ?? { moveX: 0, moveY: 0 }, fighter.archetype);
  const currentMagnitude = getStickMagnitude(inputBuffer.current);
  const previousMagnitude = getStickMagnitude(inputBuffer.previous ?? { moveX: 0, moveY: 0 });
  return currentDirection !== 0
    && currentMagnitude >= fighter.archetype.dashTapThreshold
    && (previousDirection !== currentDirection || previousMagnitude < fighter.archetype.dashTapThreshold);
}

function startJumpSquat(fighter) {
  fighter.jumpType = 'pending';
  setFighterState(fighter, 'jump_squat', fighter.archetype.jumpSquatFrames);
}

function startDash(fighter, direction, isDashDanceTurn = false) {
  if (direction === 0) return;
  fighter.facing = direction;
  fighter.lastDashDirection = direction;
  fighter.dashTimer = 0;
  fighter.velocity.x = direction * (isDashDanceTurn ? fighter.archetype.dashTurnSpeed : fighter.archetype.dashInitialSpeed);
  setFighterState(fighter, 'dash', fighter.archetype.initialDashFrames);
}

function startPlatformDropThrough(fighter) {
  fighter.grounded = false;
  fighter.groundPlatformId = null;
  fighter.groundPlatformKind = null;
  fighter.platformDropTimer = fighter.archetype.platformDropFrames;
  fighter.position.y += 4;
  fighter.velocity.y = Math.max(fighter.velocity.y, 1.35);
  fighter.jumpsUsed = Math.max(fighter.jumpsUsed, 1);
  fighter.fastFallArmed = false;
  setFighterState(fighter, 'dropThrough');
}

function tickLedgeState(fighter, inputBuffer) {
  if (fighter.state.name === 'ledgeGetup') {
    fighter.ledgeGetupTimer += 1;
    if (fighter.ledgeGetupTimer >= fighter.archetype.ledgeGetupFrames) {
      setFighterState(fighter, 'idle');
    }
    return;
  }

  if (!fighter.ledge) {
    setFighterState(fighter, fighter.grounded ? 'idle' : 'airborne');
    return;
  }

  fighter.velocity.x = 0;
  fighter.velocity.y = 0;
  fighter.position.x = fighter.ledge.x - fighter.ledge.side * 18;
  fighter.position.y = fighter.ledge.y + fighter.archetype.ledgeHangYOffset;
  fighter.facing = -fighter.ledge.side;

  if (inputBuffer.wasPressed('jump') || inputBuffer.consumeBuffered('jump')) {
    startLedgeJump(fighter);
    return;
  }

  const inward = -fighter.ledge.side;
  if (getMoveDirection(inputBuffer.current, fighter.archetype) === inward
    && getStickMagnitude(inputBuffer.current) >= fighter.archetype.walkThreshold) {
    startLedgeGetup(fighter);
  }
}

function startLedgeJump(fighter) {
  const inward = -fighter.ledge.side;
  fighter.position.x = fighter.ledge.x + inward * 28;
  fighter.position.y = fighter.ledge.y - 3;
  fighter.velocity.x = inward * fighter.archetype.ledgeJumpInwardSpeed;
  fighter.velocity.y = fighter.archetype.ledgeJumpVelocity;
  fighter.facing = inward;
  fighter.grounded = false;
  fighter.ledge = null;
  fighter.ledgeLockoutTimer = fighter.archetype.ledgeReleaseLockoutFrames;
  fighter.jumpsUsed = 1;
  fighter.fastFalling = false;
  fighter.fastFallArmed = true;
  setFighterState(fighter, 'airborne');
}

function startLedgeGetup(fighter) {
  const inward = -fighter.ledge.side;
  fighter.position.x = fighter.ledge.x + inward * 44;
  fighter.position.y = fighter.ledge.y;
  fighter.velocity.x = 0;
  fighter.velocity.y = 0;
  fighter.facing = inward;
  fighter.grounded = true;
  fighter.groundPlatformId = 'main';
  fighter.groundPlatformKind = 'solid';
  fighter.ledge = null;
  fighter.ledgeGetupTimer = 0;
  fighter.jumpsUsed = 0;
  fighter.fastFalling = false;
  fighter.fastFallArmed = true;
  setFighterState(fighter, 'ledgeGetup', fighter.archetype.ledgeGetupFrames);
}

function shouldDropThroughPlatform(fighter, inputFrame) {
  return fighter.groundPlatformKind === 'semisolid'
    && inputFrame.moveY >= fighter.archetype.platformDropThreshold
    && fighter.state.name !== 'landing'
    && fighter.state.name !== 'jump_squat';
}

function isCrouchInput(fighter, inputFrame) {
  return inputFrame.moveY >= (fighter.archetype.crouchThreshold ?? 0.34)
    && Math.abs(inputFrame.moveX ?? 0) < (fighter.archetype.dashTapThreshold ?? 0.72);
}

function wantsRunHold(inputFrame, stats) {
  return getMoveDirection(inputFrame, stats) !== 0 && getStickMagnitude(inputFrame) >= stats.walkThreshold;
}

function getMoveDirection(inputFrame, stats) {
  return Math.abs(inputFrame.moveX) >= (stats.stickDeadzone ?? 0.16) ? Math.sign(inputFrame.moveX) : 0;
}

function getStickMagnitude(inputFrame) {
  return Math.min(1, Math.hypot(inputFrame.moveX, inputFrame.moveY));
}
