import { CONFIG } from './config.js';

const P = CONFIG.player;
const actionStates = new Set(['jumpSquat', 'spotDodge', 'groundAttack', 'airAttack', 'airDodge']);

export class Player {
  constructor(id, x, y, facing) {
    this.id = id;
    this.spawn = { x, y, facing };
    this.reset();
  }

  reset() {
    this.x = this.spawn.x;
    this.y = this.spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.spawn.facing;
    this.grounded = true;
    this.state = 'idle';
    this.stateFrame = 0;
    this.dashFrame = 0;
    this.shortHopQueued = false;
    this.fastFalling = false;
    this.airDodgeAvailable = true;
  }

  get crouching() {
    return this.state === 'crouch';
  }

  get invulnerable() {
    if (this.state === 'spotDodge') {
      return this.stateFrame >= P.spotDodge.startup
        && this.stateFrame < P.spotDodge.startup + P.spotDodge.active;
    }
    if (this.state === 'airDodge') {
      return this.stateFrame >= P.airDodge.startup
        && this.stateFrame < P.airDodge.startup + P.airDodge.active;
    }
    return false;
  }

  setState(state) {
    this.state = state;
    this.stateFrame = 0;
  }

  step(input, arena = CONFIG.arena) {
    if (this.grounded) this.#stepGround(input);
    else this.#stepAir(input);

    this.x += this.vx;
    if (!this.grounded) this.y += this.vy;

    const halfWidth = (this.crouching ? P.crouchingWidth : P.standingWidth) / 2;
    this.x = Math.max(arena.left + halfWidth, Math.min(arena.right - halfWidth, this.x));

    if (!this.grounded && this.y >= arena.floor) {
      this.y = arena.floor;
      this.vy = 0;
      this.grounded = true;
      this.fastFalling = false;
      this.airDodgeAvailable = true;
      this.setState(Math.abs(this.vx) > 1 ? 'landing' : 'idle');
    }
  }

  #stepGround(input) {
    if (!actionStates.has(this.state) && input.attackPressed) {
      this.setState('groundAttack');
    } else if (!actionStates.has(this.state) && input.dodgePressed) {
      this.vx *= 0.22;
      this.setState('spotDodge');
    } else if (!actionStates.has(this.state) && input.jumpPressed) {
      this.shortHopQueued = false;
      this.setState('jumpSquat');
    }

    if (this.state === 'jumpSquat') {
      if (input.jumpReleased) this.shortHopQueued = true;
      this.vx *= 0.9;
      this.stateFrame += 1;
      if (this.stateFrame >= P.jumpSquatFrames) {
        this.grounded = false;
        this.vy = this.shortHopQueued || !input.jump ? P.shortHopVelocity : P.fullHopVelocity;
        this.setState('airborne');
      }
      return;
    }

    if (this.state === 'groundAttack') {
      this.vx *= 0.82;
      this.stateFrame += 1;
      if (this.stateFrame >= P.groundAttack.total) this.setState('idle');
      return;
    }

    if (this.state === 'spotDodge') {
      this.vx *= 0.7;
      this.stateFrame += 1;
      if (this.stateFrame >= P.spotDodge.total) this.setState('idle');
      return;
    }

    if (input.down) {
      this.vx *= P.crouchFriction;
      if (this.state !== 'crouch') this.setState('crouch');
      return;
    }

    const direction = Number(input.right) - Number(input.left);
    if (direction) {
      const reversing = this.vx !== 0 && Math.sign(this.vx) !== direction;
      this.vx += direction * (reversing ? P.groundReverseAccel : P.groundAccel);
      this.vx = Math.max(-P.maxRunSpeed, Math.min(P.maxRunSpeed, this.vx));
      this.facing = direction;
      if (reversing) {
        this.setState('turnaround');
        this.dashFrame = 0;
      } else if (this.state === 'idle' || this.state === 'landing' || this.state === 'crouch') {
        this.setState('dash');
        this.dashFrame = 0;
      } else {
        this.dashFrame += 1;
        this.state = this.dashFrame < P.dashFrames ? 'dash' : 'run';
        this.stateFrame += 1;
      }
    } else {
      this.vx *= P.groundFriction;
      if (Math.abs(this.vx) < 0.08) this.vx = 0;
      this.state = Math.abs(this.vx) > 1 ? 'skid' : 'idle';
      this.stateFrame += 1;
    }
  }

  #stepAir(input) {
    if (this.state !== 'airAttack' && this.state !== 'airDodge' && input.attackPressed) {
      this.vx += this.facing * P.airAttack.forwardBoost;
      this.setState('airAttack');
    } else if (this.state !== 'airAttack' && this.state !== 'airDodge'
      && input.dodgePressed && this.airDodgeAvailable) {
      let dx = Number(input.right) - Number(input.left);
      let dy = Number(input.down) - Number(input.jump);
      if (!dx && !dy) dx = this.facing;
      const length = Math.hypot(dx, dy) || 1;
      this.vx = (dx / length) * P.airDodge.speed;
      this.vy = (dy / length) * P.airDodge.speed;
      this.airDodgeAvailable = false;
      this.setState('airDodge');
    }

    if (this.state === 'airDodge') {
      this.stateFrame += 1;
      if (this.stateFrame >= P.airDodge.total) this.setState('airborne');
      return;
    }

    const direction = Number(input.right) - Number(input.left);
    if (direction) {
      this.vx += direction * P.airAccel;
      this.vx = Math.max(-P.maxAirSpeed, Math.min(P.maxAirSpeed, this.vx));
      this.facing = direction;
    } else {
      this.vx *= P.airDrag;
    }

    if (input.down && this.vy >= 0 && !this.fastFalling) {
      this.fastFalling = true;
      this.vy = Math.max(this.vy, P.fastFallSpeed);
    }
    if (!this.fastFalling) this.vy = Math.min(P.maxFallSpeed, this.vy + P.gravity);

    if (this.state === 'airAttack') {
      this.stateFrame += 1;
      if (this.stateFrame >= P.airAttack.total) this.setState('airborne');
    } else {
      this.state = 'airborne';
      this.stateFrame += 1;
    }
  }

  getHurtbox() {
    const width = this.crouching ? P.crouchingWidth : P.standingWidth;
    const height = this.crouching ? P.crouchingHeight : P.standingHeight;
    return { x: this.x - width / 2, y: this.y - height, width, height };
  }

  getAttackBox() {
    if (this.state === 'groundAttack'
      && this.stateFrame >= P.groundAttack.startup
      && this.stateFrame < P.groundAttack.startup + P.groundAttack.active) {
      return this.facing > 0
        ? { x: this.x + 20, y: this.y - 78, width: 62, height: 53 }
        : { x: this.x - 82, y: this.y - 78, width: 62, height: 53 };
    }
    if (this.state === 'airAttack'
      && this.stateFrame >= P.airAttack.startup
      && this.stateFrame < P.airAttack.startup + P.airAttack.active) {
      return this.facing > 0
        ? { x: this.x + 18, y: this.y - 92, width: 55, height: 42 }
        : { x: this.x - 73, y: this.y - 92, width: 55, height: 42 };
    }
    return null;
  }
}
