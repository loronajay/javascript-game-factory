// A simulation-timed sprite state machine. Drawing never advances animation.
export class RunnerAnimation {
  constructor() {
    this.state = 'idle';
    this.time = 0;
    this.frame = 0;
    this.wasGrounded = true;
    this.climbDirection = -1;
  }

  update(runner, dt) {
    let next = runner.dead ? 'dead' : runner.climbing ? 'climb'
      : !runner.grounded ? (runner.vy < -30 ? 'jump' : 'fall')
      : Math.abs(runner.vx) > 20 ? 'run' : 'idle';
    if (runner.grounded && !this.wasGrounded && !runner.climbing && !runner.dead) next = 'land';
    if (this.state === 'land' && this.time + dt < .12 && runner.grounded && !runner.dead) next = 'land';
    this.wasGrounded = runner.grounded;
    if (next !== this.state) { this.state = next; this.time = 0; }
    const rate = next === 'run' ? Math.max(.55, Math.min(1.6, Math.abs(runner.vx) / 320))
      : next === 'climb' ? Math.min(1.5, Math.abs(runner.vy) / 180) : 1;
    this.time += dt * rate;
    if (next === 'idle') {
      const phase = this.time % 3;
      this.frame = phase < .8 ? 0 : phase < 1.1 ? 1 : phase < 2.7 ? 3 : phase < 2.82 ? 2 : 0;
    } else if (next === 'run') this.frame = 4 + (Math.floor(this.time * 12 + 1e-8) % 4);
    else if (next === 'jump') this.frame = this.time < .09 ? 8 : 9;
    else if (next === 'fall') this.frame = 10;
    else if (next === 'land' || next === 'dead') this.frame = 11;
    else {
      if (runner.vy !== 0) this.climbDirection = Math.sign(runner.vy);
      const phase = Math.floor(this.time * 8 + 1e-8) % 4;
      this.frame = 12 + (this.climbDirection > 0 ? (4 - phase) % 4 : phase);
    }
  }
}
