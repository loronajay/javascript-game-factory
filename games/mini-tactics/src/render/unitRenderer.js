import { gridToScreen } from "../geometry/isometric.js";
import { colorOf } from "../state/gameState.js";
import { createSvgElement } from "./svg.js";
import { hpClass } from "./hp.js";

export class UnitRenderer {
  constructor({ unitsLayer, metrics, onUnitClick }) {
    this.unitsLayer = unitsLayer;
    this.metrics = metrics;
    this.onUnitClick = onUnitClick;
  }

  setMetrics(metrics) {
    this.metrics = metrics;
  }

  render(state) {
    this.unitsLayer.replaceChildren();

    const sortedUnits = [...state.units]
      .filter((unit) => unit.hp > 0)
      .sort((a, b) => (a.x + a.y) - (b.x + b.y));

    for (const unit of sortedUnits) {
      this.unitsLayer.appendChild(this.createUnitElement(state, unit));
    }
  }

  createUnitElement(state, unit) {
    const point = gridToScreen(this.metrics, unit.x, unit.y);
    const renderY = point.y + this.metrics.tileHeight * 0.45;
    const classes = ["unit", `p${unit.player}`, "idle"];

    if (unit.spent) classes.push("spent");
    if (unit.defending) classes.push("defending");
    if (unit.id === state.selectedId) classes.push("active");

    const group = createSvgElement("g", {
      class: classes.join(" "),
      "data-id": unit.id,
      style: `--team:${colorOf(state, unit.player)}`,
      transform: `translate(${point.x} ${renderY})`
    });

    const shadow = createSvgElement("ellipse", {
      class: "shadow",
      cx: 0,
      cy: 18,
      rx: 25,
      ry: 8
    });

    const body = createSvgElement("g", { class: "body-group" });

    body.append(
      createSvgElement("ellipse", {
        class: "base-side",
        cx: 0,
        cy: 9,
        rx: 25,
        ry: 12
      }),
      createSvgElement("ellipse", {
        class: "base-top",
        cx: 0,
        cy: 2,
        rx: 25,
        ry: 12
      }),
      createSvgElement("ellipse", {
        class: "rim",
        cx: 0,
        cy: 2,
        rx: 20,
        ry: 9
      }),
      createSvgElement("circle", {
        class: "shield-ring",
        cx: 0,
        cy: -2,
        r: 31
      })
    );

    // Struck-coin emblem: the same silhouette is stacked three deep — a dark
    // copy nudged down-right (the shadow the relief casts), a light copy nudged
    // up-left (the lit bevel edge), and the gradient-filled face on top. The
    // thin sliver of each offset copy that the face doesn't cover is what reads
    // as an engraved metal bevel. All three colors are CSS-driven so the paths
    // stay pure geometry. See #pewter in index.html and .emblem in board.css.
    const emblem = createSvgElement("g", {
      class: "emblem",
      transform: "translate(0 -10) scale(.72)"
    });

    const face = createUnitIcon(unit.type);

    const bevelShadow = face.cloneNode(true);
    bevelShadow.setAttribute("class", "icon-shadow");
    bevelShadow.setAttribute("transform", "translate(1.4 1.9)");

    const bevelHighlight = face.cloneNode(true);
    bevelHighlight.setAttribute("class", "icon-highlight");
    bevelHighlight.setAttribute("transform", "translate(-1.2 -1.5)");

    emblem.append(bevelShadow, bevelHighlight, face);
    body.appendChild(emblem);

    body.append(
      createSvgElement("rect", {
        class: "hp-back",
        x: -25,
        y: 27,
        width: 50,
        height: 5,
        rx: 2.5
      }),
      createSvgElement("rect", {
        class: `hp-front ${hpClass(unit.hp, unit.maxHp)}`,
        x: -25,
        y: 27,
        width: 50 * unit.hp / unit.maxHp,
        height: 5,
        rx: 2.5
      })
    );

    const spentMark = createSvgElement("g", {
      class: "spent-mark",
      transform: "translate(18 -18)"
    });

    spentMark.append(
      createSvgElement("circle", {
        cx: 0,
        cy: 0,
        r: 8,
        fill: "rgba(0,0,0,.72)",
        stroke: "rgba(255,255,255,.5)"
      }),
      createSvgElement("path", {
        d: "M -4 0 L -1 3 L 5 -4",
        fill: "none",
        stroke: "#fff",
        "stroke-width": 2
      })
    );

    body.appendChild(spentMark);

    // Defend badge: a clear shield emblem in the top-left corner whenever a unit
    // is braced. Reads at a glance alongside the orbiting shield-ring (CSS shows
    // it only on .defending). Mirrors the spent-mark's corner-badge construction.
    const defendMark = createSvgElement("g", {
      class: "defend-mark",
      transform: "translate(-18 -18)"
    });

    defendMark.append(
      createSvgElement("circle", {
        cx: 0,
        cy: 0,
        r: 9,
        fill: "rgba(20,16,8,.82)",
        stroke: "var(--gold)",
        "stroke-width": 1.4
      }),
      createSvgElement("path", {
        class: "defend-shield",
        d: "M 0 -6 L 5 -3.5 L 5 1 Q 5 5 0 7 Q -5 5 -5 1 L -5 -3.5 Z"
      })
    );

    body.appendChild(defendMark);
    group.append(shadow, body);

    group.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onUnitClick(unit.id);
    });

    return group;
  }
}

function createUnitIcon(type) {
  const group = createSvgElement("g", { class: "icon" });

  switch (type) {
    case "warrior":
      // Broadsword: chunkier blade with a defined fuller-tip and a wide,
      // squared crossguard so it reads as a weapon, not a plus sign.
      group.append(
        createSvgElement("path", {
          d: "M -4 -16 L 4 -16 L 4 7 L 12 7 L 12 12 L 4 12 L 4 20 L -4 20 L -4 12 L -12 12 L -12 7 L -4 7 Z"
        }),
        createSvgElement("path", {
          d: "M -6 -17 L 0 -27 L 6 -17 Z"
        })
      );
      break;

    case "tank":
      // Tower shield with a raised central boss — the boss is a separate disc
      // so the bevel layers give it its own ring of relief.
      group.append(
        createSvgElement("path", {
          d: "M 0 -25 L 18 -14 L 14 9 Q 11 22 0 28 Q -11 22 -14 9 L -18 -14 Z"
        }),
        createSvgElement("circle", {
          class: "emblem-boss",
          cx: 0,
          cy: -1,
          r: 6
        })
      );
      break;

    case "ranger":
      // Recurve bow drawn, arrow nocked. Bowstring + shaft inherit the emblem
      // treatment (no inline color) so the bevel clones recolor them cleanly.
      group.append(
        createSvgElement("path", {
          d: "M -17 15 Q 1 -1 -17 -18 L -12 -21 Q 11 -1 -12 19 Z"
        }),
        createSvgElement("line", {
          class: "emblem-line",
          x1: -15,
          y1: -19,
          x2: -15,
          y2: 17,
          "stroke-width": 2
        }),
        createSvgElement("line", {
          class: "emblem-line",
          x1: -13,
          y1: -2,
          x2: 18,
          y2: -2,
          "stroke-width": 3
        }),
        createSvgElement("path", {
          d: "M 18 -2 L 9 -7 L 9 3 Z"
        })
      );
      break;

    case "medic":
      group.append(
        createSvgElement("rect", {
          x: -6,
          y: -23,
          width: 12,
          height: 46,
          rx: 2
        }),
        createSvgElement("rect", {
          x: -23,
          y: -6,
          width: 46,
          height: 12,
          rx: 2
        })
      );
      break;

    default:
      throw new Error(`Unknown unit icon type: ${type}`);
  }

  return group;
}
