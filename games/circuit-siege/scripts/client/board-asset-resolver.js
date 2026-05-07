const STRAIGHT_MASKS = new Set(["EW", "NS"]);
const MASK_NORMALIZATION = {
  EW: "EW",
  WE: "EW",
  NS: "NS",
  SN: "NS",
  NE: "NE",
  EN: "NE",
  ES: "ES",
  SE: "ES",
  SW: "SW",
  WS: "SW",
  NW: "NW",
  WN: "NW"
};
const CORNER_ROTATIONS = {
  NE: 0,
  ES: 90,
  SW: 180,
  NW: 270
};

function getDirection(from, to) {
  const dx = Number(to?.[0]) - Number(from?.[0]);
  const dy = Number(to?.[1]) - Number(from?.[1]);

  if (dx === 1 && dy === 0) return "E";
  if (dx === -1 && dy === 0) return "W";
  if (dx === 0 && dy === 1) return "S";
  if (dx === 0 && dy === -1) return "N";
  return null;
}

export function getMaskFromNeighbors(previousCell, currentCell, nextCell) {
  const directions = [getDirection(currentCell, previousCell), getDirection(currentCell, nextCell)]
    .filter(Boolean)
    .join("");

  return MASK_NORMALIZATION[directions] || null;
}

export function getWireTileDescriptor({
  owner,
  mask,
  completed = false,
  terminalType = "damage"
} = {}) {
  if (owner !== "blue" && owner !== "red") {
    return null;
  }

  const normalizedMask = MASK_NORMALIZATION[String(mask || "").toUpperCase()] || null;
  if (!normalizedMask) {
    return null;
  }

  if (STRAIGHT_MASKS.has(normalizedMask)) {
    const suffix = completed ? `-${terminalType}-complete` : "";
    return {
      href: `images/tiles/${owner}-straight${suffix || "-tile"}.svg`,
      rotation: normalizedMask === "NS" ? 90 : 0
    };
  }

  if (Object.hasOwn(CORNER_ROTATIONS, normalizedMask)) {
    const suffix = completed ? `-${terminalType}-complete` : "";
    return {
      href: `images/tiles/${owner}-corner${suffix || "-tile"}.svg`,
      rotation: CORNER_ROTATIONS[normalizedMask]
    };
  }

  return null;
}

export function getTerminalAssetHref({
  owner,
  terminalType,
  completed = false
} = {}) {
  if ((owner !== "blue" && owner !== "red") || (terminalType !== "damage" && terminalType !== "dud")) {
    return null;
  }

  return `images/terminals/${owner}-${terminalType}-terminal${completed ? "-complete" : ""}.svg`;
}
