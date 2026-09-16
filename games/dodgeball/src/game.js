import { Ball } from './ball.js';
import { CONFIG } from './config.js';
import { Player } from './player.js';

const center = {
  x: (CONFIG.arena.left + CONFIG.arena.right) / 2,
  y: (CONFIG.arena.ceiling + CONFIG.arena.floor) / 2,
};

export class Game {
  constructor() {
    this.players = [
      new Player(0, 270, CONFIG.arena.floor, 1),
      new Player(1, 1010, CONFIG.arena.floor, -1),
    ];
    this.ball = new Ball(center.x, center.y);
    this.scores = [0, 0];
    this.tick = 0;
    this.debug = false;
    this.resetMatch();
  }

  resetMatch() {
    this.scores = [0, 0];
    this.winner = null;
    this.roundWinner = null;
    this.roundNumber = 1;
    this.#resetRound();
  }

  #resetRound() {
    this.players.forEach((player) => player.reset());
    this.ball.reset(center.x, center.y);
    this.phase = 'ready';
    this.phaseTimer = CONFIG.round.countdownTicks;
    this.goTimer = 0;
    this.roundWinner = null;
  }

  update(inputs, restartPressed = false) {
    this.tick += 1;
    if (restartPressed) {
      this.resetMatch();
      return;
    }

    if (this.phase === 'ready') {
      this.phaseTimer -= 1;
      const orbit = (CONFIG.round.countdownTicks - this.phaseTimer) * 0.09;
      this.ball.x = center.x + Math.cos(orbit) * 42;
      this.ball.y = center.y + Math.sin(orbit) * 28;
      if (this.phaseTimer <= 0) this.#serve();
      return;
    }

    if (this.phase === 'roundOver') {
      this.phaseTimer -= 1;
      if (this.phaseTimer <= 0) {
        this.roundNumber += 1;
        this.#resetRound();
      }
      return;
    }

    if (this.phase !== 'live') return;
    if (this.goTimer > 0) this.goTimer -= 1;

    this.players[0].step(inputs[0]);
    this.players[1].step(inputs[1]);
    this.#resolvePlayerPushboxes();
    this.ball.step({
      arena: CONFIG.arena,
      players: this.players,
      onDeath: (loser) => this.#endRound(loser.id === 0 ? 1 : 0),
    });
  }

  #serve() {
    const min = CONFIG.ball.launchAngleMin * Math.PI / 180;
    const max = CONFIG.ball.launchAngleMax * Math.PI / 180;
    const angle = min + Math.random() * (max - min);
    this.ball.x = center.x;
    this.ball.y = center.y;
    this.ball.launch(angle, Math.random() < 0.5 ? -1 : 1, Math.random() < 0.5 ? -1 : 1);
    this.phase = 'live';
    this.goTimer = 30;
  }

  #endRound(winnerId) {
    if (this.phase !== 'live') return;
    this.roundWinner = winnerId;
    this.scores[winnerId] += 1;
    if (this.scores[winnerId] >= CONFIG.round.winsNeeded) {
      this.winner = winnerId;
      this.phase = 'matchOver';
    } else {
      this.phase = 'roundOver';
      this.phaseTimer = CONFIG.round.roundOverTicks;
    }
  }

  #resolvePlayerPushboxes() {
    const [a, b] = this.players;
    const overlap = (CONFIG.player.standingWidth - Math.abs(a.x - b.x));
    if (overlap <= 0 || Math.abs(a.y - b.y) > 90) return;
    const direction = a.x <= b.x ? -1 : 1;
    a.x += direction * overlap * 0.5;
    b.x -= direction * overlap * 0.5;
    a.vx *= 0.75;
    b.vx *= 0.75;
  }

  countdownText() {
    if (this.phase !== 'ready') return null;
    return String(Math.max(1, Math.ceil(this.phaseTimer / 60)));
  }
}
