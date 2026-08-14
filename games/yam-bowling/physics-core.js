(function exposePhysicsCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPhysicsCore() {
  const RACK_FRONT_Z = 0.86;
  const Z_SCALE = 11.76;
  const PHYSICS_START_Z = 0.735;
  const BALL_RADIUS = 0.12;
  const PIN_RADIUS = 0.067;
  const FALLEN_PIN_RADIUS = 0.092;
  const BALL_MASS = 3.4;
  const PIN_MASS = 1;
  const PIN_TIP_SINGLE = 0.72;
  const PIN_TIP_ACCUM = 0.95;
  const CHARGE_DURATION_SECONDS = 1.35;
  const MIN_THROW_POWER = 0.08;
  const MIN_BALL_SPEED = 0.32;
  const MAX_BALL_SPEED = 0.95;
  const SPIN_SWEEP_SECONDS = 1.4;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function chargePowerAtTime(elapsedSeconds) {
    if (!Number.isFinite(elapsedSeconds)) throw new TypeError("Charge time must be a finite number.");
    const charge = clamp(elapsedSeconds / CHARGE_DURATION_SECONDS, 0, 1);
    return MIN_THROW_POWER + charge * (1 - MIN_THROW_POWER);
  }

  function chargeStateAtTime(elapsedSeconds, profile = {}) {
    if (!Number.isFinite(elapsedSeconds)) throw new TypeError("Charge time must be a finite number.");
    const chargeSpeed = Number.isFinite(profile.chargeSpeed) && profile.chargeSpeed > 0 ? profile.chargeSpeed : 1;
    const grace = Number.isFinite(profile.overchargeGrace) ? Math.max(0, profile.overchargeGrace) : 0.18;
    const tolerance = Number.isFinite(profile.overchargeTolerance) && profile.overchargeTolerance > 0 ? profile.overchargeTolerance : 1;
    const timeToFull = CHARGE_DURATION_SECONDS / chargeSpeed;
    const safeElapsed = Math.max(0, elapsedSeconds);
    if (safeElapsed < timeToFull) {
      return {
        phase: "charging",
        power: chargePowerAtTime(safeElapsed * chargeSpeed),
        penalty: 0,
        timeToFull,
      };
    }
    const overheld = safeElapsed - timeToFull;
    if (overheld <= grace) return { phase: "sweet-spot", power: 1, penalty: 0, timeToFull };
    const penalty = clamp((overheld - grace) / (0.9 * tolerance), 0, 1) * 0.48;
    return { phase: "overcharged", power: 1 - penalty, penalty, timeToFull };
  }

  function spinAtTime(elapsedSeconds, meterSpeed = 1) {
    if (!Number.isFinite(elapsedSeconds)) throw new TypeError("Spin time must be a finite number.");
    if (!Number.isFinite(meterSpeed) || meterSpeed <= 0) throw new RangeError("Spin meter speed must be greater than zero.");
    return -Math.cos((elapsedSeconds * meterSpeed / SPIN_SWEEP_SECONDS) * Math.PI * 2);
  }

  function ballSpeedForShot({ power = MIN_THROW_POWER, speedScale = 1 } = {}) {
    const chargedSpeed = MIN_BALL_SPEED + clamp(power, 0, 1) * (MAX_BALL_SPEED - MIN_BALL_SPEED);
    return chargedSpeed * speedScale;
  }

  function createRack() {
    const homes = [
      [0, 0.86], [-0.17, 0.885], [0.17, 0.885], [-0.34, 0.91], [0, 0.91],
      [0.34, 0.91], [-0.51, 0.935], [-0.17, 0.935], [0.17, 0.935], [0.51, 0.935],
    ];
    return homes.map(([x, z], index) => {
      const y = (z - RACK_FRONT_Z) * Z_SCALE;
      return {
        id: index + 1,
        homeX: x,
        homeY: y,
        x,
        y,
        vx: 0,
        vy: 0,
        mass: PIN_MASS,
        standing: true,
        contacted: false,
        impulseAccum: 0,
        fall: 0,
        fallAxisX: index % 2 ? 0.9 : -0.9,
        fallAxisY: 0.35,
      };
    });
  }

  function hookBreakpointForPower(power = 0.7) {
    return 0.34 + clamp(power, 0, 1) * 0.24;
  }

  function hookCurve(z, { power = 0.7 } = {}) {
    const breakpoint = hookBreakpointForPower(power);
    if (z <= breakpoint) return { progress: 0, slope: 0, curvature: 0 };
    const remainingLane = 1 - breakpoint;
    const progress = clamp((z - breakpoint) / remainingLane, 0, 1.15);
    return {
      progress: progress * progress,
      slope: 2 * progress / remainingLane,
      curvature: 2 / (remainingLane * remainingLane),
    };
  }

  function hookStrength({ hook = 0, hookScale = 1, power = 0.7 } = {}) {
    return hook * hookScale * 0.32 * (1.12 - clamp(power, 0, 1) * 0.25);
  }

  function trajectoryX(z, shot = {}) {
    const { position = 0, aim = 0, release = 0 } = shot;
    const releaseProgress = clamp(z / 0.2, 0, 1);
    return position + aim * z + release * releaseProgress + hookStrength(shot) * hookCurve(z, shot).progress;
  }

  function trajectoryDerivative(z, shot = {}) {
    const releaseSlope = z > 0 && z < 0.2 ? (shot.release || 0) / 0.2 : 0;
    return (shot.aim || 0) + releaseSlope + hookStrength(shot) * hookCurve(z, shot).slope;
  }

  function trajectorySecondDerivative(z, shot = {}) {
    return hookStrength(shot) * hookCurve(z, shot).curvature;
  }

  function resolveContact(a, b, radiusA, radiusB, restitution) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const minimum = radiusA + radiusB;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimum * minimum) return 0;
    let distance = Math.sqrt(Math.max(distanceSquared, 1e-10));
    if (distanceSquared < 1e-10) { dx = 0.001; dy = 0; distance = 0.001; }
    const nx = dx / distance;
    const ny = dy / distance;
    const invA = 1 / a.mass;
    const invB = 1 / b.mass;
    const invSum = invA + invB;
    const correction = Math.max(0, minimum - distance - 0.001) * 0.82 / invSum;
    a.x -= nx * correction * invA;
    a.y -= ny * correction * invA;
    b.x += nx * correction * invB;
    b.y += ny * correction * invB;
    const relativeX = b.vx - a.vx;
    const relativeY = b.vy - a.vy;
    const normalVelocity = relativeX * nx + relativeY * ny;
    if (normalVelocity >= 0) return 0;
    const impulse = -(1 + restitution) * normalVelocity / invSum;
    a.vx -= impulse * nx * invA;
    a.vy -= impulse * ny * invA;
    b.vx += impulse * nx * invB;
    b.vy += impulse * ny * invB;
    const tx = -ny;
    const ty = nx;
    const tangentVelocity = relativeX * tx + relativeY * ty;
    const friction = clamp(-tangentVelocity / invSum, -impulse * 0.18, impulse * 0.18);
    a.vx -= friction * tx * invA;
    a.vy -= friction * ty * invA;
    b.vx += friction * tx * invB;
    b.vy += friction * ty * invB;
    return impulse;
  }

  function knockPin(pin, sourceX, impulse) {
    if (!pin.standing) return;
    pin.standing = false;
    pin.contacted = true;
    pin.fall = Math.max(pin.fall, 0.04);
    pin.fallAxisX = clamp((pin.x - sourceX) * 4, -0.96, 0.96) || (pin.id % 2 ? 0.9 : -0.9);
    pin.fallAxisY = 0.36 + Math.min(0.5, impulse * 0.12);
    const length = Math.hypot(pin.fallAxisX, pin.fallAxisY) || 1;
    pin.fallAxisX /= length;
    pin.fallAxisY /= length;
  }

  function registerImpact(pin, impulse, sourceX) {
    if (impulse <= 0) return;
    pin.contacted = true;
    pin.impulseAccum += impulse;
    if (impulse >= PIN_TIP_SINGLE || pin.impulseAccum >= PIN_TIP_ACCUM) knockPin(pin, sourceX, impulse);
  }

  function pinRadius(pin) {
    return pin.standing ? PIN_RADIUS : FALLEN_PIN_RADIUS;
  }

  function createSimulation(pins, shot) {
    const speed = ballSpeedForShot(shot);
    const ballX = trajectoryX(PHYSICS_START_Z, shot);
    return {
      pins: pins.map((pin) => ({ ...pin })),
      startStanding: pins.filter((pin) => pin.standing).length,
      elapsed: 0,
      quiet: 0,
      complete: false,
      firstContact: false,
      ball: {
        x: ballX,
        y: (PHYSICS_START_Z - RACK_FRONT_Z) * Z_SCALE,
        vx: trajectoryDerivative(PHYSICS_START_Z, shot) * speed,
        vy: speed * Z_SCALE,
        mass: BALL_MASS * (shot.massScale || 1),
        hookAcceleration: trajectorySecondDerivative(PHYSICS_START_Z, shot) * speed * speed * 0.75,
        active: true,
      },
    };
  }

  function stepSimulation(simulation, dt) {
    if (simulation.complete) return simulation;
    const { ball, pins } = simulation;
    simulation.elapsed += dt;
    if (ball.active) {
      ball.vx += ball.hookAcceleration * (simulation.firstContact ? 0.16 : 1) * dt;
      const damping = Math.exp(-0.12 * dt);
      ball.vx *= damping;
      ball.vy *= damping;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (Math.abs(ball.x) > 0.96 || ball.y > 1.62) ball.active = false;
    }

    const pinDamping = Math.exp(-3.35 * dt);
    for (const pin of pins) {
      if (pin.contacted || !pin.standing) {
        pin.vx *= pinDamping;
        pin.vy *= pinDamping;
        pin.x += pin.vx * dt;
        pin.y += pin.vy * dt;
      }
      if (!pin.standing) pin.fall = Math.min(1, pin.fall + dt * 4.8);
      if (pin.standing) {
        pin.x = clamp(pin.x, -0.8, 0.8);
        pin.y = clamp(pin.y, 0, 0.965);
      }
    }

    for (let iteration = 0; iteration < 3; iteration += 1) {
      if (ball.active) {
        for (const pin of pins) {
          const impulse = resolveContact(ball, pin, BALL_RADIUS, pinRadius(pin), 0.2);
          if (impulse > 0) {
            simulation.firstContact = true;
            registerImpact(pin, impulse, ball.x);
          }
        }
      }
      for (let i = 0; i < pins.length; i += 1) {
        for (let j = i + 1; j < pins.length; j += 1) {
          const a = pins[i];
          const b = pins[j];
          if (!a.contacted && !b.contacted && a.standing && b.standing) continue;
          const impulse = resolveContact(a, b, pinRadius(a), pinRadius(b), 0.24);
          if (impulse > 0) {
            registerImpact(a, impulse, b.x);
            registerImpact(b, impulse, a.x);
          }
        }
      }
    }

    const maxSpeed = pins.reduce((highest, pin) => Math.max(highest, Math.hypot(pin.vx, pin.vy)), 0);
    simulation.quiet = maxSpeed < 0.1 ? simulation.quiet + dt : 0;
    if ((simulation.quiet > 0.3 && !ball.active) || simulation.elapsed > 2.3) simulation.complete = true;
    return simulation;
  }

  function knockedCount(simulation) {
    return simulation.startStanding - simulation.pins.filter((pin) => pin.standing).length;
  }

  function clearFallen(pins) {
    return pins.filter((pin) => pin.standing).map((pin) => ({
      ...pin,
      vx: 0,
      vy: 0,
      contacted: false,
      impulseAccum: 0,
      fall: 0,
    }));
  }

  return {
    RACK_FRONT_Z,
    Z_SCALE,
    PHYSICS_START_Z,
    BALL_RADIUS,
    PIN_RADIUS,
    CHARGE_DURATION_SECONDS,
    MIN_THROW_POWER,
    SPIN_SWEEP_SECONDS,
    chargePowerAtTime,
    chargeStateAtTime,
    spinAtTime,
    ballSpeedForShot,
    hookBreakpointForPower,
    createRack,
    trajectoryX,
    trajectoryDerivative,
    trajectorySecondDerivative,
    resolveContact,
    createSimulation,
    stepSimulation,
    knockedCount,
    clearFallen,
  };
});
