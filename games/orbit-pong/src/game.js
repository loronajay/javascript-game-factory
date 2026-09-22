import { GAME_CONFIG } from "./config.js";
import { createCpuController } from "./controllers/cpu-controller.js";
import { createMatch, startMatch, stepMatch } from "./core/simulation.js";
import { approach, angleDifference, wrapAngle } from "./core/math.js";

export class Game {
  constructor({ renderer, input, onUpdate = () => {} } = {}) {
    this.renderer = renderer;
    this.input = input;
    this.onUpdate = onUpdate;
    this.match = createMatch();
    this.mode = "local";
    this.cpu = null;
    this.running = false;
    this.lastTime = null;
    this.accumulator = 0;
    this.animationFrame = null;
    this.network = null;
    this.localPlayerIndex = 0;
    this.inputSequence = 0;
    this.lastSentOrbit = null;
    this.inputHistory = [];
    this.networkTarget = null;
    this.hasNetworkSnapshot = false;
    this.boundLoop = (time) => this.loop(time);
  }

  start({ mode = "local", difficulty = "normal", players, seed = Date.now(), network = null, localPlayerIndex = 0 } = {}) {
    this.mode = mode;
    this.network = network;
    this.localPlayerIndex = localPlayerIndex;
    this.cpu = mode === "cpu" ? createCpuController({ difficulty }) : null;
    this.match = createMatch({ seed, players });
    startMatch(this.match);
    this.lastTime = null;
    this.accumulator = 0;
    this.running = true;
    this.inputSequence = 0;
    this.inputHistory = [];
    this.networkTarget = null;
    this.hasNetworkSnapshot = false;
    this.onUpdate(this.match, this.match.events);
    if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.boundLoop);
  }

  stop() {
    this.running = false;
    this.input?.clear?.();
  }

  applyAuthoritativeSnapshot(snapshot) {
    if (!snapshot || this.mode !== "online") return;
    this.networkTarget = snapshot;
    this.inputHistory = this.inputHistory.filter((input) => input.sequence > snapshot.acknowledgedSequence);
    this.match.tick = snapshot.tick;
    this.match.phase = snapshot.phase;
    this.match.servePlan = snapshot.servePlan;
    snapshot.scores.forEach((score, index) => { this.match.players[index].score = score; });
    this.match.winnerId = snapshot.winnerId ?? null;
    if (!this.hasNetworkSnapshot) {
      Object.assign(this.match.ball, snapshot.ball, {
        previousX: snapshot.ball.x,
        previousY: snapshot.ball.y,
        speed: Math.hypot(snapshot.ball.vx, snapshot.ball.vy),
      });
      snapshot.paddles.forEach((next, index) => Object.assign(this.match.paddles[index], next, { previousAngle: next.angle }));
      this.hasNetworkSnapshot = true;
    } else {
      const local = this.match.paddles[this.localPlayerIndex];
      const authoritative = snapshot.paddles[this.localPlayerIndex];
      const correction = angleDifference(authoritative.angle, local.angle);
      local.angle = wrapAngle(local.angle + correction * (Math.abs(correction) > 0.4 ? 1 : 0.32));
      local.angularVelocity = authoritative.angularVelocity;
      for (const pending of this.inputHistory) this.predictLocalPaddle(pending.orbit);
    }
    this.onUpdate(this.match, []);
  }

  predictLocalPaddle(orbit) {
    const paddle = this.match.paddles[this.localPlayerIndex];
    const normalized = Math.sign(orbit);
    const target = normalized * GAME_CONFIG.paddle.maxAngularSpeed;
    const rate = normalized === 0 ? GAME_CONFIG.paddle.braking : GAME_CONFIG.paddle.acceleration;
    paddle.previousAngle = paddle.angle;
    paddle.angularVelocity = approach(
      paddle.angularVelocity,
      target,
      rate / GAME_CONFIG.simulation.tickRate,
    );
    paddle.angle = wrapAngle(paddle.angle + paddle.angularVelocity / GAME_CONFIG.simulation.tickRate);
  }

  smoothAuthoritativeState() {
    const snapshot = this.networkTarget;
    if (!snapshot || !this.hasNetworkSnapshot) return;
    const remoteIndex = this.localPlayerIndex === 0 ? 1 : 0;
    const remote = this.match.paddles[remoteIndex];
    const remoteTarget = snapshot.paddles[remoteIndex];
    remote.previousAngle = remote.angle;
    remote.angle = wrapAngle(remote.angle + angleDifference(remoteTarget.angle, remote.angle) * 0.28);
    remote.angularVelocity += (remoteTarget.angularVelocity - remote.angularVelocity) * 0.28;
    const ball = this.match.ball;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.x += (snapshot.ball.x - ball.x) * 0.34;
    ball.y += (snapshot.ball.y - ball.y) * 0.34;
    ball.vx = snapshot.ball.vx;
    ball.vy = snapshot.ball.vy;
    ball.speed = Math.hypot(ball.vx, ball.vy);
    ball.lastTouchPlayerId = snapshot.ball.lastTouchPlayerId;
  }

  tick() {
    const commands = this.input.commands();
    if (this.mode === "online") {
      this.match.tick += 1;
      const orbit = commands[this.localPlayerIndex]?.orbit ?? 0;
      if (orbit !== this.lastSentOrbit || this.match.tick % 6 === 0) {
        this.lastSentOrbit = orbit;
        const input = { sequence: ++this.inputSequence, orbit };
        this.inputHistory.push(input);
        if (this.inputHistory.length > 120) this.inputHistory.shift();
        this.network?.sendInput(input.sequence, orbit);
      }
      this.predictLocalPaddle(orbit);
      this.smoothAuthoritativeState();
      return;
    }
    if (this.cpu) commands[1] = this.cpu.getCommand(this.match, 1);
    const events = stepMatch(this.match, commands);
    this.renderer.onEvents(events, this.match);
    this.onUpdate(this.match, events);
  }

  loop(timestamp) {
    this.animationFrame = requestAnimationFrame(this.boundLoop);
    if (!this.running) return;
    if (this.lastTime === null) this.lastTime = timestamp;
    this.accumulator += Math.min(timestamp - this.lastTime, GAME_CONFIG.simulation.maxFrameMs);
    this.lastTime = timestamp;
    const tickMs = 1000 / GAME_CONFIG.simulation.tickRate;
    while (this.accumulator >= tickMs) {
      this.accumulator -= tickMs;
      this.tick();
    }
    this.renderer.render(this.match, this.accumulator / tickMs);
  }
}
