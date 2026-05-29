import { getPlatformStorageKey } from "../storage/storage.mjs";

export const THOUGHT_FEED_STORAGE_KEY = getPlatformStorageKey("thoughtFeed");
export const THOUGHT_COMMENT_STORAGE_KEY = getPlatformStorageKey("thoughtComments");

export const THOUGHT_REACTION_IDS = Object.freeze([
  "like",
  "love",
  "laugh",
  "wow",
  "fire",
  "sad",
  "angry",
  "poop",
] as const);

export type ThoughtReactionId = (typeof THOUGHT_REACTION_IDS)[number];

export const THOUGHT_REACTION_ID_SET: ReadonlySet<ThoughtReactionId> = new Set(THOUGHT_REACTION_IDS);

export const THOUGHT_REACTION_LABELS: Readonly<Record<ThoughtReactionId, string>> = Object.freeze({
  like: "Like",
  love: "Love",
  laugh: "Laugh",
  wow: "Wow",
  fire: "Fire",
  sad: "Sad",
  angry: "Angry",
  poop: "Poop",
});

export const THOUGHT_REACTION_GLYPHS: Readonly<Record<ThoughtReactionId, string>> = Object.freeze({
  like: "👍",
  love: "❤️",
  laugh: "😂",
  wow: "😮",
  fire: "🔥",
  sad: "😢",
  angry: "😡",
  poop: "💩",
});

export const THOUGHT_VISIBILITY_VALUES = ["public", "friends", "private"] as const;
export type ThoughtVisibility = (typeof THOUGHT_VISIBILITY_VALUES)[number];
export const THOUGHT_VISIBILITIES: ReadonlySet<ThoughtVisibility> = new Set(THOUGHT_VISIBILITY_VALUES);

export interface Thought {
  id: string;
  authorPlayerId: string;
  authorDisplayName: string;
  subject: string;
  text: string;
  visibility: ThoughtVisibility;
  commentCount: number;
  shareCount: number;
  reactionTotals: Partial<Record<ThoughtReactionId, number>>;
  repostOfId: string;
  createdAt: string;
  editedAt: string;
}

export interface ThoughtComment {
  id: string;
  thoughtId: string;
  authorPlayerId: string;
  authorDisplayName: string;
  text: string;
  createdAt: string;
  editedAt: string;
}

export const DEFAULT_THOUGHTS: readonly Thought[] = Object.freeze([
  {
    id: "thought-1",
    authorPlayerId: "player-jay",
    authorDisplayName: "Jay",
    subject: "Late Night Ladder",
    text: "Thinking about putting together a late-night ladder block once a few more cabinets are online.",
    visibility: "public",
    commentCount: 4,
    shareCount: 2,
    reactionTotals: {
      like: 9,
      fire: 2,
    },
    repostOfId: "",
    createdAt: "2026-04-21T08:30:00Z",
    editedAt: "",
  },
  {
    id: "thought-2",
    authorPlayerId: "player-maya",
    authorDisplayName: "Maya",
    subject: "",
    text: "Need one more clean goblin pass before I call this run settled.",
    visibility: "public",
    commentCount: 3,
    shareCount: 1,
    reactionTotals: {
      like: 4,
      wow: 1,
    },
    repostOfId: "",
    createdAt: "2026-04-21T12:00:00Z",
    editedAt: "",
  },
  {
    id: "thought-3",
    authorPlayerId: "player-ops",
    authorDisplayName: "Ops",
    subject: "Internal Draft",
    text: "This should stay off the public feed.",
    visibility: "friends",
    commentCount: 0,
    shareCount: 0,
    reactionTotals: {},
    repostOfId: "",
    createdAt: "2026-04-22T09:00:00Z",
    editedAt: "",
  },
]);

export const DEFAULT_THOUGHT_COMMENTS: readonly ThoughtComment[] = Object.freeze([
  {
    id: "comment-thought-1-1",
    thoughtId: "thought-1",
    authorPlayerId: "player-maya",
    authorDisplayName: "Maya",
    text: "If you lock this in, I can be there after 10.",
    createdAt: "2026-04-21T09:10:00Z",
    editedAt: "",
  },
  {
    id: "comment-thought-1-2",
    thoughtId: "thought-1",
    authorPlayerId: "player-jay",
    authorDisplayName: "Jay",
    text: "Late-night ladder block sounds perfect.",
    createdAt: "2026-04-21T09:18:00Z",
    editedAt: "",
  },
  {
    id: "comment-thought-2-1",
    thoughtId: "thought-2",
    authorPlayerId: "player-ops",
    authorDisplayName: "Ops",
    text: "That goblin pass is almost there. Keep it steady.",
    createdAt: "2026-04-21T12:18:00Z",
    editedAt: "",
  },
]);
