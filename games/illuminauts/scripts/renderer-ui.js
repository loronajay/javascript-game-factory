import { COLORS } from './config.js';

export const UI = {
  cyan: '#67f5f2', cyanDim: '#277c83', amber: '#ffd45f', amberDim: '#8b6924',
  red: '#ff596d', green: '#74f6a7', ink: '#03090e', panel: 'rgba(5, 17, 23, 0.94)',
  panelSoft: 'rgba(6, 22, 29, 0.78)', text: '#d9f7f5', textDim: '#779b9f',
  line: 'rgba(103, 245, 242, 0.24)',
};

function panelPath(ctx, x, y, w, h, cut = 10) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
}

export function drawDarkBg(ctx, width, height, glowColor = 'rgba(103, 245, 242, 0.08)') {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.44, 0, width * 0.5, height * 0.44, Math.max(width, height) * 0.56);
  glow.addColorStop(0, glowColor); glow.addColorStop(0.55, 'rgba(3, 20, 27, 0.18)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.strokeStyle = 'rgba(103, 245, 242, 0.035)'; ctx.lineWidth = 1;
  const grid = Math.max(42, Math.floor(Math.min(width, height) * 0.085));
  for (let x = width / 2 % grid; x < width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = height / 2 % grid; y < height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.restore();
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}

export function drawScreenFrame(ctx, width, height, section = 'EXPEDITION CONTROL', accent = UI.cyan) {
  const inset = Math.max(14, Math.floor(Math.min(width, height) * 0.026));
  const corner = Math.max(16, Math.floor(inset * 1.2));
  ctx.save(); ctx.strokeStyle = 'rgba(103, 245, 242, 0.19)'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(inset + corner, inset); ctx.lineTo(inset, inset); ctx.lineTo(inset, inset + corner);
  ctx.moveTo(width - inset - corner, inset); ctx.lineTo(width - inset, inset); ctx.lineTo(width - inset, inset + corner);
  ctx.moveTo(inset, height - inset - corner); ctx.lineTo(inset, height - inset); ctx.lineTo(inset + corner, height - inset);
  ctx.moveTo(width - inset - corner, height - inset); ctx.lineTo(width - inset, height - inset); ctx.lineTo(width - inset, height - inset - corner); ctx.stroke();
  ctx.fillStyle = accent; ctx.fillRect(inset, inset - 1, Math.max(36, width * 0.045), 2);
  ctx.fillStyle = UI.textDim; ctx.font = `700 ${Math.max(8, Math.floor(Math.min(width, height) * 0.014))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(section, inset + Math.max(44, width * 0.052), inset - 4);
  ctx.textAlign = 'right'; ctx.fillText('SYS // ILM-09', width - inset, inset - 4); ctx.restore();
}

export function drawSectionHeading(ctx, eyebrow, title, subtitle, x, y, align = 'center', accent = UI.cyan, maxWidth = undefined) {
  const scale = Math.max(0.75, Math.min(ctx.canvas?.width || 1280, ctx.canvas?.height || 720) / 720);
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = accent;
  ctx.font = `800 ${Math.floor(10 * scale)}px ui-monospace, Consolas, monospace`; ctx.fillText(eyebrow.toUpperCase(), x, y, maxWidth);
  ctx.fillStyle = UI.text; ctx.font = `900 ${Math.floor(32 * scale)}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(title.toUpperCase(), x, y + 38 * scale, maxWidth);
  ctx.fillStyle = UI.textDim; ctx.font = `500 ${Math.floor(12 * scale)}px ui-monospace, Consolas, monospace`;
  ctx.fillText(subtitle, x, y + 60 * scale, maxWidth);
}

export function drawButton(ctx, label, x, y, w, h, registerButton, id, isHovered = false, options = {}) {
  const accent = options.accent || UI.cyan; const kicker = options.kicker || '';
  ctx.save(); if (isHovered) { ctx.shadowColor = accent; ctx.shadowBlur = 16; }
  panelPath(ctx, x, y, w, h, Math.max(7, Math.floor(h * 0.2)));
  ctx.fillStyle = isHovered ? 'rgba(16, 54, 61, 0.96)' : UI.panel; ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = isHovered ? accent : 'rgba(103, 245, 242, 0.32)'; ctx.lineWidth = isHovered ? 2 : 1; ctx.stroke();
  ctx.fillStyle = accent; ctx.fillRect(x, y, isHovered ? Math.max(5, w * 0.018) : 2, h);
  ctx.fillRect(x + w - Math.max(22, w * 0.08), y + h - 2, Math.max(22, w * 0.08), 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (kicker) { ctx.fillStyle = isHovered ? accent : UI.textDim; ctx.font = `700 ${Math.max(7, Math.floor(h * 0.16))}px ui-monospace, Consolas, monospace`; ctx.fillText(kicker.toUpperCase(), x + h * 0.42, y + h * 0.3); }
  ctx.fillStyle = isHovered ? '#fff' : UI.text; ctx.font = `800 ${Math.floor(h * (kicker ? 0.3 : 0.34))}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(label.toUpperCase(), x + h * 0.42, y + h * (kicker ? 0.64 : 0.52));
  ctx.textAlign = 'right'; ctx.fillStyle = isHovered ? accent : UI.cyanDim; ctx.font = `700 ${Math.max(9, Math.floor(h * 0.22))}px ui-monospace, Consolas, monospace`;
  ctx.fillText(isHovered ? 'EXECUTE  ›' : '›', x + w - h * 0.32, y + h / 2); ctx.restore();
  if (registerButton) registerButton(id, x, y, w, h);
}

export function drawRoleCard(ctx, x, y, w, h, title, subtitle, detail, accentColor, isHovered) {
  const isAlpha = title === 'ALPHA';
  ctx.save(); if (isHovered) { ctx.shadowColor = accentColor; ctx.shadowBlur = 24; }
  panelPath(ctx, x, y, w, h, Math.max(12, Math.floor(w * 0.07)));
  ctx.fillStyle = isHovered ? 'rgba(12, 39, 45, 0.97)' : 'rgba(3, 13, 18, 0.94)'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = isHovered ? accentColor : 'rgba(160, 210, 215, 0.25)'; ctx.lineWidth = isHovered ? 2 : 1; ctx.stroke();
  ctx.fillStyle = accentColor; ctx.fillRect(x, y, w, 3); ctx.globalAlpha = 0.08;
  ctx.font = `900 ${Math.floor(h * 0.56)}px "Arial Narrow", system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(isAlpha ? 'A' : 'B', x + w * 0.9, y + h * 0.45); ctx.globalAlpha = 1; ctx.textAlign = 'left';
  ctx.fillStyle = accentColor; ctx.font = `800 ${Math.max(9, Math.floor(h * 0.055))}px ui-monospace, Consolas, monospace`; ctx.fillText(`SUIT // ${isAlpha ? 'A-01' : 'B-02'}`, x + w * 0.09, y + h * 0.14);
  ctx.fillStyle = UI.text; ctx.font = `900 ${Math.floor(h * 0.14)}px "Arial Narrow", system-ui, sans-serif`; ctx.fillText(title, x + w * 0.09, y + h * 0.34);
  ctx.fillStyle = UI.textDim; ctx.font = `600 ${Math.floor(h * 0.055)}px ui-monospace, Consolas, monospace`; ctx.fillText(detail.toUpperCase(), x + w * 0.09, y + h * 0.46);
  ctx.strokeStyle = 'rgba(160, 210, 215, 0.18)'; ctx.beginPath(); ctx.moveTo(x + w * 0.09, y + h * 0.57); ctx.lineTo(x + w * 0.91, y + h * 0.57); ctx.stroke();
  ctx.fillStyle = UI.textDim; ctx.font = `600 ${Math.floor(h * 0.045)}px ui-monospace, Consolas, monospace`; ctx.fillText('ENTRY VECTOR', x + w * 0.09, y + h * 0.67);
  ctx.fillStyle = accentColor; ctx.textAlign = 'right'; ctx.fillText(isAlpha ? 'WEST / CYAN' : 'EAST / AMBER', x + w * 0.91, y + h * 0.67);
  ctx.textAlign = 'left'; ctx.fillStyle = isHovered ? '#fff' : UI.textDim; ctx.font = `800 ${Math.floor(h * 0.055)}px ui-monospace, Consolas, monospace`;
  ctx.fillText(isHovered ? 'CONFIRM DEPLOYMENT  ›' : 'SELECT SUIT  ›', x + w * 0.09, y + h * 0.87); ctx.restore();
}

export function getMapCardGridLayout(width, count) {
  const columns = width < 560 ? 2 : width < 1000 ? 3 : Math.min(6, Math.max(1, count));
  const rows = Math.ceil(count / columns); const sidePad = width < 560 ? 18 : Math.max(24, Math.floor(width * 0.04));
  const cardGap = width < 560 ? 8 : Math.max(10, Math.floor(width * 0.012));
  const cardW = Math.floor((width - sidePad * 2 - cardGap * (columns - 1)) / columns);
  const total = columns * cardW + Math.max(0, columns - 1) * cardGap;
  return { columns, rows, cardW, cardGap, cardStartX: (width - total) / 2 };
}

export function getMapCardRowLayout(width, count) {
  const grid = getMapCardGridLayout(width, count);
  return { cardW: grid.cardW, cardGap: grid.cardGap, cardStartX: grid.cardStartX };
}
