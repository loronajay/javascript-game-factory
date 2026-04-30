// Owns the debug hitbox overlay and debug banner rendering.
// renderer.js composes this via createDebugRenderer.

export function createDebugRenderer(ctx, helpers) {
  const { getDebugOverlayGeometry } = helpers;

  function drawDebugCollision(offsetX, side, player, obstacles, snapshot, nowMs) {
    const geometry = getDebugOverlayGeometry(side, player, obstacles, snapshot, nowMs);
    const obstacleFill   = snapshot.perfectWindowActive ? 'rgba(120,255,120,0.24)' : 'rgba(255,220,80,0.2)';
    const obstacleStroke = snapshot.perfectWindowActive ? 'rgba(120,255,120,0.98)' : 'rgba(255,220,80,0.95)';
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2;

    for (const box of geometry.obstacleBoxes) {
      ctx.fillStyle   = obstacleFill;
      ctx.strokeStyle = obstacleStroke;
      ctx.fillRect(offsetX + box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.strokeRect(offsetX + box.left, box.top, box.right - box.left, box.bottom - box.top);
    }

    if (geometry.shieldBox) {
      ctx.fillStyle   = 'rgba(120,255,180,0.18)';
      ctx.strokeStyle = 'rgba(120,255,180,0.95)';
      ctx.fillRect(offsetX + geometry.shieldBox.left, geometry.shieldBox.top, geometry.shieldBox.right - geometry.shieldBox.left, geometry.shieldBox.bottom - geometry.shieldBox.top);
      ctx.strokeRect(offsetX + geometry.shieldBox.left, geometry.shieldBox.top, geometry.shieldBox.right - geometry.shieldBox.left, geometry.shieldBox.bottom - geometry.shieldBox.top);
    }

    if (geometry.swordBox) {
      ctx.fillStyle   = 'rgba(255,120,220,0.18)';
      ctx.strokeStyle = 'rgba(255,120,220,0.95)';
      ctx.fillRect(offsetX + geometry.swordBox.left, geometry.swordBox.top, geometry.swordBox.right - geometry.swordBox.left, geometry.swordBox.bottom - geometry.swordBox.top);
      ctx.strokeRect(offsetX + geometry.swordBox.left, geometry.swordBox.top, geometry.swordBox.right - geometry.swordBox.left, geometry.swordBox.bottom - geometry.swordBox.top);
    }

    if (geometry.obstacleColumns.length) {
      ctx.strokeStyle = obstacleStroke;
      for (const col of geometry.obstacleColumns) {
        ctx.beginPath();
        ctx.moveTo(offsetX + col.x, col.top);
        ctx.lineTo(offsetX + col.x, col.bottom);
        ctx.stroke();
      }
    }

    if (geometry.playerColumns.length) {
      const playerXs      = geometry.playerColumns.map(col => col.x);
      const playerTops    = geometry.playerColumns.map(col => col.top);
      const playerBottoms = geometry.playerColumns.map(col => col.bottom);
      ctx.fillStyle = 'rgba(80,220,255,0.18)';
      ctx.fillRect(offsetX + Math.min(...playerXs), Math.min(...playerTops), Math.max(...playerXs) - Math.min(...playerXs) + 1, Math.max(...playerBottoms) - Math.min(...playerTops));
      ctx.strokeStyle = 'rgba(80,220,255,0.9)';
      for (const col of geometry.playerColumns) {
        ctx.beginPath();
        ctx.moveTo(offsetX + col.x, col.top);
        ctx.lineTo(offsetX + col.x, col.bottom);
        ctx.stroke();
      }
      ctx.strokeRect(offsetX + Math.min(...playerXs), Math.min(...playerTops), Math.max(...playerXs) - Math.min(...playerXs) + 1, Math.max(...playerBottoms) - Math.min(...playerTops));
    }

    if (geometry.overlapColumns.length) {
      ctx.strokeStyle = 'rgba(255,70,70,1)';
      ctx.lineWidth = 3;
      for (const col of geometry.overlapColumns) {
        ctx.beginPath();
        ctx.moveTo(offsetX + col.x, col.top);
        ctx.lineTo(offsetX + col.x, col.bottom);
        ctx.stroke();
      }
    }

    function _drawBox(fill, stroke, box) {
      ctx.fillStyle   = fill;
      ctx.strokeStyle = stroke;
      ctx.fillRect(offsetX + box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.strokeRect(offsetX + box.left, box.top, box.right - box.left, box.bottom - box.top);
    }

    if (geometry.collisionBox)       _drawBox('rgba(255,70,70,0.28)',   'rgba(255,70,70,1)',      geometry.collisionBox);
    if (geometry.shieldCollisionBox) _drawBox('rgba(120,255,180,0.26)', 'rgba(120,255,180,0.98)', geometry.shieldCollisionBox);
    if (geometry.swordCollisionBox)  _drawBox('rgba(255,120,220,0.26)', 'rgba(255,120,220,0.98)', geometry.swordCollisionBox);

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(offsetX + 8, 8, 226, 110);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(offsetX + 8, 8, 226, 110);
    ctx.fillStyle = '#f3f5ff';
    ctx.font = '12px monospace';
    ctx.fillText(`obs: ${snapshot.obstacleType}`, offsetX + 16, 26);
    ctx.fillText(`action: ${snapshot.action || 'none'}`, offsetX + 16, 42);
    ctx.fillText(`feetY: ${Math.round(snapshot.playerBottomY)}`, offsetX + 16, 58);
    ctx.fillText(`overlap: ${Math.round(snapshot.overlapHeight || 0)}`, offsetX + 16, 74);
    ctx.fillText(`timing: ${snapshot.timingGrade || 'n/a'}`, offsetX + 16, 90);
    ctx.fillText(`touch: ${geometry.collisionBox || geometry.shieldCollisionBox || geometry.swordCollisionBox || geometry.overlapColumns.length ? 'yes' : 'no'}`, offsetX + 16, 106);
    ctx.restore();
  }

  function drawDebugBanner(debugState) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
    ctx.fillRect(260, 8, 440, 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(260, 8, 440, 24);
    ctx.fillStyle = '#f6e96b';
    ctx.font = '12px monospace';
    ctx.fillText(`DEBUG HITBOXES ON  F3 toggle  ${debugState.hint || ''}`.trim(), 270, 24);
    ctx.restore();
  }

  return { drawDebugCollision, drawDebugBanner };
}
