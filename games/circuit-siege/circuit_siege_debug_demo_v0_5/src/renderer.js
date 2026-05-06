const TILE = 28;
const PAD_X = 32;
const PAD_Y = 70;

function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") el.setAttribute("class", value);
    else el.setAttribute(key, value);
  }
  for (const child of children) el.appendChild(child);
  return el;
}

function textNode(value) {
  return document.createTextNode(String(value));
}

function pointsAttr(points) {
  return points.map(([x, y]) => cellCenter(x, y).map((n) => n.toFixed(1)).join(",")).join(" ");
}

function cellCenter(x, y) {
  return [PAD_X + x * TILE + TILE / 2, PAD_Y + y * TILE + TILE / 2];
}

function sourceMap(boardData) {
  const map = {};
  for (const route of boardData.routes) {
    if (!map[route.sourceId]) {
      map[route.sourceId] = {
        x: route.points[0][0],
        owner: route.owner,
        idx: route.sourceIndex
      };
    }
  }
  return map;
}

function terminalMap(boardData) {
  const map = {};
  for (const route of boardData.routes) {
    if (!map[route.terminalId]) {
      map[route.terminalId] = {
        x: route.points[route.points.length - 1][0],
        owner: route.owner,
        idx: route.terminalIndex,
        type: route.terminalType
      };
    }
  }
  return map;
}

export class BoardRenderer {
  constructor({ svg, hoverInfo, state, log }) {
    this.svg = svg;
    this.hoverInfo = hoverInfo;
    this.state = state;
    this.log = log;
    this.selectedMask = "EW";
    this.onAction = null;
    this.zoom = 1;
    this.routeHoverCheatEnabled = true;
  }

  setSelectedMask(mask) {
    this.selectedMask = mask;
  }

  setRouteHoverCheatEnabled(enabled) {
    this.routeHoverCheatEnabled = Boolean(enabled);

    if (!this.routeHoverCheatEnabled) {
      this.clearRouteHover();
      this.hoverInfo.textContent = "Hovered route: disabled";
      return;
    }

    this.hoverInfo.textContent = "Hovered route: none";
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.svg.style.transform = `scale(${zoom})`;
  }

  render() {
    const { boardData } = this.state;
    const boardWidth = boardData.cols * TILE;
    const boardHeight = boardData.rows * TILE;
    const svgWidth = boardWidth + PAD_X * 2;
    const svgHeight = boardHeight + 190;

    this.svg.innerHTML = "";
    this.svg.setAttribute("width", svgWidth);
    this.svg.setAttribute("height", svgHeight);
    this.svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    this.drawHeader(svgWidth);
    this.drawGrid(boardData);
    this.drawSources(boardData);
    this.drawRoutes(boardData);
    this.drawSlots(boardData);
    this.drawTerminals(boardData);
    this.drawTerminalLabels(boardData);
  }

  drawHeader(svgWidth) {
    this.svg.appendChild(svgEl("text", {
      x: svgWidth / 2,
      y: 28,
      "text-anchor": "middle",
      fill: "#e5e7eb",
      "font-size": "18",
      "font-weight": "900"
    }, [textNode("POWER TRUNK — LOCKED SOURCE ZONE")]));

    this.svg.appendChild(svgEl("text", {
      x: svgWidth / 2,
      y: 50,
      "text-anchor": "middle",
      fill: "#94a3b8",
      "font-size": "11"
    }, [textNode("Debug mode: full-route hover is enabled and should be removed from competitive play.")]));
  }

  drawGrid(boardData) {
    for (let y = 0; y < boardData.rows; y++) {
      for (let x = 0; x < boardData.cols; x++) {
        const isWall = x === boardData.centerWallColumn;
        const fill = isWall ? "#0f172a" : ((x + y) % 2 ? "#242b35" : "#2d3541");
        this.svg.appendChild(svgEl("rect", {
          x: PAD_X + x * TILE,
          y: PAD_Y + y * TILE,
          width: TILE,
          height: TILE,
          fill,
          className: isWall ? "wall-cell" : "grid-cell"
        }));
      }
    }

    const wallX = PAD_X + boardData.centerWallColumn * TILE + TILE / 2;
    const wallY = PAD_Y + boardData.rows * TILE / 2;
    this.svg.appendChild(svgEl("text", {
      x: wallX,
      y: wallY,
      transform: `rotate(-90 ${wallX},${wallY})`,
      "text-anchor": "middle",
      fill: "#94a3b8",
      "font-size": "11",
      "font-weight": "900"
    }, [textNode("CENTER WALL")]));
  }

  drawSources(boardData) {
    for (const [id, meta] of Object.entries(sourceMap(boardData))) {
      const [cx] = cellCenter(meta.x, 0);
      const color = meta.owner === "blue" ? "#2e6dff" : "#ff3b30";
      this.svg.appendChild(svgEl("rect", {
        x: cx - 8,
        y: PAD_Y - 34,
        width: 16,
        height: 24,
        rx: 3,
        fill: color,
        className: "source-plug"
      }));
      this.svg.appendChild(svgEl("text", {
        x: cx,
        y: PAD_Y - 40,
        "text-anchor": "middle",
        className: "tiny"
      }, [textNode(meta.idx)]));
    }
  }

  drawRoutes(boardData) {
    for (const route of boardData.routes) {
      const routeState = this.state.routes[route.routeId];
      const lineClass = [
        "route-line",
        route.owner,
        routeState.completed && route.terminalType === "damage" ? "completed-damage" : "",
        routeState.completed && route.terminalType === "dud" ? "completed-dud" : ""
      ].filter(Boolean).join(" ");

      this.svg.appendChild(svgEl("polyline", {
        points: pointsAttr(route.points),
        className: "route-outline"
      }));

      const line = svgEl("polyline", {
        points: pointsAttr(route.points),
        className: lineClass,
        "data-route": route.routeId
      });
      line.addEventListener("mouseenter", () => this.setRouteHover(route.routeId, true));
      line.addEventListener("mouseleave", () => this.setRouteHover(route.routeId, false));
      this.svg.appendChild(line);
    }
  }

  drawSlots(boardData) {
    for (const slotData of boardData.repairSlots) {
      const slotState = this.state.slots[slotData.slotId];
      const [cx, cy] = cellCenter(slotData.x, slotData.y);

      const group = svgEl("g", {
        className: `slot ${slotData.slotType} ${slotState.locked ? "locked" : ""}`,
        "data-slot": slotData.slotId
      });

      group.appendChild(svgEl("rect", {
        x: cx - 11,
        y: cy - 11,
        width: 22,
        height: 22,
        rx: 3,
        className: "slot-base"
      }));

      if (slotState.placedMask) {
        this.drawPiece(group, slotState.placedMask, slotData.owner, cx, cy);
      }

      const label = slotState.locked ? "L" : (slotData.slotType === "hole" && !slotState.placedMask ? "H" : "R");
      group.appendChild(svgEl("text", {
        x: cx,
        y: cy + 4,
        "text-anchor": "middle",
        className: "slot-label"
      }, [textNode(label)]));

      group.appendChild(svgEl("text", {
        x: cx,
        y: cy + 19,
        "text-anchor": "middle",
        className: "slot-expected"
      }, [textNode(slotData.expectedMask)]));

      group.addEventListener("click", () => this.placeIntoSlot(slotData.slotId, this.selectedMask));
      group.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.rotateSlot(slotData.slotId);
      });
      group.addEventListener("dragover", (event) => event.preventDefault());
      group.addEventListener("drop", (event) => {
        event.preventDefault();
        const mask = event.dataTransfer.getData("text/plain");
        if (mask) this.placeIntoSlot(slotData.slotId, mask);
      });
      group.addEventListener("mouseenter", () => this.setRouteHover(slotData.routeId, true));
      group.addEventListener("mouseleave", () => this.setRouteHover(slotData.routeId, false));

      this.svg.appendChild(group);
    }
  }

  drawPiece(parent, mask, owner, cx, cy) {
    const dirs = {
      N: [cx, cy, cx, cy - TILE / 2 + 4],
      E: [cx, cy, cx + TILE / 2 - 4, cy],
      S: [cx, cy, cx, cy + TILE / 2 - 4],
      W: [cx, cy, cx - TILE / 2 + 4, cy]
    };

    for (const direction of mask) {
      const [x1, y1, x2, y2] = dirs[direction];
      parent.appendChild(svgEl("line", {
        x1,
        y1,
        x2,
        y2,
        className: `piece-path ${owner}`
      }));
    }
  }

  drawTerminals(boardData) {
    const boardHeight = boardData.rows * TILE;

    for (const [id, meta] of Object.entries(terminalMap(boardData))) {
      const [cx] = cellCenter(meta.x, boardData.rows - 1);
      const terminalState = this.state.terminals[id];
      const doneClass = terminalState.completed
        ? (meta.type === "damage" ? "completed-terminal-damage" : "completed-terminal-dud")
        : "";

      this.svg.appendChild(svgEl("rect", {
        x: cx - 13,
        y: PAD_Y + boardHeight + 12,
        width: 26,
        height: 26,
        rx: 4,
        className: `terminal-rect ${meta.type}-terminal ${meta.owner} ${doneClass}`
      }));

      this.svg.appendChild(svgEl("text", {
        x: cx,
        y: PAD_Y + boardHeight + 29,
        "text-anchor": "middle",
        className: "term-text"
      }, [textNode(meta.type === "damage" ? "DMG" : "DUD")]));

      this.svg.appendChild(svgEl("text", {
        x: cx,
        y: PAD_Y + boardHeight + 52,
        "text-anchor": "middle",
        className: "tiny"
      }, [textNode(meta.idx)]));
    }
  }

  drawTerminalLabels(boardData) {
    const boardHeight = boardData.rows * TILE;
    this.svg.appendChild(svgEl("text", {
      x: PAD_X + 20 * TILE / 2,
      y: PAD_Y + boardHeight + 78,
      "text-anchor": "middle",
      fill: "#93c5fd",
      "font-size": "13",
      "font-weight": "900"
    }, [textNode("BLUE TERMINALS")]));

    this.svg.appendChild(svgEl("text", {
      x: PAD_X + (boardData.centerWallColumn + 1) * TILE + 20 * TILE / 2,
      y: PAD_Y + boardHeight + 78,
      "text-anchor": "middle",
      fill: "#fca5a5",
      "font-size": "13",
      "font-weight": "900"
    }, [textNode("RED TERMINALS")]));
  }

  placeIntoSlot(slotId, mask) {
    const result = this.state.place(slotId, mask);
    if (this.onAction && result.ok) {
      this.onAction(result.message);
      if (result.resolved) this.onAction(result.resolved.message);
    }
  }

  rotateSlot(slotId) {
    const result = this.state.rotate(slotId);
    if (this.onAction && result.ok) {
      this.onAction(result.message);
      if (result.resolved) this.onAction(result.resolved.message);
    }
  }

  setRouteHover(routeId, on) {
    if (!this.routeHoverCheatEnabled) {
      this.clearRouteHover();
      this.hoverInfo.textContent = "Hovered route: disabled";
      return;
    }

    const route = this.state.boardData.routes.find((item) => item.routeId === routeId);
    const related = this.svg.querySelectorAll(`[data-route="${routeId}"]`);

    for (const element of related) {
      element.classList.toggle("hover", on);
    }

    if (on && route) {
      const slots = this.state.boardData.repairSlots.filter((slot) => slot.routeId === routeId);
      this.hoverInfo.innerHTML = `<strong>${route.routeId}</strong>: ${route.sourceId} → ${route.terminalId} • ${route.terminalType.toUpperCase()} • slots ${slots.length}`;
    } else {
      this.hoverInfo.textContent = "Hovered route: none";
    }
  }

  clearRouteHover() {
    this.svg.querySelectorAll(".route-line.hover").forEach((element) => {
      element.classList.remove("hover");
    });
  }
}
