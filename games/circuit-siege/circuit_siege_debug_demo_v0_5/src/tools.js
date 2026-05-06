const MASKS = ["EW", "NS", "NE", "ES", "SW", "NW"];
const LABELS = {
  EW: "Straight H",
  NS: "Straight V",
  NE: "Corner NE",
  ES: "Corner ES",
  SW: "Corner SW",
  NW: "Corner NW"
};

function maskPath(mask) {
  const center = [22, 15];
  const points = {
    N: [22, 3],
    E: [40, 15],
    S: [22, 27],
    W: [4, 15]
  };

  return [...mask]
    .map((direction) => `M ${center[0]} ${center[1]} L ${points[direction][0]} ${points[direction][1]}`)
    .join(" ");
}

export class ToolPanel {
  constructor({ root, onSelect }) {
    this.root = root;
    this.onSelect = onSelect;
    this.selected = "EW";
  }

  render() {
    this.root.innerHTML = "";

    for (const mask of MASKS) {
      const button = document.createElement("button");
      button.className = `tool-button ${mask === this.selected ? "selected" : ""}`;
      button.draggable = true;
      button.dataset.mask = mask;
      button.innerHTML = `
        <svg viewBox="0 0 44 30" aria-hidden="true">
          <path d="${maskPath(mask)}" fill="none" stroke="#e5e7eb" stroke-width="5" stroke-linecap="round"></path>
        </svg>
        <strong>${LABELS[mask]}</strong>
        <small>${mask}</small>
      `;

      button.addEventListener("click", () => {
        this.selected = mask;
        this.onSelect(mask);
        this.render();
      });

      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", mask);
      });

      this.root.appendChild(button);
    }
  }
}
