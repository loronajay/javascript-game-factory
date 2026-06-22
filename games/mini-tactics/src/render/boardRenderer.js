import { createSvgElement } from "./svg.js";
import { gridToScreen } from "../geometry/isometric.js";

export class BoardRenderer {
  constructor({ boardLayer, metrics, onTileClick }) {
    this.boardLayer = boardLayer;
    this.metrics = metrics;
    this.onTileClick = onTileClick;
  }

  setMetrics(metrics) {
    this.metrics = metrics;
  }

  render(size) {
    this.boardLayer.replaceChildren();

    const {
      tileWidth,
      tileHeight,
      depth
    } = this.metrics;

    for (let sum = 0; sum <= (size - 1) * 2; sum += 1) {
      for (let x = 0; x < size; x += 1) {
        const y = sum - x;

        if (y < 0 || y >= size) {
          continue;
        }

        const point = gridToScreen(this.metrics, x, y);
        const group = createSvgElement("g", {
          class: "tile",
          "data-x": x,
          "data-y": y
        });

        const topPoints = [
          [point.x, point.y],
          [point.x + tileWidth / 2, point.y + tileHeight / 2],
          [point.x, point.y + tileHeight],
          [point.x - tileWidth / 2, point.y + tileHeight / 2]
        ];

        const rightSide = [
          [point.x + tileWidth / 2, point.y + tileHeight / 2],
          [point.x, point.y + tileHeight],
          [point.x, point.y + tileHeight + depth],
          [point.x + tileWidth / 2, point.y + tileHeight / 2 + depth]
        ];

        const leftSide = [
          [point.x - tileWidth / 2, point.y + tileHeight / 2],
          [point.x, point.y + tileHeight],
          [point.x, point.y + tileHeight + depth],
          [point.x - tileWidth / 2, point.y + tileHeight / 2 + depth]
        ];

        group.append(
          createSvgElement("polygon", {
            points: toPointString(leftSide),
            class: "tile-side-a"
          }),
          createSvgElement("polygon", {
            points: toPointString(rightSide),
            class: "tile-side-b"
          }),
          createSvgElement("polygon", {
            points: toPointString(topPoints),
            class: `tile-face ${(x + y) % 2 === 0 ? "tile-light" : "tile-dark"}`
          })
        );

        group.addEventListener("click", () => this.onTileClick(x, y));
        this.boardLayer.appendChild(group);
      }
    }
  }
}

function toPointString(points) {
  return points.map((point) => point.join(",")).join(" ");
}
