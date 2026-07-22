const AVATAR_GRID_SIZE = 8;
const AVATAR_COUNT_PER_SHEET = AVATAR_GRID_SIZE * AVATAR_GRID_SIZE;

const AVATAR_SHEETS = Object.freeze([
  sheet("sheet-1", "assets/avatars/avatar-sheet-1.webp", { nudgeX: "0.12%", nudgeY: "-1.9%" }),
  sheet("sheet-2", "assets/avatars/avatar-sheet-2.webp", { nudgeX: "0.79%", nudgeY: "-1.9%" }),
]);

function sheet(id, src, { nudgeX = "0%", nudgeY = "0%" } = {}) {
  return Object.freeze({ id, src, nudgeX, nudgeY });
}

function avatarId(index) {
  return `avatar-${String(index + 1).padStart(3, "0")}`;
}

export const RANKED_AVATARS = Object.freeze(
  AVATAR_SHEETS.flatMap((sheetMeta, sheetIndex) =>
    Array.from({ length: AVATAR_COUNT_PER_SHEET }, (_, index) => {
      const absoluteIndex = sheetIndex * AVATAR_COUNT_PER_SHEET + index;
      const row = Math.floor(index / AVATAR_GRID_SIZE);
      const col = index % AVATAR_GRID_SIZE;
      return Object.freeze({
        id: avatarId(absoluteIndex),
        label: `Avatar ${String(absoluteIndex + 1).padStart(3, "0")}`,
        sheet: sheetMeta.id,
        src: sheetMeta.src,
        row,
        col,
        nudgeX: sheetMeta.nudgeX,
        nudgeY: sheetMeta.nudgeY,
      });
    }),
  ),
);

const AVATAR_BY_ID = new Map(RANKED_AVATARS.map((avatar) => [avatar.id, avatar]));

export function getRankedAvatar(id) {
  return AVATAR_BY_ID.get(String(id || "")) || null;
}

export function hasRankedAvatar(id) {
  return getRankedAvatar(id) !== null;
}

export function rankedAvatarSpriteStyle(avatar) {
  if (!avatar) return null;
  const maxPosition = AVATAR_GRID_SIZE - 1;
  const x = maxPosition > 0 ? (avatar.col / maxPosition) * 100 : 0;
  const y = maxPosition > 0 ? (avatar.row / maxPosition) * 100 : 0;
  return {
    backgroundImage: `url("${avatar.src}")`,
    backgroundSize: `${AVATAR_GRID_SIZE * 100}% ${AVATAR_GRID_SIZE * 100}%`,
    backgroundPosition: `${round(x)}% ${round(y)}%`,
    nudgeX: avatar.nudgeX,
    nudgeY: avatar.nudgeY,
  };
}

export function createRankedAvatarIcon(id, { className = "" } = {}) {
  const avatar = getRankedAvatar(id);
  const wrap = document.createElement("span");
  wrap.className = `ranked-avatar-icon${className ? ` ${className}` : ""}`;
  if (!avatar) {
    wrap.classList.add("is-avatar-missing");
    return wrap;
  }
  wrap.dataset.avatar = avatar.id;
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", avatar.label);
  wrap.title = avatar.label;

  const sprite = document.createElement("span");
  sprite.className = "ranked-avatar-icon-sprite";
  const style = rankedAvatarSpriteStyle(avatar);
  sprite.style.backgroundImage = style.backgroundImage;
  sprite.style.backgroundSize = style.backgroundSize;
  sprite.style.backgroundPosition = style.backgroundPosition;
  setStyle(sprite, "--avatar-nudge-x", style.nudgeX);
  setStyle(sprite, "--avatar-nudge-y", style.nudgeY);
  wrap.appendChild(sprite);
  return wrap;
}

export function rankedAvatarHtml(id, className = "") {
  const avatar = getRankedAvatar(id);
  if (!avatar) return "";
  const style = rankedAvatarSpriteStyle(avatar);
  const classes = `ranked-avatar-icon${className ? ` ${className}` : ""}`;
  return `<span class="${escapeAttr(classes)}" data-avatar="${escapeAttr(avatar.id)}" role="img" aria-label="${escapeAttr(avatar.label)}" title="${escapeAttr(avatar.label)}"><span class="ranked-avatar-icon-sprite" style="background-image:${escapeAttr(style.backgroundImage)};background-size:${escapeAttr(style.backgroundSize)};background-position:${escapeAttr(style.backgroundPosition)};--avatar-nudge-x:${escapeAttr(style.nudgeX)};--avatar-nudge-y:${escapeAttr(style.nudgeY)}"></span></span>`;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function setStyle(node, property, value) {
  if (typeof node.style?.setProperty === "function") {
    node.style.setProperty(property, value);
  } else if (node.style) {
    node.style[property] = value;
  }
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
