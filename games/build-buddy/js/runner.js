import { PHYS, RUNNER } from './constants.js';
import { approach, rectsOverlap, clamp } from './utils.js';
import { SafeStateSystem } from './systems/safe-state-system.js';

export class Runner {
  constructor(stage) {
    this.stage = stage;
    this.w = RUNNER.width;
    this.h = RUNNER.height;
    this.spawnAt(stage.start.x, stage.start.y);
    this.deaths = 0;
    this.repositions = 0;
    this.safeStateSystem = new SafeStateSystem(stage, this);
    this.ignoredOneWayId = null;
    this.ignoredOneWayTimer = 0;
    this.jumpHoldTimer = 0;
    this.jumpHeldLast = false;
    this.message = '';
    this.messageTime = 0;
  }

  spawnAt(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.onGroundId = null;
    this.climbing = false;
    this.climbWall = null;
    this.dead = false;
    this.respawnTimer = 0;
    this.hasDoubleJump = true;
  }

  rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  prevRect() {
    return { x: this.prevX, y: this.prevY, w: this.w, h: this.h };
  }

  hazardHurtRect() {
    // Hazards should not use the Runner's full physics body. The full body is useful
    // for platform collision, but it makes spikes feel unfair because the invisible
    // sides/top of the rectangle can graze a lethal strip before the sprite appears
    // to touch it.
    return {
      x: this.x + 7,
      y: this.y + 6,
      w: this.w - 14,
      h: this.h - 12,
    };
  }

  hazardKillRect(hazard) {
    // Stage hazards are authored as broad visual strips. Use a slightly inset lethal
    // core so the visible spike art and the actual death check feel aligned.
    return {
      x: hazard.x + 8,
      y: hazard.y + 6,
      w: Math.max(0, hazard.w - 16),
      h: Math.max(0, hazard.h - 10),
    };
  }

  safetyNoBuildRect() {
    return { x: this.x - 34, y: this.y - 28, w: this.w + 68, h: this.h + 56 };
  }

  update(dt, input, registry) {
    this.messageTime = Math.max(0, this.messageTime - dt);
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(registry);
      return;
    }

    this.prevX = this.x;
    this.prevY = this.y;

    if (this.ignoredOneWayTimer > 0) {
      this.ignoredOneWayTimer -= dt;
      if (this.ignoredOneWayTimer <= 0) this.ignoredOneWayId = null;
    }

    if (input.consumeReposition()) this.reposition(registry);

    const jumpPressed = input.consumeJumpPressed();
    const jumpHeld = input.jumpHeld();

    if (this.climbing) {
      this.updateClimb(dt, input, jumpPressed);
    } else {
      this.updateNormal(dt, input, jumpPressed, jumpHeld);
      this.resolveCollisions(dt, input, registry);
      this.tryEnterClimb(input);
    }

    this.updateCheckpoint(registry);
    this.safeStateSystem.update(dt, registry);

    if (this.y > this.stage.deathY) this.kill('fell');
    const hazardBody = this.hazardHurtRect();
    for (const hazard of this.stage.hazards) {
      if (rectsOverlap(hazardBody, this.hazardKillRect(hazard))) this.kill('hazard');
    }
  }

  updateNormal(dt, input, jumpPressed, jumpHeld) {
    const axis = input.axisX();
    if (axis !== 0) this.facing = axis;
    const accel = this.grounded ? PHYS.groundAccel : PHYS.airAccel;

    if (axis !== 0) {
      const reversing = Math.sign(this.vx) !== axis && Math.abs(this.vx) > 120 && this.grounded;
      const useAccel = reversing ? PHYS.brakeAccel : accel;
      this.vx = approach(this.vx, axis * PHYS.maxRunSpeed, useAccel * dt);
    } else if (this.grounded) {
      this.vx = approach(this.vx, 0, PHYS.groundFriction * dt);
    }

    if (jumpPressed) {
      if (this.grounded) {
        this.vy = PHYS.jumpVy;
        this.grounded = false;
        this.onGroundId = null;
        this.jumpHoldTimer = PHYS.maxJumpHold;
      } else if (this.hasDoubleJump) {
        this.vy = PHYS.doubleJumpVy;
        this.hasDoubleJump = false;
        this.jumpHoldTimer = 0;
      }
    }

    if (!jumpHeld && this.vy < 0 && this.jumpHoldTimer > 0) {
      this.vy *= PHYS.shortHopCut;
      this.jumpHoldTimer = 0;
    }

    let gravityScale = 1;
    if (jumpHeld && this.vy < 0 && this.jumpHoldTimer > 0) {
      gravityScale = PHYS.jumpHoldGravityScale;
      this.jumpHoldTimer -= dt;
    }

    this.vy = Math.min(PHYS.maxFallSpeed, this.vy + PHYS.gravity * gravityScale * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, 0, this.stage.width - this.w);
  }

  updateClimb(dt, input, jumpPressed) {
    const wall = this.climbWall;
    if (!wall) {
      this.exitClimb();
      return;
    }

    const vertical = (input.downHeld() ? 1 : 0) - (input.upHeld() ? 1 : 0);
    this.vx = 0;
    this.vy = vertical * PHYS.climbSpeed;
    this.y += this.vy * dt;

    const wallSide = this.x + this.w / 2 < wall.x + wall.w / 2 ? -1 : 1;
    this.x = wallSide < 0 ? wall.x - this.w : wall.x + wall.w;
    this.facing = -wallSide;

    if (jumpPressed) {
      // Jump away from the contacted wall. In v3 this vector pointed into the wall on one side.
      this.vx = wallSide * PHYS.climbJumpVx;
      this.vy = PHYS.climbJumpVy;
      this.climbing = false;
      this.climbWall = null;
      this.grounded = false;
      this.hasDoubleJump = true;
      this.facing = wallSide;
      this.x += wallSide * 10;
      return;
    }

    if (wall.topStand && this.y + this.h <= wall.y + 18) {
      this.x = clamp(this.x, wall.topStand.x, wall.topStand.x + wall.topStand.w - this.w);
      this.y = wall.topStand.y - this.h;
      this.vx = 0;
      this.vy = 0;
      this.climbing = false;
      this.climbWall = null;
      this.grounded = true;
      this.hasDoubleJump = true;
      this.onGroundId = wall.topStand.id ?? `${wall.id}_top`;
      return;
    }

    const floorBelow = this.findFloorBelow(8);
    if (vertical > 0 && floorBelow && this.y + this.h >= floorBelow.y) {
      this.y = floorBelow.y - this.h;
      this.vy = 0;
      this.climbing = false;
      this.climbWall = null;
      this.grounded = true;
      this.hasDoubleJump = true;
      this.onGroundId = floorBelow.id;
      return;
    }

    const stillTouching = rectsOverlap(this.rect(), { x: wall.x - 2, y: wall.y, w: wall.w + 4, h: wall.h });
    if (!stillTouching || this.y > wall.y + wall.h + 4) this.exitClimb();
  }

  exitClimb() {
    this.climbing = false;
    this.climbWall = null;
    this.grounded = false;
  }

  tryEnterClimb(input) {
    if (this.grounded || input.downHeld()) return;
    const rr = this.rect();
    for (const wall of this.stage.climbables) {
      const expanded = { x: wall.x - 3, y: wall.y, w: wall.w + 6, h: wall.h };
      if (rectsOverlap(rr, expanded) && this.vy > -500) {
        this.climbing = true;
        this.climbWall = wall;
        this.vx = 0;
        this.vy = 0;
        this.hasDoubleJump = true;
        return;
      }
    }
  }

  resolveCollisions(dt, input, registry) {
    const previousGrounded = this.grounded;
    const previousGroundId = this.onGroundId;
    const oneWayIds = new Set([...this.stage.oneWays, ...registry.platforms()].map(p => p.id));
    if (input.downHeld() && previousGrounded && oneWayIds.has(previousGroundId)) {
      this.ignoredOneWayId = previousGroundId;
      this.ignoredOneWayTimer = 0.32;
      this.y += 10;
    }

    this.grounded = false;
    this.onGroundId = null;

    const solids = [
      ...this.stage.solids,
      ...this.stage.climbables.map(w => w.topStand).filter(Boolean),
    ];
    for (const solid of solids) this.resolveSolid(solid);

    const oneWays = [...this.stage.oneWays, ...registry.platforms()];

    for (const p of oneWays) {
      if (p.id === this.ignoredOneWayId) continue;
      const wasAbove = this.prevY + this.h <= p.y + 3;
      const falling = this.vy >= 0;
      const horizontallyOverlapping = this.x + this.w > p.x + 4 && this.x < p.x + p.w - 4;
      const crossed = this.y + this.h >= p.y && this.prevY + this.h <= p.y + Math.max(8, Math.abs(this.vy * dt) + 2);
      if (wasAbove && falling && horizontallyOverlapping && crossed && !input.downHeld()) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.grounded = true;
        this.hasDoubleJump = true;
        this.onGroundId = p.id;
      }
    }

    for (const spring of registry.springs()) {
      const wasAbove = this.prevY + this.h <= spring.y + 6;
      const falling = this.vy >= 0;
      const overlap = this.x + this.w > spring.x + 4 && this.x < spring.x + spring.w - 4 && this.y + this.h >= spring.y && this.y < spring.y + spring.h;
      if (wasAbove && falling && overlap) {
        this.y = spring.y - this.h;
        this.vy = spring.bounceVy;
        this.grounded = false;
        this.onGroundId = null;
        this.message = spring.toolType.replace('spring', '') + ' bounce';
        this.messageTime = 0.6;
      }
    }
  }

  resolveSolid(solid) {
    const rr = this.rect();
    if (!rectsOverlap(rr, solid)) return;
    const prev = this.prevRect();

    const fromTop = prev.y + prev.h <= solid.y;
    const fromBottom = prev.y >= solid.y + solid.h;
    const fromLeft = prev.x + prev.w <= solid.x;
    const fromRight = prev.x >= solid.x + solid.w;

    if (fromTop && this.vy >= 0) {
      this.y = solid.y - this.h;
      this.vy = 0;
      this.grounded = true;
      this.hasDoubleJump = true;
      this.onGroundId = solid.id;
    } else if (fromBottom && this.vy < 0) {
      this.y = solid.y + solid.h;
      this.vy = 0;
    } else if (fromLeft) {
      this.x = solid.x - this.w;
      this.vx = Math.min(0, this.vx);
    } else if (fromRight) {
      this.x = solid.x + solid.w;
      this.vx = Math.max(0, this.vx);
    } else {
      const dxLeft = Math.abs((this.x + this.w) - solid.x);
      const dxRight = Math.abs(this.x - (solid.x + solid.w));
      const dyTop = Math.abs((this.y + this.h) - solid.y);
      const min = Math.min(dxLeft, dxRight, dyTop);
      if (min === dyTop) {
        this.y = solid.y - this.h;
        this.vy = 0;
        this.grounded = true;
        this.hasDoubleJump = true;
        this.onGroundId = solid.id;
      } else if (dxLeft < dxRight) {
        this.x = solid.x - this.w;
        this.vx = Math.min(0, this.vx);
      } else {
        this.x = solid.x + solid.w;
        this.vx = Math.max(0, this.vx);
      }
    }
  }

  findFloorBelow(distance) {
    const probe = { x: this.x + 4, y: this.y + this.h, w: this.w - 8, h: distance };
    const floors = [...this.stage.solids, ...this.stage.climbables.map(w => w.topStand).filter(Boolean), ...this.stage.oneWays];
    return floors.find(f => rectsOverlap(probe, f));
  }

  updateCheckpoint(registry) {
    const checkpoint = registry.checkpoint();
    if (checkpoint && rectsOverlap(this.rect(), checkpoint)) {
      checkpoint.activated = true;
    }
  }

  kill(reason) {
    if (this.dead) return;
    this.dead = true;
    this.respawnTimer = RUNNER.respawnDelay;
    this.deaths += 1;
    const messages = {
      fell: 'fell off stage',
      hazard: 'hazard death',
      timer: 'time up',
    };
    this.message = messages[reason] ?? 'runner down';
    this.messageTime = reason === 'timer' ? 1.8 : 1;
  }

  respawn(registry) {
    const checkpoint = registry.checkpoint();
    if (checkpoint?.activated) {
      checkpoint.usedForRespawn = true;
      this.spawnAt(checkpoint.x + checkpoint.w / 2 - this.w / 2, checkpoint.y - this.h - 4);
    } else {
      this.spawnAt(this.stage.fallbackCheckpoint.x, this.stage.fallbackCheckpoint.y);
    }
  }

  updateSafeStates(dt, registry) {
    this.safeStateSystem.update(dt, registry);
  }

  isSafeGroundedState(registry) {
    return this.safeStateSystem.isCurrentStateSafe(registry);
  }

  reposition(registry) {
    const candidate = this.safeStateSystem.findValidCandidate(registry);
    if (candidate) {
      this.x = candidate.x;
      this.y = candidate.y;
      this.vx = 0;
      this.vy = 0;
      this.facing = candidate.facingDirection;
      this.grounded = true;
      this.climbing = false;
      this.climbWall = null;
      this.hasDoubleJump = true;
      this.repositions += 1;
      this.message = 'reposition';
      this.messageTime = 0.8;
      this.safeStateSystem.reset();
      return;
    }

    this.repositions += 1;
    this.message = 'reposition fallback';
    this.messageTime = 0.9;
    this.safeStateSystem.reset();
    this.respawn(registry);
  }
}
