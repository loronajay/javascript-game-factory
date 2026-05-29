export interface CommentLike {
  authorDisplayName?: string;
  createdAt?: string;
  text?: string;
  [key: string]: unknown;
}

export interface SharePanelState {
  cardId: string;
  thoughtId: string;
  mode: string;
  caption: string;
}

export interface CommentPanelState {
  cardId: string;
  thoughtId: string;
  text: string;
  comments: CommentLike[];
}

export interface SocialViewState {
  openReactionThoughtId: string;
  sharePanelState: SharePanelState;
  commentPanelState: CommentPanelState;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeCssUrl(value: unknown): string {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function formatCommentDate(value: unknown): string {
  const timestamp = Date.parse((value || "") as string);
  if (!timestamp) return "Signal pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
