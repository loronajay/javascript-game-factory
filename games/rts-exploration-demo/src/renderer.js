import { CONFIG } from './config.js';
import { TILE } from './map.js';

export class Renderer {
  constructor(canvas, map, camera, units, fog, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.map = map;
    this.camera = camera;
    this.units = units;
    this.fog = fog;
    this.input = input;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawMap(ctx);
    this.drawResourceNodes(ctx);
    this.drawUnits(ctx);
    this.drawFog(ctx);
    this.drawWorldUiOverlays(ctx);
    this.drawSelectionDrag(ctx);
    this.drawMinimap(ctx);
  }

  visibleTileBounds(pad = 1) {
    const ts = this.map.tileSize;
    return {
      x0: Math.max(0, Math.floor(this.camera.x / ts) - pad),
      y0: Math.max(0, Math.floor(this.camera.y / ts) - pad),
      x1: Math.min(this.map.width - 1, Math.ceil((this.camera.x + this.camera.viewportWidth) / ts) + pad),
      y1: Math.min(this.map.height - 1, Math.ceil((this.camera.y + this.camera.viewportHeight) / ts) + pad),
    };
  }

  drawMap(ctx) {
    const ts = this.map.tileSize;
    const b = this.visibleTileBounds();
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const sx = Math.floor(x * ts - this.camera.x);
        const sy = Math.floor(y * ts - this.camera.y);
        const tile = this.map.get(x, y);
        const variance = this.map.variance[this.map.index(x, y)] ?? 0;
        if (tile === TILE.WALL) {
          ctx.fillStyle = variance > 0.5 ? '#30384a' : '#252d3d';
          ctx.fillRect(sx, sy, ts, ts);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(sx, sy, ts, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(sx, sy + ts - 3, ts, 3);
        } else if (tile === TILE.DESTRUCTIBLE) {
          this.drawDestructibleTile(ctx, x, y, sx, sy, ts, variance);
        } else if (tile === TILE.DECOR) {
          ctx.fillStyle = variance > 0.5 ? '#172234' : '#151e2d';
          ctx.fillRect(sx, sy, ts, ts);
          ctx.fillStyle = 'rgba(102, 148, 255, 0.12)';
          ctx.beginPath();
          ctx.arc(sx + ts * 0.52, sy + ts * 0.52, 4 + variance * 5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = variance > 0.5 ? '#101827' : '#0e1522';
          ctx.fillRect(sx, sy, ts, ts);
        }

        if ((x + y) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.012)';
          ctx.fillRect(sx, sy, ts, ts);
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = b.x0; x <= b.x1; x += 4) {
      const sx = Math.floor(x * ts - this.camera.x) + 0.5;
      ctx.moveTo(sx, Math.floor(b.y0 * ts - this.camera.y));
      ctx.lineTo(sx, Math.floor((b.y1 + 1) * ts - this.camera.y));
    }
    for (let y = b.y0; y <= b.y1; y += 4) {
      const sy = Math.floor(y * ts - this.camera.y) + 0.5;
      ctx.moveTo(Math.floor(b.x0 * ts - this.camera.x), sy);
      ctx.lineTo(Math.floor((b.x1 + 1) * ts - this.camera.x), sy);
    }
    ctx.stroke();
  }

  drawDestructibleTile(ctx, x, y, sx, sy, ts, variance) {
    const wall = this.map.getDestructible(x, y);
    const hpPct = wall ? Math.max(0, Math.min(1, wall.hp / wall.maxHp)) : 0;
    ctx.fillStyle = variance > 0.5 ? '#492a58' : '#3b224b';
    ctx.fillRect(sx, sy, ts, ts);
    ctx.fillStyle = 'rgba(238, 109, 255, 0.18)';
    ctx.beginPath();
    ctx.ellipse(sx + ts * 0.5, sy + ts * 0.52, ts * 0.34, ts * 0.24, variance * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 158, 252, 0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 5, sy + 9 + variance * 6);
    ctx.quadraticCurveTo(sx + ts * 0.5, sy + 2, sx + ts - 5, sy + 10 + variance * 4);
    ctx.moveTo(sx + 4, sy + ts - 8 - variance * 5);
    ctx.quadraticCurveTo(sx + ts * 0.5, sy + ts - 1, sx + ts - 4, sy + ts - 11);
    ctx.stroke();

    if (hpPct < 0.72) {
      ctx.strokeStyle = 'rgba(255, 218, 255, 0.42)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + ts * 0.25, sy + ts * 0.22);
      ctx.lineTo(sx + ts * 0.46, sy + ts * 0.43);
      ctx.lineTo(sx + ts * 0.39, sy + ts * 0.68);
      ctx.moveTo(sx + ts * 0.64, sy + ts * 0.24);
      ctx.lineTo(sx + ts * 0.53, sy + ts * 0.48);
      ctx.lineTo(sx + ts * 0.72, sy + ts * 0.74);
      ctx.stroke();
    }

    if (hpPct < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(sx + 4, sy + 4, ts - 8, 4);
      ctx.fillStyle = hpPct > 0.45 ? '#f48cff' : '#ff5f8f';
      ctx.fillRect(sx + 5, sy + 5, Math.round((ts - 10) * hpPct), 2);
    }
  }

  drawResourceNodes(ctx) {
    const time = performance.now() / 1000;
    for (const node of this.map.resourceNodes) {
      const tile = this.map.worldToTile(node.x, node.y);
      if (!this.fog.isVisible(tile.x, tile.y) && !this.input.showFogDebug) continue;
      const p = this.camera.worldToScreen(node.x, node.y);
      if (p.x < -60 || p.y < -60 || p.x > this.camera.viewportWidth + 60 || p.y > this.camera.viewportHeight + 60) continue;
      const pulse = 0.5 + Math.sin(time * 3 + node.x * 0.03) * 0.5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(2, 10, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const color = node.kind === 'crystal' ? '#87f7ff' : '#bbff75';
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 + pulse * 8;
      ctx.fillStyle = node.kind === 'crystal' ? '#4bcfe8' : '#7ed957';
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (node.kind === 'crystal') {
        ctx.moveTo(0, -15);
        ctx.lineTo(10, -2);
        ctx.lineTo(5, 14);
        ctx.lineTo(-8, 12);
        ctx.lineTo(-11, -3);
      } else {
        ctx.ellipse(0, 0, 12, 15, 0.35, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawUnits(ctx) {
    const time = this.units.simTime;
    for (const unit of this.units.units) {
      const tile = this.map.worldToTile(unit.x, unit.y);
      if (!this.fog.isVisible(tile.x, tile.y) && !this.input.showFogDebug) continue;
      const p = this.camera.worldToScreen(unit.x, unit.y);
      if (p.x < -90 || p.y < -90 || p.x > this.camera.viewportWidth + 90 || p.y > this.camera.viewportHeight + 90) continue;

      if (unit.type === 'scout') {
        this.drawAlienScout(ctx, unit, p.x, p.y, time);
      } else if (unit.type === 'grunt') {
        this.drawAlienGrunt(ctx, unit, p.x, p.y, time);
      } else if (unit.type === 'neutralCrawler') {
        this.drawNeutralCrawler(ctx, unit, p.x, p.y, time);
      } else {
        this.drawFallbackUnit(ctx, unit, p.x, p.y);
      }
    }
  }

  drawCommandAck(ctx, unit, sx, sy, time) {
    if (!Number.isFinite(unit.commandAckUntil) || time > unit.commandAckUntil) return;
    const ttl = Math.max(0, unit.commandAckUntil - time);
    const alpha = Math.min(1, ttl / 0.22);
    const team = teamPalette(unit.team);
    ctx.save();
    ctx.globalAlpha = alpha * 0.72;
    ctx.strokeStyle = unit.commandAckKind === 'attack' ? team.impact : team.scan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, unit.selectionRadius + 7 * (1 - alpha), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawAlienScout(ctx, unit, sx, sy, time) {
    const team = teamPalette(unit.team);
    const pulse = 0.5 + Math.sin(time * 4.5 + unit.id) * 0.5;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(0.82, 0.82);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(2, 9, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (unit.selected) {
      ctx.strokeStyle = team.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + pulse * 0.18;
      ctx.strokeStyle = team.scan;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(unit.visualFacing ?? unit.facing);
    ctx.strokeStyle = '#07101a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, side * 8);
      ctx.quadraticCurveTo(-11, side * 13, -18, side * 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, side * 4);
      ctx.quadraticCurveTo(-14, side * 4, -19, side * 1);
      ctx.stroke();
    }

    const bodyGradient = ctx.createLinearGradient(-15, -12, 18, 12);
    bodyGradient.addColorStop(0, '#15202c');
    bodyGradient.addColorStop(0.55, '#203143');
    bodyGradient.addColorStop(1, '#0b121b');
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = '#050912';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.bezierCurveTo(10, -13, -8, -14, -16, -4);
    ctx.bezierCurveTo(-20, 0, -16, 6, -8, 12);
    ctx.bezierCurveTo(4, 13, 13, 8, 18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = team.core;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.bezierCurveTo(2, -5, -7, -5, -12, -1);
    ctx.bezierCurveTo(-6, 3, 2, 4, 9, 0);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowColor = team.glow;
    ctx.shadowBlur = 10 + pulse * 4;
    ctx.fillStyle = team.eye;
    ctx.beginPath();
    ctx.ellipse(7, 0, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = team.antenna;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -7);
    ctx.quadraticCurveTo(-10, -17, -2, -22);
    ctx.moveTo(-5, 7);
    ctx.quadraticCurveTo(-10, 17, -2, 22);
    ctx.stroke();

    ctx.fillStyle = team.eye;
    ctx.beginPath();
    ctx.arc(-2, -22, 2.4, 0, Math.PI * 2);
    ctx.arc(-2, 22, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawAlienGrunt(ctx, unit, sx, sy, time) {
    const team = teamPalette(unit.team);
    const attack = attackAnimation(unit, time);
    const throb = attack.active ? attack.strike : 0;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(0.86, 0.86);
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.beginPath();
    ctx.ellipse(2, 10, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (unit.selected) {
      ctx.strokeStyle = team.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (attack.active) {
      ctx.globalAlpha = 0.18 + attack.strike * 0.28;
      ctx.strokeStyle = team.impact;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + attack.strike * 7, -0.75, 0.75);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(unit.visualFacing ?? unit.facing);
    if (attack.active) ctx.translate(attack.lunge * 7, 0);

    ctx.strokeStyle = '#050912';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(2, side * 9);
      ctx.quadraticCurveTo(10 + throb * 4, side * 17, 21 + throb * 5, side * 13);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, side * 8);
      ctx.quadraticCurveTo(-15, side * 14, -22, side * 7);
      ctx.stroke();
    }

    const bodyGradient = ctx.createLinearGradient(-16, -13, 18, 13);
    bodyGradient.addColorStop(0, '#1c1927');
    bodyGradient.addColorStop(0.55, '#2f2940');
    bodyGradient.addColorStop(1, '#0d0b13');
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = '#050912';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.bezierCurveTo(12, -15, -9, -17, -18, -7);
    ctx.bezierCurveTo(-23, 0, -18, 10, -6, 15);
    ctx.bezierCurveTo(8, 14, 15, 8, 18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = team.core;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(1, 0, 8 + throb * 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#090912';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(12, -5);
    ctx.lineTo(23 + throb * 6, -10 - throb * 3);
    ctx.moveTo(12, 5);
    ctx.lineTo(23 + throb * 6, 10 + throb * 3);
    ctx.stroke();

    if (attack.active) {
      ctx.globalAlpha = 0.25 + attack.strike * 0.75;
      ctx.strokeStyle = team.impact;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(25 + attack.strike * 5, -7, 9, -1.35, -0.1);
      ctx.arc(25 + attack.strike * 5, 7, 9, 0.1, 1.35);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  drawNeutralCrawler(ctx, unit, sx, sy, time) {
    const team = teamPalette(unit.team);
    const attack = attackAnimation(unit, time);
    const throb = attack.active ? attack.strike : 0;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(2, 11, 20, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    if (attack.active) {
      ctx.globalAlpha = 0.16 + attack.strike * 0.32;
      ctx.strokeStyle = team.impact;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + attack.strike * 8, -0.8, 0.8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(unit.visualFacing ?? unit.facing);
    if (attack.active) ctx.translate(attack.lunge * 5, 0);

    ctx.strokeStyle = '#06070b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-8, side * 5);
      ctx.quadraticCurveTo(-20, side * 13, -27, side * 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, side * 9);
      ctx.quadraticCurveTo(12, side * 17, 24 + throb * 4, side * 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, side * 6);
      ctx.lineTo(23 + throb * 5, side * 2);
      ctx.stroke();
    }

    const bodyGradient = ctx.createLinearGradient(-18, -14, 18, 14);
    bodyGradient.addColorStop(0, '#211a16');
    bodyGradient.addColorStop(0.5, '#4a2f22');
    bodyGradient.addColorStop(1, '#120d0c');
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = '#06070b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.bezierCurveTo(13, -15, -10, -18, -21, -5);
    ctx.bezierCurveTo(-24, 2, -16, 15, -1, 17);
    ctx.bezierCurveTo(12, 15, 21, 8, 20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = team.glow;
    ctx.shadowBlur = 9;
    ctx.fillStyle = team.eye;
    ctx.beginPath();
    ctx.ellipse(7, -4, 5, 3, -0.25, 0, Math.PI * 2);
    ctx.ellipse(7, 4, 5, 3, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (attack.active) {
      ctx.globalAlpha = 0.22 + attack.strike * 0.72;
      ctx.strokeStyle = team.impact;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(24 + attack.strike * 5, 0, 11, -0.85, 0.85);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  drawFallbackUnit(ctx, unit, sx, sy) {
    const team = teamPalette(unit.team);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(unit.visualFacing ?? unit.facing);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(2, 7, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = team.core;
    ctx.strokeStyle = '#07101f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, unit.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawWorldUiOverlays(ctx) {
    // World UI draws after all world actors and fog. This keeps command
    // markers, attack feedback, health bars, and debug paths readable over
    // neutral monsters, player units, walls, and fog-edge overlap.
    this.drawPaths(ctx);
    this.drawMoveMarker(ctx);
    this.drawAttackTargetMarkers(ctx);
    this.drawCommandAcks(ctx);
    this.drawHealthBars(ctx);
    this.drawMovementDebug(ctx);
  }

  drawCommandAcks(ctx) {
    const time = this.units.simTime;
    for (const unit of this.units.units) {
      if (!this.shouldRenderUnitOverlay(unit)) continue;
      const p = this.camera.worldToScreen(unit.x, unit.y);
      this.drawCommandAck(ctx, unit, p.x, p.y, time);
    }
  }

  drawHealthBars(ctx) {
    const time = this.units.simTime;
    for (const unit of this.units.units) {
      if (!this.shouldRenderUnitOverlay(unit)) continue;
      if (!shouldShowHealthBar(unit, time)) continue;
      const p = this.camera.worldToScreen(unit.x, unit.y);
      const yOffset = unit.type === 'neutralCrawler' ? 35 : unit.type === 'grunt' ? 33 : 31;
      this.drawHealthBar(ctx, unit, p.x, p.y - yOffset);
    }
  }

  drawAttackTargetMarkers(ctx) {
    const time = this.units.simTime;
    const selectedAttackers = this.units.units.filter((unit) => unit.selected && unit.attackTarget);
    const drawn = new Set();
    for (const unit of selectedAttackers) {
      const target = this.units.resolveTarget(unit.attackTarget);
      if (!target) continue;
      const key = this.units.targetKey(unit.attackTarget);
      if (drawn.has(key)) continue;
      drawn.add(key);
      const center = this.units.targetCenter(target);
      const p = this.camera.worldToScreen(center.x, center.y);
      if (p.x < -80 || p.y < -80 || p.x > this.camera.viewportWidth + 80 || p.y > this.camera.viewportHeight + 80) continue;
      const pulse = 0.5 + Math.sin(time * 8) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.78 + pulse * 0.18;
      ctx.strokeStyle = '#ff8cff';
      ctx.lineWidth = 2;
      const r = target.kind === 'destructibleTile' ? this.map.tileSize * 0.58 : Math.max(18, this.units.targetRadius(target) + 10);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - r - 7, p.y);
      ctx.lineTo(p.x - r + 4, p.y);
      ctx.moveTo(p.x + r - 4, p.y);
      ctx.lineTo(p.x + r + 7, p.y);
      ctx.moveTo(p.x, p.y - r - 7);
      ctx.lineTo(p.x, p.y - r + 4);
      ctx.moveTo(p.x, p.y + r - 4);
      ctx.lineTo(p.x, p.y + r + 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  shouldRenderUnitOverlay(unit) {
    const tile = this.map.worldToTile(unit.x, unit.y);
    if (!this.fog.isVisible(tile.x, tile.y) && !this.input.showFogDebug) return false;
    const p = this.camera.worldToScreen(unit.x, unit.y);
    return !(p.x < -110 || p.y < -110 || p.x > this.camera.viewportWidth + 110 || p.y > this.camera.viewportHeight + 110);
  }


  drawMovementDebug(ctx) {
    if (!this.input.showMovementDebug) return;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const unit of this.units.units) {
      if (!unit.selected && unit.state !== 'blocked-repathing' && unit.state !== 'queued-behind-ally') continue;
      if (!this.shouldRenderUnitOverlay(unit)) continue;
      const p = this.camera.worldToScreen(unit.x, unit.y);
      const team = teamPalette(unit.team);
      const combat = this.units.getDef(unit.type).combat;

      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = unit.state === 'blocked-repathing' ? '#ff5f6d' : unit.state === 'queued-behind-ally' ? '#ffd36d' : team.scan;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (unit.selected && combat?.canAttack) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = team.impact;
        ctx.beginPath();
        ctx.arc(p.x, p.y, unit.radius + combat.attackRange, 0, Math.PI * 2);
        ctx.stroke();
      }

      const target = this.units.resolveTarget(unit.attackTarget);
      if (target) {
        const center = this.units.targetCenter(target);
        const tp = this.camera.worldToScreen(center.x, center.y);
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = team.impact;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
      }

      if (unit.debug?.queueAnchor) {
        const q = this.camera.worldToScreen(unit.debug.queueAnchor.x, unit.debug.queueAnchor.y);
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#ffd36d';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (unit.debug?.engagementSlot) {
        const e = this.camera.worldToScreen(unit.debug.engagementSlot.x, unit.debug.engagementSlot.y);
        ctx.globalAlpha = 0.68;
        ctx.strokeStyle = '#ff9f6d';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (unit.debug?.pathGoal && unit.selected) {
        const g = this.camera.worldToScreen(unit.debug.pathGoal.x, unit.debug.pathGoal.y);
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = '#9ef7ff';
        ctx.beginPath();
        ctx.moveTo(g.x - 5, g.y);
        ctx.lineTo(g.x + 5, g.y);
        ctx.moveTo(g.x, g.y - 5);
        ctx.lineTo(g.x, g.y + 5);
        ctx.stroke();
      }

      const blockedFor = unit.movementState?.blockedFor ?? 0;
      const formation = unit.debug?.formationMode ? ` ${unit.debug.formationMode}` : '';
      const slot = unit.debug?.engagementSlot ? ` s${unit.debug.engagementSlot.index}` : '';
      const labelBase = `${unit.state}${formation}${slot}`;
      const label = blockedFor > 0.05 ? `${labelBase} ${blockedFor.toFixed(1)}s` : labelBase;
      const y = p.y - unit.selectionRadius - 18;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      const w = Math.max(46, ctx.measureText(label).width + 8);
      ctx.fillRect(Math.round(p.x - w / 2), Math.round(y - 7), w, 14);
      ctx.fillStyle = '#d9f6ff';
      ctx.fillText(label, Math.round(p.x - w / 2 + 4), Math.round(y));
    }
    ctx.restore();
  }

  drawHealthBar(ctx, unit, sx, sy) {
    const width = 34;
    const height = 5;
    const pct = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(Math.round(sx - width / 2), Math.round(sy), width, height);
    ctx.fillStyle = pct > 0.5 ? '#68f28d' : pct > 0.25 ? '#ffd166' : '#ff5f6d';
    ctx.fillRect(Math.round(sx - width / 2 + 1), Math.round(sy + 1), Math.round((width - 2) * pct), height - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(sx - width / 2) + 0.5, Math.round(sy) + 0.5, width, height);
    ctx.restore();
  }

  drawPaths(ctx) {
    if (!this.input.showPathDebug) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(106, 213, 255, 0.72)';
    ctx.lineWidth = 2;
    for (const unit of this.units.units) {
      if (!unit.selected || unit.path.length === 0) continue;
      ctx.beginPath();
      const start = this.camera.worldToScreen(unit.x, unit.y);
      ctx.moveTo(start.x, start.y);
      for (const wp of unit.path) {
        const p = this.camera.worldToScreen(wp.x, wp.y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    const selectedWithRoute = this.units.units.find((unit) => unit.selected && unit.debug?.groupRoute?.length);
    if (selectedWithRoute) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 211, 109, 0.78)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      selectedWithRoute.debug.groupRoute.forEach((wp, index) => {
        const p = this.camera.worldToScreen(wp.x, wp.y);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }


    const chokeCells = this.units.chokeMap?.debugCells?.(220) ?? [];
    if (chokeCells.length) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#ffd36d';
      const ts = this.map.tileSize;
      for (const cell of chokeCells) {
        const sx = Math.floor(cell.tileX * ts - this.camera.x);
        const sy = Math.floor(cell.tileY * ts - this.camera.y);
        if (sx < -ts || sy < -ts || sx > this.camera.viewportWidth + ts || sy > this.camera.viewportHeight + ts) continue;
        ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);
      }
      ctx.restore();
    }

    const routeReservations = this.units.reservations?.routeReservationSnapshot?.() ?? [];
    if (routeReservations.length) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#ff6df2';
      ctx.lineWidth = 2;
      const ts = this.map.tileSize;
      for (const reservation of routeReservations) {
        const sx = Math.floor(reservation.tileX * ts - this.camera.x);
        const sy = Math.floor(reservation.tileY * ts - this.camera.y);
        if (sx < -ts || sy < -ts || sx > this.camera.viewportWidth + ts || sy > this.camera.viewportHeight + ts) continue;
        ctx.strokeRect(sx + 4.5, sy + 4.5, ts - 9, ts - 9);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  drawMoveMarker(ctx) {
    const marker = this.input.lastMoveCommand;
    if (!marker) return;
    const p = this.camera.worldToScreen(marker.x, marker.y);
    const alpha = Math.max(0, Math.min(1, marker.ttl / 0.55));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = marker.kind === 'attack' ? '#ff8cff' : marker.kind === 'attackMove' ? '#ffd36d' : '#9ef7ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14 + (1 - alpha) * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.moveTo(p.x, p.y - 18);
    ctx.lineTo(p.x, p.y + 18);
    ctx.stroke();
    ctx.restore();
  }

  drawSelectionDrag(ctx) {
    if (!this.input.selectionDrag) return;
    const r = this.input.selectionDrag;
    const p = this.camera.worldToScreen(r.x, r.y);
    ctx.save();
    ctx.fillStyle = 'rgba(115, 213, 255, 0.13)';
    ctx.strokeStyle = 'rgba(115, 213, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.fillRect(p.x, p.y, r.w, r.h);
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, r.w, r.h);
    ctx.restore();
  }

  drawFog(ctx) {
    if (this.input.showFogDebug) return;
    const ts = this.map.tileSize;
    const b = this.visibleTileBounds(1);
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (this.fog.isVisible(x, y)) continue;
        const sx = Math.floor(x * ts - this.camera.x);
        const sy = Math.floor(y * ts - this.camera.y);
        ctx.fillStyle = this.fog.isExplored(x, y) ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.94)';
        ctx.fillRect(sx, sy, ts + 1, ts + 1);
      }
    }
  }

  drawMinimap(ctx) {
    const size = CONFIG.minimapSize;
    const pad = 14;
    const x0 = this.camera.viewportWidth - size - pad;
    const y0 = pad;
    const sx = size / this.map.width;
    const sy = size / this.map.height;

    ctx.save();
    ctx.fillStyle = 'rgba(4, 8, 14, 0.86)';
    ctx.fillRect(x0 - 8, y0 - 8, size + 16, size + 16);
    ctx.strokeStyle = 'rgba(142, 226, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 8.5, y0 - 8.5, size + 17, size + 17);

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const explored = this.fog.isExplored(x, y) || this.input.showFogDebug;
        if (!explored) {
          ctx.fillStyle = '#02040a';
        } else {
          const tile = this.map.get(x, y);
          if (tile === TILE.WALL) ctx.fillStyle = '#3b465a';
          else if (tile === TILE.DESTRUCTIBLE) ctx.fillStyle = '#9347a5';
          else ctx.fillStyle = this.fog.isVisible(x, y) || this.input.showFogDebug ? '#1f3445' : '#0d1722';
        }
        ctx.fillRect(x0 + Math.floor(x * sx), y0 + Math.floor(y * sy), Math.ceil(sx), Math.ceil(sy));
      }
    }

    for (const node of this.map.resourceNodes) {
      if (!node.discovered && !this.input.showFogDebug) continue;
      const visible = this.fog.isVisible(node.tileX, node.tileY) || this.input.showFogDebug;
      const px = x0 + (node.x / this.map.worldWidth) * size;
      const py = y0 + (node.y / this.map.worldHeight) * size;
      ctx.save();
      ctx.globalAlpha = visible ? 1 : 0.52;
      ctx.fillStyle = node.kind === 'crystal' ? '#87f7ff' : '#bbff75';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const unit of this.units.units) {
      const tile = this.map.worldToTile(unit.x, unit.y);
      const visible = this.fog.isVisible(tile.x, tile.y) || this.input.showFogDebug;
      if (unit.team === 0) {
        if (!unit.discovered && !this.input.showFogDebug) continue;
        const px = x0 + unit.x / this.map.worldWidth * size;
        const py = y0 + unit.y / this.map.worldHeight * size;
        ctx.save();
        ctx.globalAlpha = visible ? 1 : 0.48;
        ctx.strokeStyle = '#ffb45f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (!visible) continue;
      const team = teamPalette(unit.team);
      ctx.fillStyle = unit.type === 'grunt' ? team.gruntDot : team.eye;
      ctx.fillRect(x0 + unit.x / this.map.worldWidth * size - 2, y0 + unit.y / this.map.worldHeight * size - 2, 4, 4);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x0 + (this.camera.x / this.map.worldWidth) * size,
      y0 + (this.camera.y / this.map.worldHeight) * size,
      (this.camera.viewportWidth / this.map.worldWidth) * size,
      (this.camera.viewportHeight / this.map.worldHeight) * size,
    );

    ctx.fillStyle = 'rgba(198, 240, 255, 0.85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('MINIMAP', x0, y0 + size + 15);
    ctx.restore();
  }
}

function teamPalette(team) {
  if (team === 0) {
    return {
      core: '#d3844a',
      eye: '#ffb45f',
      glow: 'rgba(255, 152, 73, 0.9)',
      scan: 'rgba(255, 172, 91, 0.9)',
      selection: '#ffbd70',
      antenna: '#e89452',
      gruntDot: '#ff9c47',
      impact: '#ffd06e',
    };
  }
  if (team === 2) {
    return {
      core: '#ff5d6c',
      eye: '#ff8090',
      glow: 'rgba(255, 75, 103, 0.9)',
      scan: 'rgba(255, 92, 119, 0.9)',
      selection: '#ff8a9a',
      antenna: '#ff7384',
      gruntDot: '#ff375a',
      impact: '#ff9adf',
    };
  }
  return {
    core: '#44c7ff',
    eye: '#8be7ff',
    glow: 'rgba(83, 207, 255, 0.9)',
    scan: 'rgba(104, 226, 255, 0.9)',
    selection: '#73d5ff',
    antenna: '#7be7ff',
    gruntDot: '#31f0b8',
    impact: '#8ffcff',
  };
}

function attackAnimation(unit, time) {
  const state = unit.combatState;
  if (!state || !Number.isFinite(state.attackAnimStart) || state.attackAnimDuration <= 0) {
    return { active: false, lunge: 0, strike: 0 };
  }
  const t = (time - state.attackAnimStart) / state.attackAnimDuration;
  if (t < 0 || t > 1) return { active: false, lunge: 0, strike: 0 };
  // Wind up, snap forward at impact, then recover. This makes each attack
  // read as a discrete bite instead of a continuous chewing loop.
  const wind = t < 0.48 ? t / 0.48 : 1;
  const snap = t >= 0.38 && t <= 0.72 ? Math.sin(((t - 0.38) / 0.34) * Math.PI) : 0;
  const impact = time <= state.impactFlashUntil ? 1 : 0;
  return {
    active: true,
    lunge: Math.max(0, snap),
    strike: Math.max(impact, snap * 0.9, wind * 0.25),
  };
}

function shouldShowHealthBar(unit, time) {
  if (unit.selected) return true;
  if (unit.hp < unit.maxHp) return true;
  const combat = unit.combatState;
  if (!combat) return false;
  return (time - combat.lastCombatTime < 3) || (time - combat.lastDamagedTime < 3);
}
