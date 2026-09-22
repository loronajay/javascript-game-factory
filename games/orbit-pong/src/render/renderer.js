import { GAME_CONFIG } from "../config.js";
import { lerpAngle } from "../core/math.js";

const VIEW = 720;
const CENTER = VIEW / 2;

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const number = Number.parseInt(full, 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext("2d");
  const trails = [];
  const bursts = [];
  let debug = false;
  let shake = 0;
  let lastTrailTick = -1;

  function onEvents(events, match) {
    for (const event of events) {
      if (event.type === "BALL_HIT") {
        shake = 6;
        const player = match.players.find((candidate) => candidate.id === event.playerId);
        for (let i = 0; i < 12; i += 1) {
          const angle = (i / 12) * Math.PI * 2;
          bursts.push({
            x: event.position.x,
            y: event.position.y,
            vx: Math.cos(angle) * (70 + i * 4),
            vy: Math.sin(angle) * (70 + i * 4),
            life: 1,
            color: player?.color || "#fff",
          });
        }
      }
      if (event.type === "POINT_SCORED") shake = 11;
    }
  }

  function drawBackground(ctx, ownerColor) {
    const gradient = ctx.createRadialGradient(0, 0, 40, 0, 0, 360);
    gradient.addColorStop(0, colorWithAlpha(ownerColor, 0.12));
    gradient.addColorStop(0.72, "rgba(5, 8, 24, .92)");
    gradient.addColorStop(1, "#02030b");
    ctx.fillStyle = gradient;
    ctx.fillRect(-CENTER, -CENTER, VIEW, VIEW);
    ctx.strokeStyle = "rgba(117, 166, 255, .06)";
    ctx.lineWidth = 1;
    for (let radius = 55; radius < 350; radius += 42) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 35, Math.sin(angle) * 35);
      ctx.lineTo(Math.cos(angle) * 340, Math.sin(angle) * 340);
      ctx.stroke();
    }
  }

  function drawArena(ctx, match, ownerColor) {
    const radius = GAME_CONFIG.arena.radius;
    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = colorWithAlpha(ownerColor, 0.5);
    ctx.strokeStyle = colorWithAlpha(ownerColor, 0.26);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([3, 13]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(216, 235, 255, .25)";
    ctx.beginPath();
    ctx.arc(0, 0, radius - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (match.phase === "SERVE_PREVIEW" && match.servePlan) {
      const target = match.servePlan.targetAngle;
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = "rgba(255,255,255,.48)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(target) * (radius - 10), Math.sin(target) * (radius - 10));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      ctx.arc(Math.cos(target) * radius, Math.sin(target) * radius, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPaddles(ctx, match, alpha) {
    match.paddles.forEach((paddle, index) => {
      const angle = lerpAngle(paddle.previousAngle, paddle.angle, alpha);
      const color = match.players[index].color;
      ctx.save();
      // The last hitter is locked until the opponent returns the ball. Dimming
      // that paddle makes the alternating-contact rule readable at a glance.
      ctx.globalAlpha = match.ball.lastTouchPlayerId === paddle.playerId ? 0.34 : 1;
      ctx.lineCap = "round";
      ctx.lineWidth = 17;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 22;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(0, 0, GAME_CONFIG.arena.radius, angle - paddle.arc / 2, angle + paddle.arc / 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#f7fbff";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, GAME_CONFIG.arena.radius, angle - paddle.arc * 0.32, angle + paddle.arc * 0.32);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawBall(ctx, match, alpha, ownerColor) {
    const ball = match.ball;
    const x = ball.previousX + (ball.x - ball.previousX) * alpha;
    const y = ball.previousY + (ball.y - ball.previousY) * alpha;
    if (match.tick !== lastTrailTick && match.phase === "PLAYING") {
      trails.push({ x, y, life: 1, color: ownerColor });
      if (trails.length > 28) trails.shift();
      lastTrailTick = match.tick;
    }
    for (const trail of trails) {
      ctx.fillStyle = colorWithAlpha(trail.color, trail.life * 0.28);
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, ball.radius * trail.life, 0, Math.PI * 2);
      ctx.fill();
      trail.life -= 0.045;
    }
    while (trails[0]?.life <= 0) trails.shift();

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 25;
    ctx.shadowColor = ownerColor;
    ctx.beginPath();
    ctx.arc(x, y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBursts(ctx) {
    const dt = 1 / 60;
    for (const particle of bursts) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= 0.045;
      ctx.fillStyle = colorWithAlpha(particle.color, Math.max(0, particle.life));
      ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
    }
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      if (bursts[index].life <= 0) bursts.splice(index, 1);
    }
  }

  function drawDebug(ctx, match) {
    if (!debug) return;
    ctx.save();
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(0, 0, 0, .76)";
    ctx.fillRect(-344, -344, 245, 138);
    ctx.fillStyle = "#8fffea";
    const lines = [
      `tick ${match.tick} · ${match.phase}`,
      `ball ${match.ball.vx.toFixed(1)}, ${match.ball.vy.toFixed(1)}`,
      `speed ${Math.hypot(match.ball.vx, match.ball.vy).toFixed(1)}`,
      `last touch ${match.ball.lastTouchPlayerId ?? "neutral"}`,
      `p1 ${(match.paddles[0].angle * 180 / Math.PI).toFixed(1)}°  ω ${match.paddles[0].angularVelocity.toFixed(2)}`,
      `p2 ${(match.paddles[1].angle * 180 / Math.PI).toFixed(1)}°  ω ${match.paddles[1].angularVelocity.toFixed(2)}`,
      `serve ${match.servePlan ? (match.servePlan.targetAngle * 180 / Math.PI).toFixed(1) + "°" : "—"}`,
    ];
    lines.forEach((line, index) => ctx.fillText(line, -332, -322 + index * 18));
    ctx.restore();
  }

  function render(match, alpha = 1) {
    context.imageSmoothingEnabled = false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / VIEW, canvas.height / VIEW);
    const owner = match.players.find((player) => player.id === match.ball.lastTouchPlayerId);
    const ownerColor = owner?.color || "#8f9fff";
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    shake *= 0.78;
    context.setTransform(scale, 0, 0, scale, canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
    drawBackground(context, ownerColor);
    drawArena(context, match, ownerColor);
    drawBursts(context);
    drawPaddles(context, match, alpha);
    drawBall(context, match, alpha, ownerColor);
    drawDebug(context, match);
  }

  return {
    render,
    onEvents,
    toggleDebug() {
      debug = !debug;
      return debug;
    },
  };
}
