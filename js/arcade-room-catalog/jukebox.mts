// What the jukebox plays: every cabinet's own soundtrack, gathered in one place.
//
// Pure data, same rule as `decor.mts`. A track is a game and a file; the file is a
// path from the SITE ROOT (`games/<slug>/...`) so the room page and the jukebox's
// own page, which live at different depths, each resolve it against their own base
// rather than the catalog guessing where it is being read from. The test suite
// checks every file exists on disk, so a renamed soundtrack fails CI instead of a
// silent record on the wall.
//
// The catalog is the ONLY thing to edit when a cabinet ships a new song: add a row
// under its game and the jukebox page, the room player and the next/previous
// order all pick it up.
//
// The two sides of the jukebox — the page the player picks a record on and the
// room that actually plays it — talk over `postMessage`, and the message shapes
// live here so neither side invents its own.

export type JukeboxTrack = Readonly<{
  /** `<game-slug>.<track-slug>`, stable across renames of the file. */
  id: string;
  gameSlug: string;
  gameTitle: string;
  title: string;
  /** Path from the site root. */
  file: string;
}>;

type GameInput = Readonly<{ slug: string; title: string; root: string; tracks: readonly (readonly [string, string, string])[] }>;

function game(input: GameInput): JukeboxTrack[] {
  return input.tracks.map(([slug, title, file]) => Object.freeze({
    id: `${input.slug}.${slug}`,
    gameSlug: input.slug,
    gameTitle: input.title,
    title,
    file: `${input.root}/${file}`,
  }));
}

/** Grid order, so the jukebox reads like the grid does. */
export const JUKEBOX_TRACKS: readonly JukeboxTrack[] = Object.freeze([
  ...game({ slug: "tactical-arena", title: "Tactical Arena", root: "games/tactical-arena/sounds", tracks: [
    ["menu", "War Room", "menu.mp3"],
    ["mission-battle", "Campaign Battle", "mission-battle.mp3"],
    ["vs-battle", "Versus Battle", "vs-battle.mp3"],
    ["has-beens", "The Has-Beens", "fatty-battle.mp3"],
    ["not-my-king", "Not My King", "king-battle.mp3"],
    ["void-ridden-castle", "Void-Ridden Castle", "summoner-battle.mp3"],
    ["final-battle", "The Final Battle", "final-battle.mp3"],
  ] }),
  ...game({ slug: "lovers-lost", title: "Lovers Lost", root: "games/lovers-lost/sounds", tracks: [
    ["menu", "Before the Run", "bg-music-menu.mp3"],
    ["game", "The Long Road", "bg-music-game.mp3"],
  ] }),
  ...game({ slug: "battleshits", title: "Battleshits", root: "games/battleshits/sounds/bg-music", tracks: [
    ["menu", "Porcelain Lobby", "menu.mp3"],
    ["preparation", "Preparation", "preparation.mp3"],
    ["battle-1", "Battle I", "battle-1.mp3"],
    ["battle-2", "Battle II", "battle-2.mp3"],
    ["battle-3", "Battle III", "battle-3.mp3"],
  ] }),
  ...game({ slug: "sumorai", title: "Sumorai", root: "games/sumorai/assets/sounds", tracks: [
    ["dojo", "Dojo", "bg-music.wav"],
  ] }),
  ...game({ slug: "mini-tactics", title: "Mini-Tactics", root: "games/mini-tactics/sounds", tracks: [
    ["battle", "Battle", "battle.mp3"],
  ] }),
  ...game({ slug: "illuminauts", title: "Illuminauts", root: "games/illuminauts/assets/sounds", tracks: [
    ["menu", "Suit Up", "menu.mp3"],
    ["game", "Into the Dark", "game.mp3"],
  ] }),
  ...game({ slug: "bird-duty", title: "Bird Duty", root: "games/bird-duty/assets/scratch/sounds", tracks: [
    ["game", "On Duty", "game-music.mp3"],
  ] }),
  ...game({ slug: "creature-battler", title: "Creature Battler", root: "games/creature-battle/creature-battler/assets/sounds", tracks: [
    ["menu", "Creature Menu", "menu.mp3"],
    ["battle", "Battle Theme", "battle-theme.mp3"],
  ] }),
  ...game({ slug: "cockpit-swarm", title: "Cockpit Swarm", root: "games/cockpit-swarm/assets", tracks: [
    ["menu", "Hangar", "menu.mp3"],
    ["game-1", "Swarm Run I", "game1.mp3"],
    ["game-2", "Swarm Run II", "game2.mp3"],
    ["game-3", "Swarm Run III", "game3.mp3"],
  ] }),
  ...game({ slug: "build-buddy", title: "Build Buddy", root: "games/build-buddy/assets/sounds/soundtrack", tracks: [
    ["menu", "Build Buddy Menu", "menu.mp3"],
    ["open-skies", "Open Skies", "open-skies.mp3"],
    ["my-buddy", "My Buddy", "my-buddy.mp3"],
    ["hurry-and-build", "Hurry and Build", "hurry-and-build.mp3"],
    ["between-the-scaffolding", "Between the Scaffolding", "between-the-scaffolding.mp3"],
  ] }),
  ...game({ slug: "echo-duel", title: "Echo Duel", root: "games/echo-duel/assets/sounds", tracks: [
    ["menu", "Echo Menu", "menu.mp3"],
  ] }),
  ...game({ slug: "yam-bowling", title: "Yam Bowling", root: "games/yam-bowling/sounds", tracks: [
    ["theme-1", "Lane One", "theme-1.mp3"],
    ["theme-2", "Lane Two", "theme-2.mp3"],
    ["theme-3", "Lane Three", "theme-3.mp3"],
  ] }),
  ...game({ slug: "mini-hoops", title: "Mini Hoops", root: "games/mini-hoops/assets/sounds/soundtrack", tracks: [
    ["two-fast-4-u", "2 Fast 4 U", "2-fast-4-u.mp3"],
    ["courtside-blues", "Courtside Blues", "courtside-blues.mp3"],
    ["flow-state", "Flow State", "flow-state.mp3"],
    ["hard-knocks", "Hard Knocks", "hard-knocks.mp3"],
    ["the-locker-room", "The Locker Room", "the-locker-room.mp3"],
  ] }),
  ...game({ slug: "hide-and-seek", title: "Hide and Seek", root: "games/hide-and-seek/assets/sounds/bg-themes", tracks: [
    ["menu", "Lights Out", "menu.mp3"],
    ["empty-halls", "Empty Halls", "empty-halls.mp3"],
    ["the-chase", "The Chase", "the-chase.mp3"],
  ] }),
  ...game({ slug: "puckd-up", title: "Puck'd Up", root: "games/puckd-up/assets/sounds/soundtrack", tracks: [
    ["arcade-fever", "Arcade Fever", "arcade-fever.mp3"],
    ["geek-out", "Geek Out", "geek-out.mp3"],
    ["heart-on-the-table", "Heart on the Table", "heart-on-the-table.mp3"],
    ["in-the-air", "In the Air", "in-the-air.mp3"],
    ["love-loop", "Love Loop", "love-loop.mp3"],
    ["puck-you", "Puck You", "puck-you.mp3"],
    ["rollercoaster", "Rollercoaster", "rollercoaster.mp3"],
  ] }),
  ...game({ slug: "shark-hall", title: "Shark Hall", root: "games/shark-hall/assets/sounds/soundtrack", tracks: [
    ["hustle", "Hustle", "hustle.mp3"],
    ["playing-with-the-big-boys", "Playing with the Big Boys", "playing-with-the-big-boys.mp3"],
    ["smells-like-billiards", "Smells Like Billiards", "smells-like-billiards.mp3"],
    ["swimmer", "Swimmer", "swimmer.mp3"],
    ["unc-at-the-table", "Unc at the Table", "unc-at-the-table.mp3"],
    ["whats-clackin", "What's Clackin'", "what's-clackin.mp3"],
  ] }),
]);

export function findJukeboxTrack(id: string): JukeboxTrack | undefined {
  return JUKEBOX_TRACKS.find((track) => track.id === id);
}

/** Tracks grouped by game, in catalog order. */
export function jukeboxTracksByGame(): readonly Readonly<{ gameSlug: string; gameTitle: string; tracks: readonly JukeboxTrack[] }>[] {
  const groups: { gameSlug: string; gameTitle: string; tracks: JukeboxTrack[] }[] = [];
  for (const track of JUKEBOX_TRACKS) {
    let group = groups.find((entry) => entry.gameSlug === track.gameSlug);
    if (!group) {
      group = { gameSlug: track.gameSlug, gameTitle: track.gameTitle, tracks: [] };
      groups.push(group);
    }
    group.tracks.push(track);
  }
  return groups.map((group) => Object.freeze({ ...group, tracks: Object.freeze(group.tracks) }));
}

/** The record after (or before) this one, wrapping around the whole catalog; the first when the id is unknown. */
export function adjacentJukeboxTrack(id: string, direction: 1 | -1): JukeboxTrack {
  const index = JUKEBOX_TRACKS.findIndex((track) => track.id === id);
  if (index < 0) return JUKEBOX_TRACKS[0]!;
  const count = JUKEBOX_TRACKS.length;
  return JUKEBOX_TRACKS[(index + direction + count) % count]!;
}

/** Resolve a catalog file against the page that is loading it. `siteRoot` is that page's URL of the repo root. */
export function jukeboxTrackUrl(track: JukeboxTrack, siteRoot: string): string {
  return new URL(track.file, siteRoot).toString();
}

/**
 * How loud the jukebox is where the player stands: full inside `near` metres,
 * fading to silence at `far`, on a curve that stays audible across a room and
 * only really drops off at the far wall. The one place distance turns into gain.
 */
export const JUKEBOX_RANGE = Object.freeze({ near: 2.5, far: 16, max: 0.75 });

export function jukeboxGain(distance: number, range = JUKEBOX_RANGE): number {
  if (!Number.isFinite(distance) || distance <= range.near) return range.max;
  if (distance >= range.far) return 0;
  const t = (distance - range.near) / (range.far - range.near);
  return Number((range.max * (1 - t) * (1 - t)).toFixed(4));
}

/** The one decor item that picks records. */
export const JUKEBOX_ITEM_ID = "decor.prop.jukebox";
/** Decor that relays whatever the jukebox is playing; a speaker never plays on its own. */
export const SPEAKER_ITEM_IDS: readonly string[] = Object.freeze(["decor.prop.speaker-stack", "decor.wall.speaker", "decor.ceiling.speaker"]);

export function isJukeboxEmitter(itemId: string): boolean {
  return itemId === JUKEBOX_ITEM_ID || SPEAKER_ITEM_IDS.includes(itemId);
}

export type JukeboxEmitterPoint = Readonly<{ x: number; z: number }>;

/**
 * How loud the record is where the player stands with several things playing
 * it. It is the LOUDEST one, never the sum: two speakers side by side sound
 * like one speaker, the same as a real room where the nearer cone masks the
 * other, and a wall of them cannot be turned into a volume knob. Nothing to
 * play through is silence.
 */
export function jukeboxGainAt(listener: JukeboxEmitterPoint, emitters: readonly JukeboxEmitterPoint[], range = JUKEBOX_RANGE): number {
  let loudest = 0;
  for (const emitter of emitters) {
    const gain = jukeboxGain(Math.hypot(listener.x - emitter.x, listener.z - emitter.z), range);
    if (gain > loudest) loudest = gain;
  }
  return loudest;
}

/** `postMessage` shapes between the jukebox page (in the overlay) and the room. */
export const JUKEBOX_MESSAGE = Object.freeze({
  /** Page → room: play this id, or stop, or step. */
  command: "arcade-room:jukebox:command",
  /** Room → page: the state as it stands, sent on hello and every change. */
  state: "arcade-room:jukebox:state",
  /** Page → room: the page is up and wants the state. */
  hello: "arcade-room:jukebox:hello",
} as const);

export type JukeboxCommand =
  | Readonly<{ type: typeof JUKEBOX_MESSAGE.command; action: "play" | "set-default"; trackId: string }>
  | Readonly<{ type: typeof JUKEBOX_MESSAGE.command; action: "stop" | "next" | "previous" | "toggle" | "clear-default" }>;

export type JukeboxState = Readonly<{
  type: typeof JUKEBOX_MESSAGE.state;
  trackId: string | null;
  playing: boolean;
  /** The house record: what the room plays for anyone who walks in. */
  defaultTrackId: string | null;
  /** Only the room's owner may change the house record; the page hides the control otherwise. */
  canSetDefault: boolean;
}>;

export function isJukeboxCommand(value: unknown): value is JukeboxCommand {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type !== JUKEBOX_MESSAGE.command) return false;
  if (message.action === "play" || message.action === "set-default") {
    return typeof message.trackId === "string" && Boolean(findJukeboxTrack(message.trackId));
  }
  return message.action === "stop" || message.action === "next" || message.action === "previous" || message.action === "toggle"
    || message.action === "clear-default";
}

export function isJukeboxState(value: unknown): value is JukeboxState {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === JUKEBOX_MESSAGE.state
    && (message.trackId === null || typeof message.trackId === "string")
    && typeof message.playing === "boolean"
    && (message.defaultTrackId === null || typeof message.defaultTrackId === "string")
    && typeof message.canSetDefault === "boolean";
}
