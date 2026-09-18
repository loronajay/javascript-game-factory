// Achievements page renderer: model → HTML string. Pure (string building
// only), so the tree markup is testable under node.

import type { AchievementNode, AchievementGameModel, AchievementsPageModel } from "./view-model.mjs";
import { achievementGlyph, formatUnlockDate } from "./view-model.mjs";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCard(node: AchievementNode): string {
  const a = node.achievement;
  const locked = !a.unlocked;
  const masked = a.secret && locked;
  const classes = [
    "ach-card",
    locked ? "ach-card--locked" : "ach-card--unlocked",
    masked ? "ach-card--secret" : "",
    `ach-card--${escapeHtml(a.category)}`,
  ].filter(Boolean).join(" ");
  const status = a.unlocked
    ? `Unlocked ${escapeHtml(formatUnlockDate(a.unlockedAt))}`.trim()
    : masked ? "Hidden until earned" : "Locked";
  const icon = a.icon && !masked
    ? `<img class="ach-card__icon" src="${escapeHtml(a.icon)}" alt="">`
    : `<span class="ach-card__glyph" aria-hidden="true">${escapeHtml(achievementGlyph(a))}</span>`;
  const points = a.points > 0 ? `<span class="ach-card__points">${a.points} pts</span>` : "";
  return `
    <article class="${classes}" data-achievement-id="${escapeHtml(a.id)}" data-depth="${node.depth}">
      <div class="ach-card__art">${icon}</div>
      <div class="ach-card__body">
        <h4 class="ach-card__name">${escapeHtml(a.name)}</h4>
        <p class="ach-card__desc">${escapeHtml(a.description)}</p>
        <p class="ach-card__meta"><span class="ach-card__status">${status}</span>${points}</p>
      </div>
    </article>`;
}

function renderBranch(node: AchievementNode): string {
  // A node followed by its children. A node with several children fans out
  // into a row of columns; a single child continues the same column.
  const children = node.children;
  if (children.length === 0) return renderCard(node);
  if (children.length === 1) return `${renderCard(node)}${renderBranch(children[0]!)}`;
  return `${renderCard(node)}
    <div class="ach-tree__fan">
      ${children.map((child) => `<div class="ach-tree__column">${renderBranch(child)}</div>`).join("")}
    </div>`;
}

export function renderGameSection(game: AchievementGameModel): string {
  const branches = game.roots.map((root) => `<div class="ach-tree__column ach-tree__column--root">${renderBranch(root)}</div>`).join("");
  const capstones = game.capstones.map((node) => `<div class="ach-tree__capstone">${renderBranch(node)}</div>`).join("");
  return `
    <section class="ach-game" data-game-slug="${escapeHtml(game.gameSlug)}">
      <header class="ach-game__header">
        <div class="ach-game__title-row">
          <h2 class="ach-game__title">${escapeHtml(game.title)}</h2>
          <span class="ach-game__count">${game.unlocked} / ${game.total}</span>
        </div>
        <div class="ach-game__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${game.total}" aria-valuenow="${game.unlocked}" aria-label="${escapeHtml(game.title)} achievements">
          <span class="ach-game__bar-fill" style="width:${game.percent}%"></span>
        </div>
        <p class="ach-game__points">${game.points} / ${game.pointsTotal} points</p>
      </header>
      <div class="ach-tree">
        <div class="ach-tree__roots">${branches}</div>
        ${capstones ? `<div class="ach-tree__capstones">${capstones}</div>` : ""}
      </div>
    </section>`;
}

export function renderAchievementsPage(model: AchievementsPageModel): string {
  if (model.state !== "ready") {
    return `<p class="ach-page__flash">${escapeHtml(model.subheading)}</p>`;
  }
  return model.games.map(renderGameSection).join("");
}
