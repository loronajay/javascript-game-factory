(function exposeProgressionCore(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const animation = isCommonJs ? require("./animation-core.js") : root.YamBowlingCore;
  const api = factory(root, animation);
  if (isCommonJs) module.exports = api;
  root.YamProgression = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProgressionCore(root, animation) {
  "use strict";

  // The progression domain: XP curves, match grants, and the device-local cache
  // of an authoritative balance.
  //
  // Two rules shape everything in here.
  //
  // 1. The client never awards itself XP. `computeMatchGrant` describes what a
  //    finished match is *worth* under the published table, but the store only
  //    ever moves a balance in `applySnapshot` -- the server's answer. A grant
  //    the server has not confirmed sits in `pending`, so the UI can say
  //    "syncing" without inventing a number. The same pure grant function is
  //    what the server evaluates, which is what keeps the two in agreement.
  //
  // 2. A level is derived from XP, never stored. A stored level can disagree
  //    with the curve the moment the curve is retuned; a derived one cannot.

  const SCHEMA_VERSION = 1;
  const PROGRESSION_STORAGE_KEY = "yam-bowling.progression.v1";

  // Launch cap. Raising it is deferred scope, so nothing else may hard-code 30.
  const MAX_LEVEL = 30;

  // Cost to advance out of level L is `base + (L - 1) * step`. Player levels are
  // the aggregate of all play, so they are deliberately dearer than mastery of a
  // single bowler -- otherwise spreading play across the roster would outrank it.
  const CURVES = Object.freeze({
    player: Object.freeze({ base: 400, step: 150, maxLevel: MAX_LEVEL }),
    bowler: Object.freeze({ base: 200, step: 100, maxLevel: MAX_LEVEL }),
  });

  // The launch XP proposal from METAGAME_SCOPE.md. These are playtest starting
  // values, not economy promises, and they live here alone so a retune is one
  // edit rather than a hunt.
  const GRANT_SOURCES = Object.freeze({
    online: Object.freeze({
      quick: Object.freeze({ completion: 100, win: 25 }),
      classic: Object.freeze({ completion: 300, win: 75 }),
    }),
    campaign: Object.freeze({
      encounter: Object.freeze({ firstClear: 300, replay: 0 }),
      boss: Object.freeze({ firstClear: 600, replay: 0 }),
    }),
  });

  const MODE_IDS = Object.freeze(Object.keys(GRANT_SOURCES.online));
  const ELIGIBLE_PLAY_TYPES = Object.freeze(["online", "campaign"]);
  const INELIGIBLE_PLAY_TYPES = Object.freeze(["cpu", "hotseat", "practice", "tutorial"]);

  // Capped on purpose: the scope wants abuse telemetry before any uncapped
  // performance XP, so a perfect game cannot out-earn simply playing more.
  const PERFORMANCE_XP_PER_STRIKE = 4;
  const MAX_PERFORMANCE_XP = 20;

  // The local ledger is a cache the server can always re-answer, so it is bounded
  // rather than growing for the life of the device.
  const MAX_TRACKED_GRANTS = 400;

  const BOWLING_STAT_FIELDS = Object.freeze([
    "quickGames", "quickTotalScore", "quickHighGame",
    "quickStrikeOpportunities", "quickStrikes", "quickSpareOpportunities", "quickSpares",
    "classicGames", "classicTotalScore", "classicHighGame",
    "classicStrikeOpportunities", "classicStrikes", "classicSpareOpportunities", "classicSpares",
  ]);

  function curveFor(track) {
    return Object.prototype.hasOwnProperty.call(CURVES, track) ? CURVES[track] : null;
  }

  function safeInt(value, fallback = 0) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampCount(value) {
    return Math.max(0, safeInt(value, 0));
  }

  function canonBowler(slug) {
    return animation.CANON_BOWLERS.find((bowler) => bowler.slug === slug) || null;
  }

  // Total XP needed to *be* the given level. Closed form of the running sum, so
  // a boundary check is arithmetic rather than a loop over 30 levels.
  function xpForLevel(track, level) {
    const curve = curveFor(track);
    const target = safeInt(level, 1);
    if (!curve || target <= 1) return 0;
    const steps = Math.min(target, curve.maxLevel) - 1;
    return steps * curve.base + curve.step * ((steps * (steps - 1)) / 2);
  }

  function levelFromXp(track, xp) {
    const curve = curveFor(track);
    const total = Math.max(0, safeInt(xp, 0));
    if (!curve) return { level: 1, xp: total, xpIntoLevel: 0, xpForNextLevel: 0, isMaxLevel: false };

    let level = 1;
    while (level < curve.maxLevel && total >= xpForLevel(track, level + 1)) level += 1;

    const isMaxLevel = level >= curve.maxLevel;
    return {
      level,
      xp: total,
      xpIntoLevel: total - xpForLevel(track, level),
      xpForNextLevel: isMaxLevel ? 0 : xpForLevel(track, level + 1) - xpForLevel(track, level),
      isMaxLevel,
    };
  }

  function eligibilityFor({ playType, modeId } = {}) {
    if (!ELIGIBLE_PLAY_TYPES.includes(playType)) return { eligible: false, reason: "ineligible-mode" };
    if (!MODE_IDS.includes(modeId)) return { eligible: false, reason: "unknown-mode" };
    return { eligible: true, reason: "eligible" };
  }

  function emptyBreakdown() {
    return { completion: 0, win: 0, performance: 0, forfeit: 0 };
  }

  function refusedGrant(grantId, characterSlug, reason) {
    return {
      grantId: String(grantId || ""),
      characterSlug: characterSlug || null,
      eligible: false,
      reason,
      playerXp: 0,
      bowlerXp: 0,
      breakdown: emptyBreakdown(),
    };
  }

  function campaignAward(campaign) {
    const table = campaign && GRANT_SOURCES.campaign[campaign.kind];
    if (!table) return { reason: "unknown-campaign-clear", amount: 0 };
    if (!campaign.firstClear) return { reason: "campaign-replay", amount: table.replay };
    return { reason: "eligible", amount: table.firstClear };
  }

  // What a finished match is worth under the published table. Pure: it reads no
  // storage and awards nothing by itself. The server evaluates the same inputs;
  // the client calls it so it can queue and describe the grant, never to bank it.
  function computeMatchGrant({
    grantId,
    playType,
    modeId,
    characterSlug,
    terminal = false,
    outcome = "loss",
    strikes = 0,
    forfeitRole = null,
    campaign = null,
  } = {}) {
    if (!grantId || typeof grantId !== "string") return refusedGrant(grantId, characterSlug, "missing-grant-id");
    if (!canonBowler(characterSlug)) return refusedGrant(grantId, characterSlug, "unknown-bowler");

    const verdict = eligibilityFor({ playType, modeId });
    if (!verdict.eligible) return refusedGrant(grantId, characterSlug, verdict.reason);

    // A player who walks gets nothing, whether or not the match ended cleanly.
    if (forfeitRole === "leaver") return refusedGrant(grantId, characterSlug, "left-early");
    if (!terminal) return refusedGrant(grantId, characterSlug, "not-terminal");

    const breakdown = emptyBreakdown();

    if (playType === "campaign") {
      const award = campaignAward(campaign);
      if (award.reason !== "eligible") return refusedGrant(grantId, characterSlug, award.reason);
      breakdown.completion = award.amount;
    } else if (forfeitRole === "remaining") {
      // An abandoned match was not completed and the win was not earned, so the
      // reward is its own line: credit for the frames actually bowled.
      breakdown.forfeit = Math.floor(GRANT_SOURCES.online[modeId].completion / 2);
    } else {
      const table = GRANT_SOURCES.online[modeId];
      breakdown.completion = table.completion;
      breakdown.win = outcome === "win" ? table.win : 0;
      breakdown.performance = Math.min(
        MAX_PERFORMANCE_XP,
        Math.max(0, safeInt(strikes, 0)) * PERFORMANCE_XP_PER_STRIKE,
      );
    }

    const total = breakdown.completion + breakdown.win + breakdown.performance + breakdown.forfeit;
    return { grantId, characterSlug, eligible: true, reason: "eligible", playerXp: total, bowlerXp: total, breakdown };
  }

  function emptyRecord() {
    return { version: SCHEMA_VERSION, player: { xp: 0 }, bowlers: {}, grants: [], pending: [], syncedAt: null };
  }

  function normalizeGrantIds(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = [];
    for (const id of raw) {
      if (typeof id !== "string" || !id) continue;
      if (!seen.includes(id)) seen.push(id);
    }
    return seen.slice(-MAX_TRACKED_GRANTS);
  }

  function normalizeBowlers(raw) {
    const bowlers = {};
    if (!raw || typeof raw !== "object") return bowlers;
    for (const [slug, stats] of Object.entries(raw)) {
      if (!canonBowler(slug) || !stats || typeof stats !== "object") continue;
      const normalized = {
        xp: clampCount(stats.xp),
        matches: clampCount(stats.matches),
        wins: clampCount(stats.wins),
        draws: clampCount(stats.draws),
        strikes: clampCount(stats.strikes),
        highGame: clampCount(stats.highGame),
      };
      for (const field of BOWLING_STAT_FIELDS) normalized[field] = clampCount(stats[field]);
      bowlers[slug] = normalized;
    }
    return bowlers;
  }

  // The report that would file a queued grant, kept beside it so a request that
  // never reached the server can be sent again exactly as it was first built.
  // It is stored OPAQUELY on purpose: this module owns when a grant may be
  // re-sent, not what a report says, and a copy is taken both in and out so a
  // caller cannot edit the envelope the queue would replay.
  function normalizeReport(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    try {
      const copy = JSON.parse(JSON.stringify(raw));
      return copy && typeof copy === "object" && !Array.isArray(copy) ? copy : null;
    } catch {
      return null;
    }
  }

  function normalizePending(raw) {
    if (!Array.isArray(raw)) return [];
    const pending = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.grantId !== "string" || !entry.grantId) continue;
      if (pending.some((queued) => queued.grantId === entry.grantId)) continue;
      pending.push({
        grantId: entry.grantId,
        characterSlug: canonBowler(entry.characterSlug) ? entry.characterSlug : null,
        playerXp: clampCount(entry.playerXp),
        bowlerXp: clampCount(entry.bowlerXp),
        report: normalizeReport(entry.report),
      });
    }
    return pending;
  }

  // A record from a schema this build does not understand is discarded rather
  // than half-read: a wrong balance is worse than an empty one the server refills.
  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object" || raw.version !== SCHEMA_VERSION) return null;
    return {
      version: SCHEMA_VERSION,
      player: { xp: clampCount(raw.player?.xp) },
      bowlers: normalizeBowlers(raw.bowlers),
      grants: normalizeGrantIds(raw.grants),
      pending: normalizePending(raw.pending),
      syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : null,
    };
  }

  function defaultStorage() {
    try {
      return root.localStorage;
    } catch {
      return null;
    }
  }

  function createProgressionStore({ storage = defaultStorage() } = {}) {
    let record = null;
    try {
      record = normalizeRecord(JSON.parse(storage?.getItem?.(PROGRESSION_STORAGE_KEY) || "null"));
    } catch {
      record = null;
    }
    if (!record) record = emptyRecord();

    function persist() {
      try {
        storage?.setItem?.(PROGRESSION_STORAGE_KEY, JSON.stringify(record));
      } catch {
        // The cache is a convenience; the server can always re-answer it.
      }
    }

    function rememberGrant(grantId) {
      if (record.grants.includes(grantId)) return;
      record.grants = [...record.grants, grantId].slice(-MAX_TRACKED_GRANTS);
    }

    function hasGrant(grantId) {
      return typeof grantId === "string" && record.grants.includes(grantId);
    }

    function isPending(grantId) {
      return record.pending.some((entry) => entry.grantId === grantId);
    }

    function getPlayer() {
      return levelFromXp("player", record.player.xp);
    }

    function getBowler(slug) {
      if (!canonBowler(slug)) return null;
      const stats = record.bowlers[slug] || {
        xp: 0, matches: 0, wins: 0, draws: 0, strikes: 0, highGame: 0,
        ...Object.fromEntries(BOWLING_STAT_FIELDS.map((field) => [field, 0])),
      };
      return { slug, ...stats, ...levelFromXp("bowler", stats.xp) };
    }

    function listBowlers() {
      return Object.keys(record.bowlers).map(getBowler);
    }

    // Queues a grant for reporting. It deliberately does not touch a balance --
    // only `applySnapshot` does that, and only with the server's own numbers.
    function recordPending(grant, report = null) {
      if (!grant?.eligible || !grant.grantId) return false;
      if (hasGrant(grant.grantId) || isPending(grant.grantId)) return false;
      record.pending = [...record.pending, {
        grantId: grant.grantId,
        characterSlug: grant.characterSlug,
        playerXp: grant.playerXp,
        bowlerXp: grant.bowlerXp,
        report: normalizeReport(report),
      }];
      persist();
      return true;
    }

    function listPending() {
      return record.pending.map((entry) => ({ ...entry, report: normalizeReport(entry.report) }));
    }

    // Accepted or refused, the grant leaves the queue and joins the ledger: a
    // grant the server has ruled on must never be retried in a loop.
    function resolvePending(grantId) {
      if (!isPending(grantId)) return false;
      record.pending = record.pending.filter((entry) => entry.grantId !== grantId);
      rememberGrant(grantId);
      persist();
      return true;
    }

    // The authoritative balance. This is the only path that moves XP.
    function applySnapshot(snapshot) {
      const next = normalizeRecord({ ...snapshot, version: snapshot?.version ?? SCHEMA_VERSION, pending: [] });
      if (!next) return false;
      const settled = new Set(next.grants);
      next.pending = record.pending.filter((entry) => !settled.has(entry.grantId));
      record = next;
      persist();
      return true;
    }

    function getSyncState() {
      return {
        pendingCount: record.pending.length,
        syncedAt: record.syncedAt,
        stale: record.syncedAt === null,
      };
    }

    return {
      applySnapshot,
      getBowler,
      getPlayer,
      getSyncState,
      hasGrant,
      listBowlers,
      listPending,
      recordPending,
      resolvePending,
    };
  }

  return {
    CURVES,
    ELIGIBLE_PLAY_TYPES,
    GRANT_SOURCES,
    INELIGIBLE_PLAY_TYPES,
    MAX_LEVEL,
    MAX_PERFORMANCE_XP,
    MAX_TRACKED_GRANTS,
    MODE_IDS,
    PERFORMANCE_XP_PER_STRIKE,
    PROGRESSION_STORAGE_KEY,
    SCHEMA_VERSION,
    computeMatchGrant,
    createProgressionStore,
    eligibilityFor,
    levelFromXp,
    xpForLevel,
  };
});
