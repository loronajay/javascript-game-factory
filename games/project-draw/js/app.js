    const CAMERA_LERP = 0.18;
    const DRAW_AXIS_SNAP_PRIMARY = 0.68;
    const DRAW_AXIS_SNAP_SECONDARY = 0.34;

    const SIZE_PRESETS = {
      small: { width: 1200, height: 900 },
      medium: { width: 1800, height: 1350 },
      large: { width: 2400, height: 1800 }
    };

    const FLOOR_PRESETS = {
      slate: '#1f2937',
      paper: '#dde5f0',
      concrete: '#6b7280',
      grass: '#4d7c0f',
      sand: '#b78339'
    };

    const TOOL_CONFIG = {
      pencil: { kind: 'path', width: 5, cursor: 8, snap: true, alpha: 1, smoothable: true },
      brush:  { kind: 'path', width: 10, cursor: 11, snap: false, alpha: 0.95, smoothable: true },
      spray:  { kind: 'spray', width: 1, cursor: 15, snap: false, alpha: 0.9, smoothable: false, radius: 14 },
      eraser: { kind: 'eraser', width: 1, cursor: 18, snap: false, alpha: 1, smoothable: false, radius: 20 },
      shape:  { kind: 'shape', width: 5, cursor: 10, snap: false, alpha: 1, smoothable: false }
    };

    const gameEl = document.getElementById('game');
    const cameraEl = document.getElementById('camera');
    const floorEl = document.getElementById('floor');
    const playerEl = document.getElementById('player');
    const cursorAnchorEl = document.getElementById('cursor-anchor');

    const joystickEl = document.getElementById('joystick');
    const knobEl = document.getElementById('knob');

    const drawButton = document.getElementById('draw-button');
    const fillButton = document.getElementById('fill-button');
    const undoButton = document.getElementById('undo-button');
    const clearButton = document.getElementById('clear-button');
    const fullViewButton = document.getElementById('full-view-button');
    const smoothToggle = document.getElementById('smooth-toggle');

    const lineColorInput = document.getElementById('line-color');
    const floorColorInput = document.getElementById('floor-color');
    const lineSwatch = document.getElementById('line-swatch');
    const floorSwatch = document.getElementById('floor-swatch');

    const setupOverlay = document.getElementById('setup-overlay');
    const sizeSelect = document.getElementById('size-select');
    const startButton = document.getElementById('start-button');
    const presetSwatches = Array.from(document.querySelectorAll('.preset-swatch'));
    const toolButtons = Array.from(document.querySelectorAll('.tool-button'));
    const shapePanel = document.getElementById('shape-panel');
    const shapeButtons = Array.from(document.querySelectorAll('.shape-button'));

    const canvas = document.getElementById('draw-canvas');
    const ctx = canvas.getContext('2d');
    const minimapPlayer = document.getElementById('minimap-player');
    const minimapView = document.getElementById('minimap-view');

    const world = {
      width: 1800,
      height: 1350,
      floorColor: FLOOR_PRESETS.slate
    };

    const player = {
      x: world.width / 2,
      y: world.height / 2,
      width: 50,
      height: 78,
      speed: 185,
      facingX: 0,
      facingY: 1,
      facingName: 'down',
      drawing: false,
      activeStroke: null,
      drawCursorX: null,
      drawCursorY: null,
      prevX: world.width / 2,
      prevY: world.height / 2,
      sprayAccumulator: 0
    };

    const camera = {
      x: 0,
      y: 0
    };

    const drawing = {
      strokes: [],
      color: '#ecf1ff',
      smooth: false,
      activeTool: 'pencil',
      activeShapeKind: 'line',
      fillAlpha: 0.86
    };

    const input = {
      keys: new Set(),
      stickX: 0,
      stickY: 0,
      activePointerId: null,
      drawPointerId: null
    };

    let fullView = false;
    let selectedFloorPreset = 'slate';

    const keyMap = new Map([
      ['ArrowUp', 'up'],
      ['KeyW', 'up'],
      ['ArrowDown', 'down'],
      ['KeyS', 'down'],
      ['ArrowLeft', 'left'],
      ['KeyA', 'left'],
      ['ArrowRight', 'right'],
      ['KeyD', 'right']
    ]);

    function getToolConfig() {
      return TOOL_CONFIG[drawing.activeTool];
    }

    function hexToRgb(hex) {
      const clean = hex.replace('#', '');
      const n = parseInt(clean, 16);
      return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255
      };
    }

    function rgbToCss({ r, g, b }, alpha = 1) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function adjustHex(hex, amount) {
      const { r, g, b } = hexToRgb(hex);
      return `rgb(${Math.max(0, Math.min(255, r + amount))}, ${Math.max(0, Math.min(255, g + amount))}, ${Math.max(0, Math.min(255, b + amount))})`;
    }

    function applyFloorColor(hex) {
      world.floorColor = hex;
      floorEl.style.setProperty('--floor-a', hex);
      floorEl.style.setProperty('--floor-b', adjustHex(hex, 22));
      floorEl.style.setProperty('--floor-c', adjustHex(hex, -18));
      floorColorInput.value = rgbStringToHex(hex.startsWith('#') ? hex : rgbCssToHex(hex));
      floorSwatch.style.background = floorColorInput.value;
    }

    function rgbCssToHex(css) {
      const match = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
      if (!match) return '#1f2937';
      const [_, r, g, b] = match;
      return '#' + [r, g, b].map(v => Number(v).toString(16).padStart(2, '0')).join('');
    }

    function rgbStringToHex(value) {
      if (value.startsWith('#')) return value;
      return rgbCssToHex(value);
    }

    function setupWorldDimensions() {
      cameraEl.style.width = `${world.width}px`;
      cameraEl.style.height = `${world.height}px`;
      floorEl.style.width = `${world.width}px`;
      floorEl.style.height = `${world.height}px`;
    }

    const fillBoundaryCanvas = document.createElement('canvas');
    const fillBoundaryCtx = fillBoundaryCanvas.getContext('2d', { willReadFrequently: true });
    const fillRenderCanvas = document.createElement('canvas');
    const fillRenderCtx = fillRenderCanvas.getContext('2d');

    function resizeCanvas() {
      canvas.width = world.width;
      canvas.height = world.height;
      canvas.style.width = `${world.width}px`;
      canvas.style.height = `${world.height}px`;

      fillBoundaryCanvas.width = world.width;
      fillBoundaryCanvas.height = world.height;
      fillRenderCanvas.width = world.width;
      fillRenderCanvas.height = world.height;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      redrawAllStrokes();
    }

    function applyCanvasPreset(sizeKey, floorPresetKey) {
      const preset = SIZE_PRESETS[sizeKey] || SIZE_PRESETS.medium;
      world.width = preset.width;
      world.height = preset.height;

      setupWorldDimensions();
      drawing.strokes = [];
      player.activeStroke = null;
      player.drawCursorX = null;
      player.drawCursorY = null;
      player.x = world.width / 2;
      player.y = world.height / 2;
      player.prevX = player.x;
      player.prevY = player.y;

      selectedFloorPreset = floorPresetKey;
      const floorHex = FLOOR_PRESETS[floorPresetKey] || FLOOR_PRESETS.slate;
      applyFloorColor(floorHex);

      camera.x = Math.max(0, Math.min(world.width - window.innerWidth, player.x - window.innerWidth / 2));
      camera.y = Math.max(0, Math.min(world.height - window.innerHeight, player.y - window.innerHeight / 2));

      resizeCanvas();
      updateCursorVisual();
      renderPlayer(false);
      renderCamera();
      renderMinimap();
    }

    function setupDrawContext(color, width, alpha = 1) {
      const { r, g, b } = hexToRgb(color);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    function drawStroke(stroke) {
      if (!stroke) return;

      if (stroke.kind === 'path') {
        if (!stroke.points || stroke.points.length < 2) return;
        setupDrawContext(stroke.color, stroke.lineWidth, stroke.alpha);
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      } else if (stroke.kind === 'spray') {
        if (!stroke.dots || stroke.dots.length === 0) return;
        const { r, g, b } = hexToRgb(stroke.color);
        for (const dot of stroke.dots) {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dot.alpha})`;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (stroke.kind === 'shape') {
        drawShapeStroke(stroke);
      } else if (stroke.kind === 'fill') {
        drawFillStroke(stroke);
      }
    }

    function drawFillStroke(stroke) {
      if (!stroke || !stroke.imageData) return;

      // Do not use ctx.putImageData() on the main canvas here.
      // putImageData writes transparent pixels too, which can erase older fills
      // inside the rectangular crop around this fill region.
      fillRenderCanvas.width = stroke.width;
      fillRenderCanvas.height = stroke.height;
      fillRenderCtx.clearRect(0, 0, stroke.width, stroke.height);
      fillRenderCtx.putImageData(stroke.imageData, 0, 0);
      ctx.drawImage(fillRenderCanvas, stroke.x, stroke.y);
    }

    function redrawAllStrokes() {
      ctx.clearRect(0, 0, world.width, world.height);
      for (const stroke of drawing.strokes) {
        if (stroke.kind === 'fill') drawStroke(stroke);
      }
      for (const stroke of drawing.strokes) {
        if (stroke.kind !== 'fill') drawStroke(stroke);
      }
      if (player.activeStroke) drawStroke(player.activeStroke);
      updateUndoButton();
    }

    function drawShapeStroke(stroke) {
      if (!stroke) return;
      setupDrawContext(stroke.color, stroke.lineWidth, stroke.alpha);
      const x1 = stroke.x1;
      const y1 = stroke.y1;
      const x2 = stroke.x2;
      const y2 = stroke.y2;
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      ctx.beginPath();

      if (stroke.shapeKind === 'line') {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      } else if (stroke.shapeKind === 'rect') {
        ctx.rect(left, top, width, height);
      } else if (stroke.shapeKind === 'ellipse') {
        ctx.ellipse(left + width / 2, top + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
      } else if (stroke.shapeKind === 'triangle') {
        const cx = (left + left + width) / 2;
        ctx.moveTo(cx, top);
        ctx.lineTo(left, top + height);
        ctx.lineTo(left + width, top + height);
        ctx.closePath();
      }

      ctx.stroke();
    }

    function shapeHasMeaningfulSize(stroke) {
      if (!stroke) return false;
      if (stroke.shapeKind === 'line') {
        return Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1) >= 4;
      }
      return Math.abs(stroke.x2 - stroke.x1) >= 4 || Math.abs(stroke.y2 - stroke.y1) >= 4;
    }


    function drawBoundaryStroke(targetCtx, stroke) {
      if (!stroke || stroke.kind === 'fill') return;
      targetCtx.save();
      targetCtx.strokeStyle = 'rgba(0,0,0,1)';
      targetCtx.fillStyle = 'rgba(0,0,0,1)';
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';

      if (stroke.kind === 'path') {
        if (!stroke.points || stroke.points.length < 2) {
          targetCtx.restore();
          return;
        }
        targetCtx.lineWidth = stroke.lineWidth;
        targetCtx.beginPath();
        targetCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          targetCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        targetCtx.stroke();
      } else if (stroke.kind === 'spray') {
        for (const dot of stroke.dots || []) {
          targetCtx.beginPath();
          targetCtx.arc(dot.x, dot.y, Math.max(1.2, dot.radius), 0, Math.PI * 2);
          targetCtx.fill();
        }
      } else if (stroke.kind === 'shape') {
        targetCtx.lineWidth = stroke.lineWidth;
        const x1 = stroke.x1;
        const y1 = stroke.y1;
        const x2 = stroke.x2;
        const y2 = stroke.y2;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        targetCtx.beginPath();
        if (stroke.shapeKind === 'line') {
          targetCtx.moveTo(x1, y1);
          targetCtx.lineTo(x2, y2);
        } else if (stroke.shapeKind === 'rect') {
          targetCtx.rect(left, top, width, height);
        } else if (stroke.shapeKind === 'ellipse') {
          targetCtx.ellipse(left + width / 2, top + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
        } else if (stroke.shapeKind === 'triangle') {
          const cx = (left + left + width) / 2;
          targetCtx.moveTo(cx, top);
          targetCtx.lineTo(left, top + height);
          targetCtx.lineTo(left + width, top + height);
          targetCtx.closePath();
        }
        targetCtx.stroke();
      }

      targetCtx.restore();
    }

    function renderBoundaryLayer() {
      fillBoundaryCtx.clearRect(0, 0, world.width, world.height);
      for (const stroke of drawing.strokes) {
        drawBoundaryStroke(fillBoundaryCtx, stroke);
      }
    }

    function createFillStrokeAt(x, y) {
      const sx = Math.max(0, Math.min(world.width - 1, Math.floor(x)));
      const sy = Math.max(0, Math.min(world.height - 1, Math.floor(y)));

      renderBoundaryLayer();
      const image = fillBoundaryCtx.getImageData(0, 0, world.width, world.height);
      const data = image.data;
      const startAlpha = data[((sy * world.width + sx) * 4) + 3];
      if (startAlpha > 8) return null;

      const w = world.width;
      const h = world.height;
      const visited = new Uint8Array(w * h);
      const stack = [sx, sy];
      let minX = sx, maxX = sx, minY = sy, maxY = sy;
      let count = 0;

      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();

        let lx = cx;
        while (lx >= 0) {
          const li = cy * w + lx;
          const la = data[(li * 4) + 3];
          if (visited[li] || la > 8) break;
          lx--;
        }
        lx++;

        let spanUp = false;
        let spanDown = false;

        for (let ix = lx; ix < w; ix++) {
          const pi = cy * w + ix;
          const pa = data[(pi * 4) + 3];
          if (visited[pi] || pa > 8) break;

          visited[pi] = 1;
          count++;
          if (ix < minX) minX = ix;
          if (ix > maxX) maxX = ix;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          if (cy > 0) {
            const up = pi - w;
            const upBoundary = data[(up * 4) + 3] > 8;
            if (!spanUp && !visited[up] && !upBoundary) {
              stack.push(ix, cy - 1);
              spanUp = true;
            } else if (spanUp && (visited[up] || upBoundary)) {
              spanUp = false;
            }
          }

          if (cy < h - 1) {
            const down = pi + w;
            const downBoundary = data[(down * 4) + 3] > 8;
            if (!spanDown && !visited[down] && !downBoundary) {
              stack.push(ix, cy + 1);
              spanDown = true;
            } else if (spanDown && (visited[down] || downBoundary)) {
              spanDown = false;
            }
          }
        }
      }

      if (count === 0) return null;

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const img = new ImageData(cropW, cropH);
      const { r, g, b } = hexToRgb(drawing.color);
      const alpha = Math.round(255 * drawing.fillAlpha);

      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const srcIndex = yy * w + xx;
          if (!visited[srcIndex]) continue;
          const di = ((yy - minY) * cropW + (xx - minX)) * 4;
          img.data[di] = r;
          img.data[di + 1] = g;
          img.data[di + 2] = b;
          img.data[di + 3] = alpha;
        }
      }

      return {
        kind: 'fill',
        x: minX,
        y: minY,
        width: cropW,
        height: cropH,
        imageData: img,
        color: drawing.color,
        alpha: drawing.fillAlpha
      };
    }

    function getCursorAnchorPoint() {
      if (player.drawing && player.drawCursorX !== null && player.drawCursorY !== null) {
        return { x: player.drawCursorX, y: player.drawCursorY };
      }
      return getTipPoint();
    }

    function triggerFill() {
      if (fullView || setupOverlay.style.display !== 'none') return;
      if (player.drawing) return;

      const point = getCursorAnchorPoint();
      const fillStroke = createFillStrokeAt(point.x, point.y);
      if (!fillStroke) return;

      drawing.strokes.push(fillStroke);
      redrawAllStrokes();

      fillButton.classList.add('active');
      window.setTimeout(() => fillButton.classList.remove('active'), 120);
    }


    function updateUndoButton() {
      undoButton.disabled = drawing.strokes.length === 0;
    }

    function undoLastStroke() {
      if (drawing.strokes.length === 0) return;
      drawing.strokes.pop();
      redrawAllStrokes();
    }

    function clearAllStrokes() {
      drawing.strokes = [];
      player.activeStroke = null;
      player.drawCursorX = null;
      player.drawCursorY = null;
      redrawAllStrokes();
    }

    function smoothOpenPath(points, passes = 1) {
      let result = points.slice();
      for (let pass = 0; pass < passes; pass++) {
        if (result.length < 3) break;
        const out = [result[0]];
        for (let i = 0; i < result.length - 1; i++) {
          const p0 = result[i];
          const p1 = result[i + 1];
          out.push({
            x: p0.x * 0.75 + p1.x * 0.25,
            y: p0.y * 0.75 + p1.y * 0.25
          });
          out.push({
            x: p0.x * 0.25 + p1.x * 0.75,
            y: p0.y * 0.25 + p1.y * 0.75
          });
        }
        out.push(result[result.length - 1]);
        result = out;
      }
      return result;
    }

    function finishActiveStroke() {
      if (!player.activeStroke) return;

      if (player.activeStroke.kind === 'path' && player.activeStroke.points.length > 1) {
        if (drawing.smooth && getToolConfig().smoothable) {
          player.activeStroke.points = smoothOpenPath(player.activeStroke.points, 1);
        }
        drawing.strokes.push(player.activeStroke);
      } else if (player.activeStroke.kind === 'spray' && player.activeStroke.dots.length > 0) {
        drawing.strokes.push(player.activeStroke);
      } else if (player.activeStroke.kind === 'shape' && shapeHasMeaningfulSize(player.activeStroke)) {
        drawing.strokes.push(player.activeStroke);
      }

      player.activeStroke = null;
      player.drawCursorX = null;
      player.drawCursorY = null;
      player.sprayAccumulator = 0;
      redrawAllStrokes();
    }

    function setActiveTool(toolName) {
      if (!TOOL_CONFIG[toolName]) return;
      setDrawing(false);
      drawing.activeTool = toolName;

      toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === toolName));
      playerEl.classList.remove('tool-pencil', 'tool-brush', 'tool-spray', 'tool-eraser', 'tool-shape');
      playerEl.classList.add(`tool-${toolName}`);

      shapePanel.classList.toggle('visible', toolName === 'shape');
      updateCursorVisual();
    }

    function setDrawing(isDrawing) {
      if (fullView) isDrawing = false;
      if (player.drawing === isDrawing) return;

      player.drawing = isDrawing;
      drawButton.classList.toggle('active', isDrawing);
      drawButton.textContent = isDrawing ? 'Down' : 'Draw';

      if (isDrawing) {
        const tip = getTipPoint();
        player.drawCursorX = tip.x;
        player.drawCursorY = tip.y;
        player.prevX = player.x;
        player.prevY = player.y;
        player.sprayAccumulator = 0;

        const tool = getToolConfig();
        if (tool.kind === 'path') {
          player.activeStroke = {
            kind: 'path',
            tool: drawing.activeTool,
            color: drawing.color,
            lineWidth: tool.width,
            alpha: tool.alpha,
            points: [{ x: player.drawCursorX, y: player.drawCursorY }]
          };
        } else if (tool.kind === 'spray') {
          player.activeStroke = {
            kind: 'spray',
            tool: drawing.activeTool,
            color: drawing.color,
            dots: []
          };
        } else if (tool.kind === 'shape') {
          player.activeStroke = {
            kind: 'shape',
            tool: drawing.activeTool,
            shapeKind: drawing.activeShapeKind,
            color: drawing.color,
            lineWidth: tool.width,
            alpha: tool.alpha,
            x1: player.drawCursorX,
            y1: player.drawCursorY,
            x2: player.drawCursorX,
            y2: player.drawCursorY
          };
        } else {
          player.activeStroke = null;
        }
      } else {
        finishActiveStroke();
      }

      updateCursorVisual();
    }

    function setFullView(enabled) {
      fullView = enabled;
      setDrawing(false);
      resetStick();
      input.keys.clear();

      gameEl.classList.toggle('full-view', fullView);
      fullViewButton.textContent = fullView ? 'Exit Full' : 'Full View';
      renderCamera();
    }

    function updateCursorVisual() {
      const tool = getToolConfig();
      const size = tool.cursor * 2;
      cursorAnchorEl.style.width = `${size}px`;
      cursorAnchorEl.style.height = `${size}px`;

      const color = drawing.activeTool === 'eraser' ? '#ff9fbe' : drawing.color;
      cursorAnchorEl.style.borderColor = color;
      cursorAnchorEl.style.setProperty('box-shadow', drawing.activeTool === 'eraser'
        ? `0 0 0 2px rgba(15,23,42,0.42), 0 0 16px rgba(255, 160, 190, 0.42)`
        : `0 0 0 2px rgba(15,23,42,0.42), 0 0 16px ${hexToGlow(color)}`);

      cursorAnchorEl.classList.toggle('erase', drawing.activeTool === 'eraser');
      cursorAnchorEl.classList.toggle('active', player.drawing);
      cursorAnchorEl.style.opacity = player.drawing ? '1' : '0.78';
    }

    function hexToGlow(hex) {
      const { r, g, b } = hexToRgb(hex);
      return `rgba(${r}, ${g}, ${b}, 0.35)`;
    }

    function updateCursorPosition() {
      let x, y;

      if (player.drawing && player.drawCursorX !== null && player.drawCursorY !== null) {
        x = player.drawCursorX;
        y = player.drawCursorY;
      } else {
        const tip = getTipPoint();
        x = tip.x;
        y = tip.y;
      }

      cursorAnchorEl.style.left = `${x}px`;
      cursorAnchorEl.style.top = `${y}px`;
    }

    function getJoystickCenter() {
      const rect = joystickEl.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        radius: rect.width * 0.5
      };
    }

    function updateStickFromPointer(clientX, clientY) {
      if (fullView) return;

      const center = getJoystickCenter();
      const maxDistance = center.radius - 27;
      const dx = clientX - center.x;
      const dy = clientY - center.y;
      const distance = Math.hypot(dx, dy);
      const clampedDistance = Math.min(distance, maxDistance);
      const angle = Math.atan2(dy, dx);
      const knobX = Math.cos(angle) * clampedDistance;
      const knobY = Math.sin(angle) * clampedDistance;

      knobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

      const deadzone = 0.12;
      const normalized = Math.min(distance / maxDistance, 1);
      const strength = normalized < deadzone ? 0 : normalized;

      input.stickX = Math.cos(angle) * strength;
      input.stickY = Math.sin(angle) * strength;
    }

    function resetStick() {
      input.activePointerId = null;
      input.stickX = 0;
      input.stickY = 0;
      knobEl.style.transform = 'translate(-50%, -50%)';
    }

    function getMoveVector() {
      if (fullView) return { x: 0, y: 0, moving: false };

      let x = input.stickX;
      let y = input.stickY;

      if (input.keys.has('left')) x -= 1;
      if (input.keys.has('right')) x += 1;
      if (input.keys.has('up')) y -= 1;
      if (input.keys.has('down')) y += 1;

      const magnitude = Math.hypot(x, y);
      if (magnitude <= 0.001) return { x: 0, y: 0, moving: false };

      let nx = x / magnitude;
      let ny = y / magnitude;

      const tool = getToolConfig();
      if (player.drawing && tool.snap) {
        const ax = Math.abs(nx);
        const ay = Math.abs(ny);

        if (ax >= DRAW_AXIS_SNAP_PRIMARY && ay <= DRAW_AXIS_SNAP_SECONDARY) {
          nx = Math.sign(nx);
          ny = 0;
        } else if (ay >= DRAW_AXIS_SNAP_PRIMARY && ax <= DRAW_AXIS_SNAP_SECONDARY) {
          nx = 0;
          ny = Math.sign(ny);
        }
      }

      return { x: nx, y: ny, moving: true };
    }

    function updateFacing(move) {
      if (!move.moving) return;

      player.facingX = move.x;
      player.facingY = move.y;

      let nextFacing;
      if (Math.abs(move.x) > Math.abs(move.y)) {
        nextFacing = move.x < 0 ? 'left' : 'right';
      } else {
        nextFacing = move.y < 0 ? 'up' : 'down';
      }

      if (nextFacing !== player.facingName) player.facingName = nextFacing;
    }

    function getTipPoint() {
      let offsetX = 9;
      let offsetY = 31;

      if (player.facingName === 'left') {
        offsetX = -9;
        offsetY = 31;
      } else if (player.facingName === 'up') {
        offsetX = 3;
        offsetY = 22;
      } else if (player.facingName === 'down') {
        offsetX = 9;
        offsetY = 31;
      } else if (player.facingName === 'right') {
        offsetX = 9;
        offsetY = 31;
      }

      return { x: player.x + offsetX, y: player.y + offsetY };
    }

    function stampSprayDot() {
      if (!player.activeStroke || player.activeStroke.kind !== 'spray') return;
      const radius = TOOL_CONFIG.spray.radius;
      for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const x = player.drawCursorX + Math.cos(angle) * dist;
        const y = player.drawCursorY + Math.sin(angle) * dist;
        const dot = {
          x: Math.max(0, Math.min(world.width, x)),
          y: Math.max(0, Math.min(world.height, y)),
          radius: 1 + Math.random() * 1.6,
          alpha: 0.14 + Math.random() * 0.28
        };
        player.activeStroke.dots.push(dot);

        const { r, g, b } = hexToRgb(player.activeStroke.color);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dot.alpha})`;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function eraseAt(x, y, radius) {
      if (drawing.strokes.length === 0) return;

      const keptStrokes = [];

      for (const stroke of drawing.strokes) {
        if (stroke.kind === 'spray') {
          const dots = stroke.dots.filter(dot => Math.hypot(dot.x - x, dot.y - y) > radius);
          if (dots.length > 0) keptStrokes.push({ ...stroke, dots });
          continue;
        }

        if (stroke.kind === 'shape') {
          const left = Math.min(stroke.x1, stroke.x2) - radius;
          const right = Math.max(stroke.x1, stroke.x2) + radius;
          const top = Math.min(stroke.y1, stroke.y2) - radius;
          const bottom = Math.max(stroke.y1, stroke.y2) + radius;
          const hit = x >= left && x <= right && y >= top && y <= bottom;
          if (!hit) keptStrokes.push(stroke);
          continue;
        }

        if (stroke.kind === 'fill') {
          const lx = Math.floor(x - stroke.x);
          const ly = Math.floor(y - stroke.y);
          let hit = false;
          if (lx >= 0 && ly >= 0 && lx < stroke.width && ly < stroke.height) {
            const idx = (ly * stroke.width + lx) * 4 + 3;
            hit = stroke.imageData.data[idx] > 0;
          }
          if (!hit) keptStrokes.push(stroke);
          continue;
        }

        if (stroke.kind === 'path') {
          let current = [];

          const flush = () => {
            if (current.length >= 2) {
              keptStrokes.push({ ...stroke, points: current });
            }
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

      drawing.strokes = keptStrokes;
      redrawAllStrokes();
    }

    function updateToolAction(dt) {
      if (!player.drawing) {
        player.prevX = player.x;
        player.prevY = player.y;
        return;
      }

      if (player.drawCursorX === null || player.drawCursorY === null) {
        const tip = getTipPoint();
        player.drawCursorX = tip.x;
        player.drawCursorY = tip.y;
      }

      const movedX = player.x - player.prevX;
      const movedY = player.y - player.prevY;

      player.drawCursorX += movedX;
      player.drawCursorY += movedY;
      player.drawCursorX = Math.max(0, Math.min(world.width, player.drawCursorX));
      player.drawCursorY = Math.max(0, Math.min(world.height, player.drawCursorY));

      const tool = getToolConfig();

      if (tool.kind === 'path' && player.activeStroke) {
        const points = player.activeStroke.points;
        const last = points[points.length - 1];
        const dx = player.drawCursorX - last.x;
        const dy = player.drawCursorY - last.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 2.0 && dist < 42) {
          const nextPoint = {
            x: Math.round(player.drawCursorX * 10) / 10,
            y: Math.round(player.drawCursorY * 10) / 10
          };
          points.push(nextPoint);

          setupDrawContext(player.activeStroke.color, player.activeStroke.lineWidth, player.activeStroke.alpha);
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(nextPoint.x, nextPoint.y);
          ctx.stroke();
        }
      } else if (tool.kind === 'spray') {
        player.sprayAccumulator += dt;
        while (player.sprayAccumulator >= 0.018) {
          player.sprayAccumulator -= 0.018;
          stampSprayDot();
        }
      } else if (tool.kind === 'shape' && player.activeStroke) {
        player.activeStroke.x2 = Math.round(player.drawCursorX * 10) / 10;
        player.activeStroke.y2 = Math.round(player.drawCursorY * 10) / 10;
        redrawAllStrokes();
      } else if (tool.kind === 'eraser') {
        eraseAt(player.drawCursorX, player.drawCursorY, tool.radius);
      }

      player.prevX = player.x;
      player.prevY = player.y;
    }

    function clampPlayerToWorld() {
      const halfW = player.width / 2;
      const halfH = player.height / 2;
      player.x = Math.max(halfW, Math.min(world.width - halfW, player.x));
      player.y = Math.max(halfH, Math.min(world.height - halfH, player.y));
    }

    function updateCamera() {
      if (fullView) return;

      const targetX = player.x - window.innerWidth / 2;
      const targetY = player.y - window.innerHeight / 2;
      const maxX = Math.max(0, world.width - window.innerWidth);
      const maxY = Math.max(0, world.height - window.innerHeight);

      const clampedTargetX = Math.max(0, Math.min(maxX, targetX));
      const clampedTargetY = Math.max(0, Math.min(maxY, targetY));

      camera.x += (clampedTargetX - camera.x) * CAMERA_LERP;
      camera.y += (clampedTargetY - camera.y) * CAMERA_LERP;
    }

    function renderPlayer(moving) {
      playerEl.style.left = `${player.x}px`;
      playerEl.style.top = `${player.y}px`;
      playerEl.style.setProperty('--face-x', player.facingName === 'left' ? -1 : 1);

      playerEl.classList.toggle('moving', moving);
      playerEl.classList.toggle('drawing', player.drawing);
      playerEl.classList.toggle('facing-up', player.facingName === 'up');
      playerEl.classList.toggle('facing-down', player.facingName === 'down');
      playerEl.classList.toggle('facing-left', player.facingName === 'left');
      playerEl.classList.toggle('facing-right', player.facingName === 'right');
    }

    function renderCamera() {
      if (fullView) {
        const scale = Math.min(window.innerWidth / world.width, window.innerHeight / world.height);
        const x = Math.round((window.innerWidth - world.width * scale) / 2);
        const y = Math.round((window.innerHeight - world.height * scale) / 2);
        cameraEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        return;
      }

      const ix = Math.round(camera.x);
      const iy = Math.round(camera.y);
      cameraEl.style.transform = `translate3d(${-ix}px, ${-iy}px, 0)`;
    }

    function renderMinimap() {
      const rect = minimapView.parentElement.getBoundingClientRect();
      const mapW = rect.width || 118;
      const mapH = rect.height || 88;
      const px = (player.x / world.width) * mapW;
      const py = (player.y / world.height) * mapH;

      minimapPlayer.style.left = `${px}px`;
      minimapPlayer.style.top = `${py}px`;

      const viewW = Math.max(10, (window.innerWidth / world.width) * mapW);
      const viewH = Math.max(10, (window.innerHeight / world.height) * mapH);
      const viewX = (camera.x / world.width) * mapW;
      const viewY = (camera.y / world.height) * mapH;

      minimapView.style.left = `${viewX}px`;
      minimapView.style.top = `${viewY}px`;
      minimapView.style.width = `${viewW}px`;
      minimapView.style.height = `${viewH}px`;
    }

    function startCanvas() {
      applyCanvasPreset(sizeSelect.value, selectedFloorPreset);
      setupOverlay.style.display = 'none';
    }

    joystickEl.addEventListener('pointerdown', (event) => {
      if (fullView) return;
      input.activePointerId = event.pointerId;
      joystickEl.setPointerCapture(event.pointerId);
      updateStickFromPointer(event.clientX, event.clientY);
    });

    joystickEl.addEventListener('pointermove', (event) => {
      if (event.pointerId !== input.activePointerId) return;
      updateStickFromPointer(event.clientX, event.clientY);
    });

    joystickEl.addEventListener('pointerup', resetStick);
    joystickEl.addEventListener('pointercancel', resetStick);
    joystickEl.addEventListener('lostpointercapture', resetStick);

    drawButton.addEventListener('pointerdown', (event) => {
      if (fullView) return;
      input.drawPointerId = event.pointerId;
      drawButton.setPointerCapture(event.pointerId);
      setDrawing(true);
      event.preventDefault();
    });

    fillButton.addEventListener('pointerdown', (event) => {
      if (fullView) return;
      fillButton.setPointerCapture(event.pointerId);
      triggerFill();
      event.preventDefault();
    });

    fillButton.addEventListener('pointerup', () => {
      fillButton.classList.remove('active');
    });

    fillButton.addEventListener('pointercancel', () => {
      fillButton.classList.remove('active');
    });

    fillButton.addEventListener('lostpointercapture', () => {
      fillButton.classList.remove('active');
    });

    drawButton.addEventListener('pointerup', (event) => {
      if (event.pointerId !== input.drawPointerId) return;
      input.drawPointerId = null;
      setDrawing(false);
      event.preventDefault();
    });

    drawButton.addEventListener('pointercancel', () => {
      input.drawPointerId = null;
      setDrawing(false);
    });

    drawButton.addEventListener('lostpointercapture', () => {
      input.drawPointerId = null;
      setDrawing(false);
    });

    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
    });

    shapeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        drawing.activeShapeKind = btn.dataset.shape;
        shapeButtons.forEach(x => x.classList.toggle('active', x === btn));
      });
    });

    lineColorInput.addEventListener('input', () => {
      drawing.color = lineColorInput.value;
      lineSwatch.style.background = drawing.color;
      updateCursorVisual();
    });

    floorColorInput.addEventListener('input', () => {
      applyFloorColor(floorColorInput.value);
    });

    smoothToggle.addEventListener('click', () => {
      drawing.smooth = !drawing.smooth;
      smoothToggle.classList.toggle('active', drawing.smooth);
      smoothToggle.textContent = drawing.smooth ? 'Mode: Smooth' : 'Mode: Raw';
    });

    undoButton.addEventListener('click', undoLastStroke);
    clearButton.addEventListener('click', clearAllStrokes);
    fullViewButton.addEventListener('click', () => setFullView(!fullView));

    presetSwatches.forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFloorPreset = btn.dataset.preset;
        presetSwatches.forEach(x => x.classList.toggle('active', x === btn));
      });
    });

    startButton.addEventListener('click', startCanvas);

    window.addEventListener('keydown', (event) => {
      if (setupOverlay.style.display !== 'none') {
        if (event.code === 'Enter') {
          startCanvas();
          event.preventDefault();
        }
        return;
      }

      if (fullView) {
        if (event.code === 'Escape') {
          setFullView(false);
          event.preventDefault();
        }
        return;
      }

      const mapped = keyMap.get(event.code);
      if (mapped) {
        input.keys.add(mapped);
        event.preventDefault();
        return;
      }

      if (event.code === 'Space') {
        setDrawing(true);
        event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
        undoLastStroke();
        event.preventDefault();
      }

      if (event.code === 'KeyF') {
        triggerFill();
        event.preventDefault();
      }

      if (event.code === 'Digit1') setActiveTool('pencil');
      if (event.code === 'Digit2') setActiveTool('brush');
      if (event.code === 'Digit3') setActiveTool('spray');
      if (event.code === 'Digit4') setActiveTool('eraser');
      if (event.code === 'Digit5') setActiveTool('shape');
    });

    window.addEventListener('keyup', (event) => {
      const mapped = keyMap.get(event.code);
      if (mapped) {
        input.keys.delete(mapped);
        event.preventDefault();
        return;
      }

      if (event.code === 'Space') {
        setDrawing(false);
        event.preventDefault();
      }
    });

    window.addEventListener('resize', () => {
      renderCamera();
      renderMinimap();
    });

    let lastTime = performance.now();

    function frame(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (setupOverlay.style.display !== 'none') {
        requestAnimationFrame(frame);
        return;
      }

      const move = getMoveVector();
      const beforeX = player.x;
      const beforeY = player.y;

      if (move.moving) {
        player.x += move.x * player.speed * dt;
        player.y += move.y * player.speed * dt;
      }

      updateFacing(move);
      clampPlayerToWorld();

      player.prevX = beforeX;
      player.prevY = beforeY;

      updateToolAction(dt);
      updateCamera();
      updateCursorPosition();

      renderPlayer(move.moving);
      renderCamera();
      renderMinimap();

      requestAnimationFrame(frame);
    }

    // Boot visuals
    lineSwatch.style.background = drawing.color;
    floorSwatch.style.background = '#1f2937';
    updateCursorVisual();
    requestAnimationFrame(frame);