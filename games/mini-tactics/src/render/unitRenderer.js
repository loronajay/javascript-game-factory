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

    const iconWrapper = createSvgElement("g", {
      transform: "translate(0 -10) scale(.72)"
    });
    iconWrapper.appendChild(createUnitIcon(unit.type));
    body.appendChild(iconWrapper);

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
      group.append(
        createSvgElement("path", {
          d: "M -3 -18 L 3 -18 L 3 8 L 10 8 L 10 12 L 3 12 L 3 19 L -3 19 L -3 12 L -10 12 L -10 8 L -3 8 Z"
        }),
        createSvgElement("path", {
          d: "M -5 -19 L 0 -26 L 5 -19 Z"
        })
      );
      break;

    case "tank":
      group.append(
        createSvgElement("path", {
          d: "M 0 -24 L 17 -14 L 13 9 Q 10 21 0 27 Q -10 21 -13 9 L -17 -14 Z"
        })
      );
      break;

    case "ranger":
      group.append(
        createSvgElement("path", {
          d: "M -17 14 Q 0 -1 -17 -17 L -13 -20 Q 9 -1 -13 18 Z"
        }),
        createSvgElement("line", {
          x1: -15,
          y1: -18,
          x2: -15,
          y2: 16,
          stroke: "#f7f9fc",
          "stroke-width": 2.5
        }),
        createSvgElement("line", {
          x1: -13,
          y1: -2,
          x2: 17,
          y2: -2,
          stroke: "#f7f9fc",
          "stroke-width": 3
        }),
        createSvgElement("path", {
          d: "M 17 -2 L 9 -7 L 9 3 Z"
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
