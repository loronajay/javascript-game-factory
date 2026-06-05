import { W, H, CX } from "../core/constants.mjs";
import { project } from "../systems/projection.mjs";

export function renderRunners(ctx, game, t) {
  const runner = game.runner.active;
  if (!runner) return;

  const p = project(runner.x, runner.y, runner.z, game.player.x);
  if (p.x < -100 || p.x > W + 100) return;

  const size    = 36 * p.s;
  const w       = size * 0.85;
  const h       = size * 0.42;
  const dir     = runner.vx > 0 ? 1 : -1;
  const pulse   = 1 + Math.sin(runner.pulse * 0.006) * 0.07;
  const isFlash = runner.hitFlash > 0;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(pulse, pulse);

  ctx.shadowBlur  = 28 + Math.sin(runner.pulse * 0.004) * 10;
  ctx.shadowColor = runner.color;

  ctx.beginPath();
  ctx.moveTo(dir * w,          0);
  ctx.lineTo(dir * -w * 0.22, -h);
  ctx.lineTo(dir * -w * 0.68,  0);
  ctx.lineTo(dir * -w * 0.22,  h);
  ctx.closePath();

  ctx.fillStyle   = isFlash ? "#ffffff" : "rgba(8, 18, 28, 0.84)";
  ctx.fill();
  ctx.strokeStyle = isFlash ? "#ffffff" : runner.color;
  ctx.lineWidth   = Math.max(1.5, size * 0.065);
  ctx.stroke();

  if (!isFlash) {
    const enginePulse = 0.55 + Math.sin(runner.pulse * 0.012) * 0.35;
    ctx.globalAlpha   = enginePulse;
    ctx.shadowBlur    = 14;
    ctx.fillStyle     = runner.color;
    ctx.beginPath();
    ctx.arc(dir * -w * 0.68, 0, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.shadowBlur = 0;

  const pipR       = Math.max(3, size * 0.115);
  const pipSpacing = pipR * 2.6;
  const pipTotalW  = (runner.maxHp - 1) * pipSpacing;
  const pipY       = h + pipR + Math.max(4, size * 0.18);

  for (let i = 0; i < runner.maxHp; i++) {
    const px = -pipTotalW * 0.5 + i * pipSpacing;
    ctx.beginPath();
    ctx.arc(px, pipY, pipR, 0, Math.PI * 2);
    if (i < runner.hp) {
      ctx.fillStyle   = runner.color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    } else {
      ctx.strokeStyle = runner.color;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.28;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const labelSize = Math.max(10, size * 0.28);
  const labelY    = -(h + Math.max(6, size * 0.26));
  ctx.font         = `700 ${labelSize}px system-ui, sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle    = runner.color;
  ctx.globalAlpha  = 0.82 + Math.sin(runner.pulse * 0.007) * 0.18;
  ctx.fillText(runner.label, 0, labelY);
  ctx.globalAlpha = 1;

  ctx.restore();
}

export function renderRunnerKillMessage(ctx, game) {
  const r = game.runner;
  if (r.killMessageTimer <= 0 || !r.killMessage) return;

  const alpha = Math.min(1, r.killMessageTimer / 380);
  const color = r.killMessage === "JACKPOT!" ? "#ff2244" : "#44ff88";

  ctx.save();
  ctx.globalAlpha      = alpha;
  ctx.textAlign        = "center";
  ctx.textBaseline     = "middle";
  ctx.font             = "900 66px system-ui, sans-serif";
  ctx.shadowColor      = color;
  ctx.shadowBlur       = 36;
  ctx.fillStyle        = color;
  ctx.fillText(r.killMessage, CX, H * 0.21);
  ctx.restore();
}
