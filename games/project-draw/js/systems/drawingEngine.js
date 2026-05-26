import { TOOL_CONFIG } from '../core/config.js';
import { clamp, hexToRgb, rgbaFromHex, smoothOpenPath } from '../core/utils.js';

export function createDrawingSystem(state, refs, playerSystem) {
  const ctx = refs.canvas.getContext('2d');

  function resizeCanvas() {
    refs.canvas.width = state.world.width;
    refs.canvas.height = state.world.height;
    refs.canvas.style.width = `${state.world.width}px`;
    refs.canvas.style.height = `${state.world.height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    redrawAllStrokes();
  }

  function setupStrokeContext(color, width, alpha = 1) {
    ctx.strokeStyle = rgbaFromHex(color, alpha);
    ctx.fillStyle = rgbaFromHex(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawStroke(stroke) {
    if (!stroke) return;

    if (stroke.kind === 'path') {
      drawPathStroke(stroke);
    } else if (stroke.kind === 'spray') {
      drawSprayStroke(stroke);
    }
  }

  function drawPathStroke(stroke) {
    if (!stroke.points || stroke.points.length < 2) return;

    setupStrokeContext(stroke.color, stroke.lineWidth, stroke.alpha);
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    ctx.stroke();
  }

  function drawSprayStroke(stroke) {
    if (!stroke.stamps || stroke.stamps.length === 0) return;

    for (const stamp of stroke.stamps) {
      drawSprayStamp(stamp.x, stamp.y, stroke.color, stroke.radius, stroke.alpha, stroke.softness);
    }
  }

  function drawSprayStamp(x, y, color, radius, alpha, softness) {
    const { r, g, b } = hexToRgb(color);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
    gradient.addColorStop(Math.max(0.1, softness), `rgba(${r}, ${g}, ${b}, ${alpha * 0.38})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function redrawAllStrokes() {
    ctx.clearRect(0, 0, state.world.width, state.world.height);
    for (const stroke of state.drawing.strokes) drawStroke(stroke);
    if (state.player.activeStroke) drawStroke(state.player.activeStroke);
    updateUndoButton();
  }

  function updateUndoButton() {
    refs.undoButton.disabled = state.drawing.strokes.length === 0;
  }

  function undoLastStroke() {
    if (state.drawing.strokes.length === 0) return;
    state.drawing.strokes.pop();
    redrawAllStrokes();
  }

  function clearAllStrokes() {
    state.drawing.strokes = [];
    state.player.activeStroke = null;
    state.player.drawCursorX = null;
    state.player.drawCursorY = null;
    redrawAllStrokes();
  }

  function startStroke() {
    const tool = TOOL_CONFIG[state.drawing.activeTool];
    const tip = playerSystem.getTipPoint();

    state.player.drawCursorX = tip.x;
    state.player.drawCursorY = tip.y;
    state.player.prevX = state.player.x;
    state.player.prevY = state.player.y;
    state.player.sprayAccumulator = 0;

    if (tool.kind === 'path') {
      state.player.activeStroke = {
        kind: 'path',
        tool: state.drawing.activeTool,
        color: state.drawing.color,
        lineWidth: tool.width,
        alpha: tool.alpha,
        points: [{ x: state.player.drawCursorX, y: state.player.drawCursorY }]
      };
    } else if (tool.kind === 'spray') {
      state.player.activeStroke = {
        kind: 'spray',
        tool: state.drawing.activeTool,
        color: state.drawing.color,
        radius: tool.radius,
        alpha: tool.alpha,
        softness: tool.softness,
        stamps: []
      };
    } else {
      state.player.activeStroke = null;
    }
  }

  function finishActiveStroke() {
    if (!state.player.activeStroke) return;

    if (state.player.activeStroke.kind === 'path' && state.player.activeStroke.points.length > 1) {
      if (state.drawing.smooth && TOOL_CONFIG[state.drawing.activeTool].smoothable) {
        state.player.activeStroke.points = smoothOpenPath(state.player.activeStroke.points, 1);
      }
      state.drawing.strokes.push(state.player.activeStroke);
    }

    if (state.player.activeStroke.kind === 'spray' && state.player.activeStroke.stamps.length > 0) {
      state.drawing.strokes.push(state.player.activeStroke);
    }

    state.player.activeStroke = null;
    state.player.drawCursorX = null;
    state.player.drawCursorY = null;
    state.player.sprayAccumulator = 0;
    redrawAllStrokes();
  }

  function updateToolAction(dt) {
    if (!state.player.drawing) {
      state.player.prevX = state.player.x;
      state.player.prevY = state.player.y;
      return;
    }

    if (state.player.drawCursorX === null || state.player.drawCursorY === null) {
      const tip = playerSystem.getTipPoint();
      state.player.drawCursorX = tip.x;
      state.player.drawCursorY = tip.y;
    }

    const movedX = state.player.x - state.player.prevX;
    const movedY = state.player.y - state.player.prevY;

    state.player.drawCursorX = clamp(state.player.drawCursorX + movedX, 0, state.world.width);
    state.player.drawCursorY = clamp(state.player.drawCursorY + movedY, 0, state.world.height);

    const tool = TOOL_CONFIG[state.drawing.activeTool];

    if (tool.kind === 'path') {
      updatePathStroke();
    } else if (tool.kind === 'spray') {
      updateSpray(dt, tool);
    } else if (tool.kind === 'eraser') {
      eraseAt(state.player.drawCursorX, state.player.drawCursorY, tool.radius);
    }

    state.player.prevX = state.player.x;
    state.player.prevY = state.player.y;
  }

  function updatePathStroke() {
    const stroke = state.player.activeStroke;
    if (!stroke) return;

    const points = stroke.points;
    const last = points[points.length - 1];
    const dx = state.player.drawCursorX - last.x;
    const dy = state.player.drawCursorY - last.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 2.0 && dist < 42) {
      const nextPoint = {
        x: Math.round(state.player.drawCursorX * 10) / 10,
        y: Math.round(state.player.drawCursorY * 10) / 10
      };

      points.push(nextPoint);

      setupStrokeContext(stroke.color, stroke.lineWidth, stroke.alpha);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(nextPoint.x, nextPoint.y);
      ctx.stroke();
    }
  }

  function updateSpray(dt, tool) {
    const stroke = state.player.activeStroke;
    if (!stroke) return;

    state.player.sprayAccumulator += dt;

    while (state.player.sprayAccumulator >= tool.stampInterval) {
      state.player.sprayAccumulator -= tool.stampInterval;

      for (let i = 0; i < tool.stampsPerBurst; i++) {
        const jitterAngle = Math.random() * Math.PI * 2;
        const jitterDistance = Math.random() * tool.radius * 0.18;
        const x = clamp(state.player.drawCursorX + Math.cos(jitterAngle) * jitterDistance, 0, state.world.width);
        const y = clamp(state.player.drawCursorY + Math.sin(jitterAngle) * jitterDistance, 0, state.world.height);

        const stamp = { x, y };
        stroke.stamps.push(stamp);
        drawSprayStamp(x, y, stroke.color, stroke.radius, stroke.alpha, stroke.softness);
      }
    }
  }

  function eraseAt(x, y, radius) {
    if (state.drawing.strokes.length === 0) return;

    const keptStrokes = [];

    for (const stroke of state.drawing.strokes) {
      if (stroke.kind === 'spray') {
        const stamps = stroke.stamps.filter(stamp => Math.hypot(stamp.x - x, stamp.y - y) > radius + stroke.radius * 0.45);
        if (stamps.length > 0) keptStrokes.push({ ...stroke, stamps });
        continue;
      }

      if (stroke.kind === 'path') {
        let current = [];

        const flush = () => {
          if (current.length >= 2) keptStrokes.push({ ...stroke, points: current });
          current = [];
        };

        for (const pt of stroke.points) {
          if (Math.hypot(pt.x - x, pt.y - y) > radius) {
            current.push(pt);
          } else {
            flush();
          }
        }

        flush();
      }
    }

    state.drawing.strokes = keptStrokes;
    redrawAllStrokes();
  }

  return {
    resizeCanvas,
    redrawAllStrokes,
    undoLastStroke,
    clearAllStrokes,
    startStroke,
    finishActiveStroke,
    updateToolAction
  };
}
