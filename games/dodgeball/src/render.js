import { CONFIG } from './config.js';

const team = ['#37dbff', '#ff4d8d'];

export class Renderer {
  constructor(ctx, sprites) {
    this.ctx = ctx;
    this.sprites = sprites;
  }

  draw(game, alpha = 0) {
    const ctx = this.ctx;
    this.#background(ctx, game.tick);
    this.#arena(ctx);
    this.#hud(ctx, game);

    for (const player of game.players) {
      this.#playerMarker(ctx, player);
      this.sprites.draw(ctx, player, game.tick + alpha);
    }
    this.#ball(ctx, game.ball, game.tick);

    if (game.debug) this.#debug(ctx, game);
    this.#announcements(ctx, game);
  }

  #background(ctx, tick) {
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height);
    gradient.addColorStop(0, '#07101f');
    gradient.addColorStop(0.58, '#101d31');
    gradient.addColorStop(1, '#050914');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#6de7ff';
    ctx.lineWidth = 1;
    const offset = (tick * 0.18) % 40;
    for (let x = -CONFIG.canvas.height; x < CONFIG.canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + offset, CONFIG.arena.ceiling);
      ctx.lineTo(x + 260 + offset, CONFIG.arena.floor);
      ctx.stroke();
    }
    ctx.restore();
  }

  #arena(ctx) {
    const a = CONFIG.arena;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 9, 19, .7)';
    ctx.fillRect(a.left, a.ceiling, a.right - a.left, a.floor - a.ceiling);
    ctx.strokeStyle = '#74e8ff';
    ctx.shadowColor = '#27b9ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4;
    ctx.strokeRect(a.left, a.ceiling, a.right - a.left, a.floor - a.ceiling);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(66, 206, 255, .11)';
    ctx.fillRect(a.left, a.floor - 12, a.right - a.left, 12);
    ctx.restore();
  }

  #playerMarker(ctx, player) {
    ctx.save();
    ctx.fillStyle = team[player.id];
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(player.x, CONFIG.arena.floor + 3, 56, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  #ball(ctx, ball, tick) {
    ctx.save();
    const speed = Math.max(1, ball.speed);
    const nx = ball.vx / speed;
    const ny = ball.vy / speed;
    const trail = Math.min(130, speed * 5);
    const gradient = ctx.createLinearGradient(ball.x, ball.y, ball.x - nx * trail, ball.y - ny * trail);
    gradient.addColorStop(0, 'rgba(255,255,255,.9)');
    gradient.addColorStop(0.35, 'rgba(62,224,255,.55)');
    gradient.addColorStop(1, 'rgba(62,224,255,0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = ball.radius * 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x - nx * trail, ball.y - ny * trail);
    ctx.stroke();

    ctx.translate(ball.x, ball.y);
    ctx.rotate(tick * 0.15);
    ctx.shadowColor = '#43dcff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#f8ffff';
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#60dfff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius + 6, 0.2, 4.7);
    ctx.stroke();
    ctx.restore();
  }

  #hud(ctx, game) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7fbff';
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.fillText('D O D G E B A L L S', 640, 33);
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillStyle = '#8da8c3';
    ctx.fillText(`ROUND ${game.roundNumber}`, 640, 695);

    game.scores.forEach((score, id) => {
      const x = id === 0 ? 250 : 1030;
      ctx.fillStyle = team[id];
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.fillText(id === 0 ? 'P1 · FRANK' : 'FRANK · P2', x, 31);
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(x - 26 + i * 26, 48, 7, 0, Math.PI * 2);
        ctx.fillStyle = i < score ? team[id] : '#20334a';
        ctx.fill();
      }
    });
    ctx.restore();
  }

  #announcements(ctx, game) {
    let title = null;
    let subtitle = null;
    if (game.countdownText()) title = game.countdownText();
    else if (game.goTimer > 0) title = 'GO!';
    else if (game.phase === 'roundOver') title = `P${game.roundWinner + 1} TAKES THE ROUND`;
    else if (game.phase === 'matchOver') {
      title = `P${game.winner + 1} WINS`; subtitle = 'PRESS R TO RUN IT BACK';
    }
    if (!title) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = game.roundWinner === 1 || game.winner === 1 ? team[1] : team[0];
    ctx.shadowBlur = 24;
    ctx.font = title.length <= 3 ? '900 92px system-ui, sans-serif' : '900 46px system-ui, sans-serif';
    ctx.fillText(title, 640, 300);
    if (subtitle) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#9db1c7';
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText(subtitle, 640, 338);
    }
    ctx.restore();
  }

  #debug(ctx, game) {
    ctx.save();
    ctx.lineWidth = 2;
    for (const player of game.players) {
      const hurt = player.getHurtbox();
      ctx.strokeStyle = player.invulnerable ? '#a0ff74' : '#ffdb5d';
      ctx.strokeRect(hurt.x, hurt.y, hurt.width, hurt.height);
      const attack = player.getAttackBox();
      if (attack) {
        ctx.fillStyle = 'rgba(255, 71, 71, .25)';
        ctx.fillRect(attack.x, attack.y, attack.width, attack.height);
        ctx.strokeStyle = '#ff4747';
        ctx.strokeRect(attack.x, attack.y, attack.width, attack.height);
      }
      ctx.strokeStyle = team[player.id];
      ctx.beginPath();
      ctx.moveTo(player.x, player.y - 70);
      ctx.lineTo(player.x + player.vx * 8, player.y - 70 + player.vy * 8);
      ctx.stroke();
    }
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(game.ball.x, game.ball.y);
    ctx.lineTo(game.ball.x + game.ball.vx * 5, game.ball.y + game.ball.vy * 5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 0, 0, .78)';
    ctx.fillRect(82, 70, 330, 118);
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#d8f5ff';
    ctx.textAlign = 'left';
    ctx.fillText(`BALL speed ${game.ball.speed.toFixed(3)}  returns ${game.ball.returns}  walls ${game.ball.wallBounces}`, 94, 92);
    game.players.forEach((player, index) => {
      ctx.fillText(`P${index + 1} ${player.state}:${player.stateFrame}  v(${player.vx.toFixed(2)}, ${player.vy.toFixed(2)})`, 94, 119 + index * 27);
      ctx.fillText(`   invuln:${player.invulnerable}  air-dodge:${player.airDodgeAvailable}`, 94, 136 + index * 27);
    });
    ctx.restore();
  }
}
