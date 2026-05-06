const PHOTO_REACTION_IDS = ["like", "love", "laugh", "wow", "fire", "sad", "angry", "poop"];
const PHOTO_REACTION_GLYPHS = {
  like: "&#128077;",
  love: "&#10084;&#65039;",
  laugh: "&#128514;",
  wow: "&#128558;",
  fire: "&#128293;",
  sad: "&#128546;",
  angry: "&#128545;",
  poop: "&#128169;",
};

export function escapeViewerHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatViewerDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function buildReactionPickerHtml() {
  return PHOTO_REACTION_IDS.map((id) =>
    `<button class="photo-viewer__reaction-option" type="button" data-reaction-id="${id}" title="${id}">${PHOTO_REACTION_GLYPHS[id]}</button>`
  ).join("");
}

export function buildReactionChipsHtml(state = {}) {
  const totals = state?.reactionTotals || {};
  const viewerReaction = state?.viewerReaction || "";
  const activeIds = PHOTO_REACTION_IDS.filter((id) => (totals[id] > 0) || id === viewerReaction);

  return activeIds.map((id) =>
    `<button
      class="photo-viewer__reaction-chip${id === viewerReaction ? " photo-viewer__reaction-chip--selected" : ""}"
      type="button" data-reaction-id="${id}" title="${id}"
    >${PHOTO_REACTION_GLYPHS[id]} <span>${totals[id] || 0}</span></button>`
  ).join("");
}

export function buildCommentListHtml(comments) {
  if (!comments) {
    return `<p class="photo-viewer__comments-loading">Loading comments...</p>`;
  }

  if (comments.length === 0) {
    return `<p class="photo-viewer__comments-empty">No comments yet.</p>`;
  }

  return comments.map((comment) =>
    `<div class="photo-viewer__comment">
      <span class="photo-viewer__comment-author">${escapeViewerHtml(comment.authorDisplayName)}</span>
      <span class="photo-viewer__comment-text">${escapeViewerHtml(comment.text)}</span>
      <span class="photo-viewer__comment-time">${formatViewerDate(comment.createdAt)}</span>
    </div>`
  ).join("");
}
