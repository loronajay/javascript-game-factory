const { test } = require("node:test");
const assert = require("node:assert/strict");

const animation = require("./animation-core.js");
const progression = require("./progression-core.js");

const {
  CURVES,
  GRANT_SOURCES,
  MAX_LEVEL,
  MAX_PERFORMANCE_XP,
  PROGRESSION_STORAGE_KEY,
  SCHEMA_VERSION,
  computeMatchGrant,
  createProgressionStore,
  eligibilityFor,
  levelFromXp,
  xpForLevel,
} = progression;

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
    raw: () => map,
  };
}

function storeWith(seed = {}) {
  return createProgressionStore({ storage: memoryStorage(seed) });
}

const SLUG = animation.CANON_BOWLERS[0].slug;

function onlineResult(overrides = {}) {
  return {
    grantId: "session-1",
    playType: "online",
    modeId: "quick",
    characterSlug: SLUG,
    terminal: true,
    outcome: "loss",
    strikes: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------- XP curves

test("both tracks start at level 1 with zero XP required", () => {
  for (const track of Object.keys(CURVES)) {
    assert.equal(xpForLevel(track, 1), 0);
    assert.equal(levelFromXp(track, 0).level, 1);
  }
});

test("the closed-form curve agrees with summing every level cost, at every boundary to 30", () => {
  for (const [track, curve] of Object.entries(CURVES)) {
    let running = 0;
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      assert.equal(
        xpForLevel(track, level),
        running,
        `${track} level ${level} threshold should match the accumulated cost`,
      );
      running += curve.base + (level - 1) * curve.step;
    }
  }
});

test("every level boundary lands exactly on its threshold and not one XP earlier", () => {
  for (const track of Object.keys(CURVES)) {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      const threshold = xpForLevel(track, level);
      assert.equal(levelFromXp(track, threshold - 1).level, level - 1);
      assert.equal(levelFromXp(track, threshold).level, level);
    }
  }
});

test("progress within a level reports the remaining XP to the next one", () => {
  const atLevel5 = xpForLevel("bowler", 5);
  const cost = xpForLevel("bowler", 6) - atLevel5;
  const progress = levelFromXp("bowler", atLevel5 + 10);

  assert.equal(progress.level, 5);
  assert.equal(progress.xpIntoLevel, 10);
  assert.equal(progress.xpForNextLevel, cost);
  assert.equal(progress.isMaxLevel, false);
});

test("level 30 is the cap: surplus XP is held, never spilled into level 31", () => {
  for (const track of Object.keys(CURVES)) {
    const capped = levelFromXp(track, xpForLevel(track, MAX_LEVEL) + 999999);
    assert.equal(capped.level, MAX_LEVEL);
    assert.equal(capped.isMaxLevel, true);
    assert.equal(capped.xpForNextLevel, 0);
  }
});

test("a player level costs more than a bowler level, so mastery is not the aggregate", () => {
  assert.ok(xpForLevel("player", MAX_LEVEL) > xpForLevel("bowler", MAX_LEVEL));
});

test("negative, fractional, and non-numeric XP are clamped rather than throwing", () => {
  assert.equal(levelFromXp("bowler", -50).level, 1);
  assert.equal(levelFromXp("bowler", Number.NaN).level, 1);
  assert.equal(levelFromXp("bowler", undefined).level, 1);
  assert.equal(levelFromXp("bowler", 10.9).xpIntoLevel, 10);
  assert.equal(levelFromXp("nonsense", 999).level, 1);
});

// ------------------------------------------------------------- eligibility

test("only online and campaign play are XP-eligible mode families", () => {
  assert.equal(eligibilityFor({ playType: "online", modeId: "quick" }).eligible, true);
  assert.equal(eligibilityFor({ playType: "campaign", modeId: "classic" }).eligible, true);

  for (const playType of ["cpu", "hotseat", "practice", "tutorial"]) {
    const verdict = eligibilityFor({ playType, modeId: "quick" });
    assert.equal(verdict.eligible, false, `${playType} must never award XP`);
    assert.equal(verdict.reason, "ineligible-mode");
  }
});

test("an unknown play type or mode is ineligible rather than defaulting to a payout", () => {
  assert.equal(eligibilityFor({ playType: "speedrun", modeId: "quick" }).reason, "ineligible-mode");
  assert.equal(eligibilityFor({ playType: "online", modeId: "marathon" }).reason, "unknown-mode");
  assert.equal(eligibilityFor({}).eligible, false);
});

// ------------------------------------------------------------ match grants

test("a completed online Quick Bowl loss pays completion only", () => {
  const grant = computeMatchGrant(onlineResult());

  assert.equal(grant.eligible, true);
  assert.equal(grant.playerXp, GRANT_SOURCES.online.quick.completion);
  assert.equal(grant.bowlerXp, GRANT_SOURCES.online.quick.completion);
  assert.equal(grant.breakdown.win, 0);
  assert.equal(grant.characterSlug, SLUG);
  assert.equal(grant.grantId, "session-1");
});

test("winning adds the modest result bonus on top of completion", () => {
  const quick = computeMatchGrant(onlineResult({ outcome: "win" }));
  const classic = computeMatchGrant(onlineResult({ modeId: "classic", outcome: "win" }));

  assert.equal(quick.breakdown.completion, 100);
  assert.equal(quick.breakdown.win, 25);
  assert.equal(quick.playerXp, 125);
  assert.equal(classic.breakdown.completion, 300);
  assert.equal(classic.breakdown.win, 75);
  assert.equal(classic.playerXp, 375);
});

test("a close loss is worth most of a win, so it still feels worthwhile", () => {
  const win = computeMatchGrant(onlineResult({ outcome: "win" })).playerXp;
  const loss = computeMatchGrant(onlineResult({ outcome: "loss" })).playerXp;
  assert.ok(loss / win >= 0.75, "completion must dominate the result bonus");
});

test("a draw pays completion without the win bonus", () => {
  const grant = computeMatchGrant(onlineResult({ outcome: "draw" }));
  assert.equal(grant.breakdown.win, 0);
  assert.equal(grant.playerXp, 100);
});

test("the performance bonus is capped no matter how many strikes were bowled", () => {
  assert.equal(computeMatchGrant(onlineResult({ strikes: 1 })).breakdown.performance, 4);
  assert.equal(computeMatchGrant(onlineResult({ strikes: 12 })).breakdown.performance, MAX_PERFORMANCE_XP);
  assert.equal(computeMatchGrant(onlineResult({ strikes: 9999 })).breakdown.performance, MAX_PERFORMANCE_XP);
  assert.equal(computeMatchGrant(onlineResult({ strikes: -5 })).breakdown.performance, 0);
});

test("player XP and bowler XP are granted in equal measure", () => {
  const grant = computeMatchGrant(onlineResult({ modeId: "classic", outcome: "win", strikes: 6 }));
  assert.equal(grant.playerXp, grant.bowlerXp);
});

test("XP is refused until the authoritative match reaches a terminal state", () => {
  const grant = computeMatchGrant(onlineResult({ terminal: false, outcome: "win" }));
  assert.equal(grant.eligible, false);
  assert.equal(grant.reason, "not-terminal");
  assert.equal(grant.playerXp, 0);
  assert.equal(grant.bowlerXp, 0);
});

test("CPU, hotseat, practice, and tutorial matches compute a zero grant", () => {
  for (const playType of ["cpu", "hotseat", "practice", "tutorial"]) {
    const grant = computeMatchGrant(onlineResult({ playType, outcome: "win", strikes: 12 }));
    assert.equal(grant.eligible, false);
    assert.equal(grant.playerXp, 0);
    assert.equal(grant.bowlerXp, 0);
  }
});

test("a grant with no authoritative id is refused, because nothing could dedupe it", () => {
  const grant = computeMatchGrant(onlineResult({ grantId: "" }));
  assert.equal(grant.eligible, false);
  assert.equal(grant.reason, "missing-grant-id");
});

test("a grant for a bowler outside the canon roster is refused", () => {
  const grant = computeMatchGrant(onlineResult({ characterSlug: "not-a-bowler" }));
  assert.equal(grant.eligible, false);
  assert.equal(grant.reason, "unknown-bowler");
});

// ---------------------------------------------------------------- forfeits

test("a player who leaves early receives no completion and no win XP", () => {
  const grant = computeMatchGrant(onlineResult({ forfeitRole: "leaver", outcome: "loss", strikes: 3 }));
  assert.equal(grant.eligible, false);
  assert.equal(grant.reason, "left-early");
  assert.equal(grant.playerXp, 0);
});

test("the non-leaving player's forfeit reward is separate from an ordinary win", () => {
  const forfeit = computeMatchGrant(onlineResult({ forfeitRole: "remaining", outcome: "win", strikes: 12 }));
  const ordinary = computeMatchGrant(onlineResult({ outcome: "win", strikes: 12 }));

  assert.equal(forfeit.eligible, true);
  assert.equal(forfeit.breakdown.completion, 0, "an abandoned match was not completed");
  assert.equal(forfeit.breakdown.win, 0, "an unearned win pays no result bonus");
  assert.equal(forfeit.breakdown.performance, 0);
  assert.equal(forfeit.breakdown.forfeit, 50);
  assert.equal(forfeit.playerXp, 50);
  assert.ok(forfeit.playerXp < ordinary.playerXp, "walking an opponent must never beat playing it out");
});

test("the forfeit reward scales with the match length that was abandoned", () => {
  const quick = computeMatchGrant(onlineResult({ forfeitRole: "remaining" }));
  const classic = computeMatchGrant(onlineResult({ modeId: "classic", forfeitRole: "remaining" }));
  assert.equal(quick.breakdown.forfeit, 50);
  assert.equal(classic.breakdown.forfeit, 150);
});

// --------------------------------------------------------- campaign grants

test("a campaign first clear pays once, and a replay is not a better farm than online", () => {
  const base = { grantId: "clear-1", playType: "campaign", modeId: "classic", characterSlug: SLUG, terminal: true, outcome: "win", strikes: 0 };

  const encounter = computeMatchGrant({ ...base, campaign: { kind: "encounter", firstClear: true } });
  const boss = computeMatchGrant({ ...base, campaign: { kind: "boss", firstClear: true } });
  const replay = computeMatchGrant({ ...base, campaign: { kind: "encounter", firstClear: false } });

  assert.equal(encounter.playerXp, 300);
  assert.equal(boss.playerXp, 600);
  assert.equal(replay.eligible, false);
  assert.equal(replay.reason, "campaign-replay");
  assert.equal(replay.playerXp, 0);
});

test("a campaign result with no clear contract is refused rather than paid as an encounter", () => {
  const grant = computeMatchGrant(onlineResult({ playType: "campaign", grantId: "clear-2" }));
  assert.equal(grant.eligible, false);
  assert.equal(grant.reason, "unknown-campaign-clear");
});

// ------------------------------------------------------- the local cache

test("a fresh device reports level 1 everywhere without inventing a balance", () => {
  const store = storeWith();

  assert.equal(store.getPlayer().level, 1);
  assert.equal(store.getPlayer().xp, 0);
  assert.equal(store.getBowler(SLUG).level, 1);
  assert.equal(store.getBowler(SLUG).matches, 0);
  assert.equal(store.getSyncState().syncedAt, null);
  assert.equal(store.getSyncState().pendingCount, 0);
});

test("the store never awards itself XP — only an authoritative snapshot moves a balance", () => {
  const store = storeWith();
  const grant = computeMatchGrant(onlineResult({ outcome: "win" }));

  store.recordPending(grant);

  assert.equal(store.getPlayer().xp, 0, "a pending grant must not be spent before the server confirms it");
  assert.equal(store.getBowler(SLUG).xp, 0);
  assert.equal(store.getSyncState().pendingCount, 1);
  assert.equal(store.listPending()[0].grantId, "session-1");
});

test("an ineligible grant is never queued", () => {
  const store = storeWith();
  store.recordPending(computeMatchGrant(onlineResult({ playType: "cpu" })));
  assert.equal(store.getSyncState().pendingCount, 0);
});

test("the same authoritative grant cannot be queued twice, so a retry is safe", () => {
  const store = storeWith();
  const grant = computeMatchGrant(onlineResult());

  assert.equal(store.recordPending(grant), true);
  assert.equal(store.recordPending(grant), false, "a duplicate grant id must be refused");
  assert.equal(store.recordPending(computeMatchGrant(onlineResult())), false);
  assert.equal(store.getSyncState().pendingCount, 1);
});

test("a rematch is a new session, so it is a new grant", () => {
  const store = storeWith();
  store.recordPending(computeMatchGrant(onlineResult({ grantId: "session-1" })));
  assert.equal(store.recordPending(computeMatchGrant(onlineResult({ grantId: "session-2" }))), true);
  assert.equal(store.getSyncState().pendingCount, 2);
});

test("an accepted snapshot replaces the balance and clears the grant it settles", () => {
  const store = storeWith();
  store.recordPending(computeMatchGrant(onlineResult({ outcome: "win" })));

  store.applySnapshot({
    version: SCHEMA_VERSION,
    player: { xp: 125 },
    bowlers: { [SLUG]: { xp: 125, matches: 1, wins: 1, strikes: 2, highGame: 87 } },
    grants: ["session-1"],
    syncedAt: "2026-08-15T00:00:00.000Z",
  });

  assert.equal(store.getPlayer().xp, 125);
  assert.equal(store.getBowler(SLUG).xp, 125);
  assert.equal(store.getBowler(SLUG).highGame, 87);
  assert.equal(store.getBowler(SLUG).level, levelFromXp("bowler", 125).level);
  assert.equal(store.getSyncState().pendingCount, 0, "a grant the server acknowledged is no longer pending");
  assert.equal(store.hasGrant("session-1"), true);
  assert.equal(store.getSyncState().syncedAt, "2026-08-15T00:00:00.000Z");
});

test("a grant already known to the server is refused before it is ever sent again", () => {
  const store = storeWith();
  store.applySnapshot({ version: SCHEMA_VERSION, player: { xp: 100 }, bowlers: {}, grants: ["session-1"], syncedAt: "2026-08-15T00:00:00.000Z" });

  assert.equal(store.recordPending(computeMatchGrant(onlineResult())), false);
  assert.equal(store.getSyncState().pendingCount, 0);
});

test("a rejected grant leaves the queue without moving the balance", () => {
  const store = storeWith();
  store.recordPending(computeMatchGrant(onlineResult()));

  store.resolvePending("session-1", { accepted: false });

  assert.equal(store.getSyncState().pendingCount, 0);
  assert.equal(store.getPlayer().xp, 0);
  assert.equal(store.hasGrant("session-1"), true, "a refused grant must not be retried forever");
});

test("the pending queue survives a reload so an offline result is not lost", () => {
  const storage = memoryStorage();
  const first = createProgressionStore({ storage });
  first.recordPending(computeMatchGrant(onlineResult()));

  const second = createProgressionStore({ storage });
  assert.equal(second.getSyncState().pendingCount, 1);
  assert.equal(second.listPending()[0].grantId, "session-1");
});

test("a snapshot from a schema this build does not understand is discarded, not guessed at", () => {
  const store = storeWith({
    [PROGRESSION_STORAGE_KEY]: JSON.stringify({ version: SCHEMA_VERSION + 1, player: { xp: 999999 } }),
  });
  assert.equal(store.getPlayer().xp, 0);
  assert.equal(store.getPlayer().level, 1);
});

test("corrupt stored progress falls back to an empty record instead of throwing", () => {
  assert.equal(storeWith({ [PROGRESSION_STORAGE_KEY]: "{{{" }).getPlayer().xp, 0);
  assert.equal(storeWith({ [PROGRESSION_STORAGE_KEY]: "null" }).getPlayer().level, 1);
});

test("a snapshot cannot smuggle in a bowler outside the canon roster or a negative balance", () => {
  const store = storeWith();
  store.applySnapshot({
    version: SCHEMA_VERSION,
    player: { xp: -400 },
    bowlers: { "not-a-bowler": { xp: 5000 }, [SLUG]: { xp: 50, matches: -3 } },
    grants: ["a", "a", 7, ""],
    syncedAt: "2026-08-15T00:00:00.000Z",
  });

  assert.equal(store.getPlayer().xp, 0);
  assert.equal(store.getBowler("not-a-bowler"), null);
  assert.equal(store.getBowler(SLUG).matches, 0);
  assert.deepEqual(store.listBowlers().map((entry) => entry.slug), [SLUG]);
  assert.equal(store.hasGrant("a"), true);
  assert.equal(store.hasGrant(""), false);
});

test("the grant ledger is bounded, and the oldest ids fall off first", () => {
  const store = storeWith();
  const ids = Array.from({ length: progression.MAX_TRACKED_GRANTS + 5 }, (_, index) => `s${index}`);
  store.applySnapshot({ version: SCHEMA_VERSION, player: { xp: 0 }, bowlers: {}, grants: ids, syncedAt: "2026-08-15T00:00:00.000Z" });

  assert.equal(store.hasGrant("s0"), false, "the local ledger is a cache; the server stays the truth");
  assert.equal(store.hasGrant(ids[ids.length - 1]), true);
});

test("a bowler summary carries the stats mastery is measured by", () => {
  const store = storeWith();
  store.applySnapshot({
    version: SCHEMA_VERSION,
    player: { xp: 0 },
    bowlers: { [SLUG]: { xp: 900, matches: 12, wins: 7, strikes: 30, highGame: 201 } },
    grants: [],
    syncedAt: "2026-08-15T00:00:00.000Z",
  });

  const summary = store.getBowler(SLUG);
  assert.equal(summary.slug, SLUG);
  assert.equal(summary.matches, 12);
  assert.equal(summary.wins, 7);
  assert.equal(summary.strikes, 30);
  assert.equal(summary.highGame, 201);
  assert.equal(summary.level, levelFromXp("bowler", 900).level);
});

test("every canon bowler can be summarized, whether or not the server has seen them", () => {
  const store = storeWith();
  for (const bowler of animation.CANON_BOWLERS) {
    assert.equal(store.getBowler(bowler.slug).level, 1);
  }
});
