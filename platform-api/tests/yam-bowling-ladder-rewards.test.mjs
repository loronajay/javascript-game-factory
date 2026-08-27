import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  entitlementRewardsBetween,
  getProgression,
  inventoryRewardsBetween,
  xpForLevel,
} from "../src/services/progression-catalog.mjs";
import {
  validateYamBowlingPublicClaim,
  validateYamBowlingSkinVoucherTarget,
} from "../src/services/yam-bowling-reward-catalog.mjs";
import { normalizeYamBowlingGarage } from "../src/services/yam-bowling-loadout-catalog.mjs";
import {
  YAM_BOWLING_ALL_VENUES_MASK,
  YAM_BOWLING_BOWLER_SLUGS,
  earnedYamBowlingCareerBadges,
  mergeYamBowlingCareerStats,
} from "../src/services/yam-bowling-career.mjs";

test("Yam Bowling awards its two currencies on their own rungs", () => {
  const definition = getProgression("yam-bowling");
  assert.ok(definition);

  assert.deepEqual(
    inventoryRewardsBetween(definition, xpForLevel(definition.curves.player, 9), xpForLevel(definition.curves.player, 10)),
    [{ itemId: "skin-voucher", quantity: 1, level: 10 }],
  );
  assert.deepEqual(
    inventoryRewardsBetween(definition, xpForLevel(definition.curves.player, 9), xpForLevel(definition.curves.player, 25)),
    [
      { itemId: "skin-voucher", quantity: 1, level: 10 },
      { itemId: "emote-voucher", quantity: 1, level: 16 },
      { itemId: "emote-voucher", quantity: 1, level: 22 },
      { itemId: "skin-voucher", quantity: 1, level: 25 },
    ],
  );
  // The four emote rungs. They are the commoner currency because the emote pool
  // is thirty deep where the skin pool is two per bowler.
  assert.deepEqual(
    inventoryRewardsBetween(definition, 0, xpForLevel(definition.curves.player, 30))
      .filter((reward) => reward.itemId === "emote-voucher")
      .map((reward) => reward.level),
    [7, 16, 22, 30],
  );
  assert.deepEqual(
    inventoryRewardsBetween(definition, xpForLevel(definition.curves.player, 25), xpForLevel(definition.curves.player, 26)),
    [],
  );
});

// A level-earned cosmetic is a durable entitlement for the same reason a
// voucher is a durable inventory row: the garage validator trusts
// game_entitlements and nothing else, so a reward that mints no row can be
// equipped on the device and then stripped on save.
test("crossing a player level grants that level's cosmetic entitlement", () => {
  const definition = getProgression("yam-bowling");
  const at = (level) => xpForLevel(definition.curves.player, level);

  assert.deepEqual(entitlementRewardsBetween(definition, "player", at(1), at(2)), [
    { level: 2, entitlementId: "ball-trail:lime-shock", kind: "ball-trail" },
    { level: 2, entitlementId: "strike-burst:lime-pop", kind: "strike-burst" },
  ]);
  assert.deepEqual(
    entitlementRewardsBetween(definition, "player", at(1), at(3)).map((entry) => entry.entitlementId),
    ["ball-trail:lime-shock", "strike-burst:lime-pop", "ball-trail:red-neon", "strike-burst:red-supernova"],
  );
  assert.deepEqual(entitlementRewardsBetween(definition, "player", at(3), at(3)), []);
});

test("crossing a bowler mastery level grants that level's cosmetic entitlement", () => {
  const definition = getProgression("yam-bowling");
  const at = (level) => xpForLevel(definition.curves.track, level);

  assert.deepEqual(entitlementRewardsBetween(definition, "track", at(12), at(13), { trackId: "reina-sato" }), []);
  assert.deepEqual(
    entitlementRewardsBetween(definition, "track", at(1), at(30), { trackId: "reina-sato" })
      .map((entry) => entry.entitlementId),
    [
      "profile-icon:reina-sato:canon",
      "victory-pose:reina-sato:spotlight",
      "player-card:reina-sato:rivalry",
      "player-card:reina-sato:signature",
      "victory-pose:reina-sato:champion",
      "player-card:reina-sato:elite",
      "title:reina-sato:nameplate",
      "title:reina-sato:master",
    ],
  );
});

// The two mastery titles belong to the bowler who earned them, so the id is a
// template the grant resolves. Without a track there is nothing to resolve it
// to, and granting the literal placeholder would mint an id nothing can match.
test("a bowler-scoped mastery title is granted to the track that earned it", () => {
  const definition = getProgression("yam-bowling");
  const at = (level) => xpForLevel(definition.curves.track, level);

  // The summit pays only the reward scoped to the bowler who got there.
  assert.deepEqual(
    entitlementRewardsBetween(definition, "track", at(29), at(30), { trackId: "daisy-monroe" }),
    [
      { level: 30, entitlementId: "title:daisy-monroe:master", kind: "title" },
    ],
  );
  // Without a track to name there is no global fallback and nothing is granted.
  assert.deepEqual(entitlementRewardsBetween(definition, "track", at(29), at(30)), []);
  assert.ok(
    entitlementRewardsBetween(definition, "track", at(1), at(30))
      .every((entry) => !entry.entitlementId.includes("{track}")),
  );
});

// The two ladders are scored on different curves, so reading one with the
// other's curve would pay out at the wrong level rather than failing loudly.
test("each ladder is measured on its own curve", () => {
  const definition = getProgression("yam-bowling");
  assert.notEqual(definition.curves.player.base, definition.curves.track.base);

  const trackXpForLevel12 = xpForLevel(definition.curves.track, 12);
  assert.deepEqual(entitlementRewardsBetween(definition, "track", 0, trackXpForLevel12, { trackId: "reina-sato" }).at(-1), {
    level: 12,
    entitlementId: "player-card:reina-sato:signature",
    kind: "player-card",
  });
  // The same XP is a lower player level, so it must not pay the level-13 node.
  assert.ok(
    entitlementRewardsBetween(definition, "player", 0, trackXpForLevel12)
      .every((entry) => entry.level < 13),
  );
});

test("Yam Bowling registers every bowling-native career counter with its merge rule", () => {
  const definition = getProgression("yam-bowling");
  assert.deepEqual(definition.trackStats, {
    strikes: "sum",
    highGame: "max",
    quickGames: "sum",
    quickTotalScore: "sum",
    quickHighGame: "max",
    quickStrikeOpportunities: "sum",
    quickStrikes: "sum",
    quickSpareOpportunities: "sum",
    quickSpares: "sum",
    classicGames: "sum",
    classicTotalScore: "sum",
    classicHighGame: "max",
    classicStrikeOpportunities: "sum",
    classicStrikes: "sum",
    classicSpareOpportunities: "sum",
    classicSpares: "sum",
  });
});

test("an unknown ladder scope pays nothing rather than defaulting to a ladder", () => {
  const definition = getProgression("yam-bowling");
  assert.deepEqual(entitlementRewardsBetween(definition, "bowler", 0, 999999), []);
  assert.deepEqual(entitlementRewardsBetween(null, "player", 0, 999999), []);
});

// The end of the defect this milestone opened with: a reward the ladders can
// grant has to be a reward the garage validator will keep. The two registries
// are separate files by design, so nothing but a test stops them drifting.
test("every level-granted cosmetic survives a save once its entitlement exists", () => {
  const definition = getProgression("yam-bowling");
  const slotForKind = {
    "ball-trail": "ballTrail",
    "strike-burst": "strikeBurst",
    title: "title",
    badge: "badge",
    emote: "emote",
    room: "room",
    "profile-icon": "profileIcon",
    "victory-pose": "victoryPose",
    "player-card": "playerCard",
    entrance: "entrance",
  };
  const bowlerScopedKinds = new Set(["profile-icon", "victory-pose", "player-card"]);
  const rewards = [
    ...definition.levelEntitlements.player,
    ...definition.levelEntitlements.track,
  ].map((reward) => ({ ...reward, entitlementId: reward.entitlementId.replace("{track}", "reina-sato") }));
  assert.ok(rewards.length >= 40, "the diversified player ladder and sparse mastery ladder both contribute");

  for (const reward of rewards) {
    const slotName = slotForKind[reward.kind];
    assert.ok(slotName, `unmapped reward kind ${reward.kind}`);

    const raw = bowlerScopedKinds.has(reward.kind)
      ? { version: 1, bowlers: { "reina-sato": { [slotName]: reward.entitlementId } } }
      : { version: 1, global: { [slotName]: reward.entitlementId } };
    const saved = normalizeYamBowlingGarage(
      raw,
      { ownedEntitlementIds: new Set([reward.entitlementId]) },
    );
    assert.equal(
      bowlerScopedKinds.has(reward.kind)
        ? saved.bowlers["reina-sato"]?.[slotName]
        : saved.global[slotName],
      reward.entitlementId,
      `${reward.entitlementId} is granted at level ${reward.level} but stripped on save`,
    );
  }
});

test("a level cosmetic is still stripped for a player who has not earned it", () => {
  const saved = normalizeYamBowlingGarage(
    { version: 1, global: { badge: "title:shotmaker" } },
    { ownedEntitlementIds: new Set() },
  );
  assert.equal(saved.global.badge, undefined);
});

test("fixed match-achievement claims grant only the catalogued cosmetic", () => {
  for (const [achievementId, entitlementId, kind] of [
    ["perfect-game", "badge:perfect-game", "badge"],
    ["clean-card", "badge:clean-card", "badge"],
    ["turkey-club", "badge:turkey-club", "badge"],
    ["laser-focus", "badge:laser-focus", "badge"],
    ["split-decision", "badge:split-decision", "badge"],
    ["comeback-kid", "title:comeback-kid", "title"],
  ]) {
    const verdict = validateYamBowlingPublicClaim({
      playerId: "player-1",
      gameSlug: "yam-bowling",
      kind: "match-achievement",
      claimId: `match-achievement:${achievementId}`,
      sourceId: achievementId,
      payload: { achievementId, entitlementId: "title:forged" },
    });

    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.entitlementGrants, [{ entitlementId, kind }]);
  }
  assert.equal(validateYamBowlingPublicClaim({
    gameSlug: "yam-bowling",
    kind: "match-achievement",
    claimId: "match-achievement:invented",
    sourceId: "invented",
    payload: { achievementId: "invented" },
  }).ok, false);
});

test("promotion clears grant a fixed room pair and the circuit summit grants its penthouse", () => {
  const local = validateYamBowlingPublicClaim({
    gameSlug: "yam-bowling",
    kind: "circuit-clear",
    claimId: "circuit-clear:local-talia-dodson",
    sourceId: "local-talia-dodson",
    payload: { matchId: "local-talia-dodson", activeBowlerSlug: "daisy-monroe" },
  });
  assert.deepEqual(local.entitlementGrants.slice(1), [
    { entitlementId: "room:teal-lounge", kind: "room" },
    { entitlementId: "room:hot-pink-hideout", kind: "room" },
  ]);

  const summit = validateYamBowlingPublicClaim({
    gameSlug: "yam-bowling",
    kind: "circuit-clear",
    claimId: "circuit-clear:championship-reina-sato",
    sourceId: "championship-reina-sato",
    payload: { matchId: "championship-reina-sato", activeBowlerSlug: "daisy-monroe" },
  });
  assert.deepEqual(summit.entitlementGrants.slice(1).map((entry) => entry.entitlementId), [
    "room:black-gothic", "room:circuit-red", "room:tower-penthouse",
  ]);
});

test("voucher targets are restricted to alternate skins on canonical bowlers", () => {
  assert.deepEqual(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:daisy-monroe:maid"), {
    entitlementId: "skin:daisy-monroe:maid",
    bowlerSlug: "daisy-monroe",
    skinId: "maid",
  });
  assert.deepEqual(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:daisy-monroe:halloween"), {
    entitlementId: "skin:daisy-monroe:halloween",
    bowlerSlug: "daisy-monroe",
    skinId: "halloween",
  });
  assert.equal(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:daisy-monroe:canon"), null);
  assert.equal(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:not-a-bowler:maid"), null);
  assert.equal(validateYamBowlingSkinVoucherTarget("another-game", "skin:daisy-monroe:maid"), null);
});

test("the level-entitlement migrations backfill every node on both ladders", async () => {
  const definition = getProgression("yam-bowling");
  // Read as one corpus: a shipped migration is never edited, so a node bound
  // after 041 is backfilled by 042 and the next one by 043. What matters is
  // that every node is covered by *some* migration.
  const sql = (await Promise.all([
    "041-yam-bowling-level-entitlements.sql",
    "042-yam-bowling-mastery-rewards.sql",
    "043-yam-bowling-emote-and-title-rewards.sql",
    "044-yam-bowling-identity-rewards.sql",
    "045-yam-bowling-progression-reconciliation.sql",
  ].map((name) => readFile(new URL(`../src/db/migrations/${name}`, import.meta.url), "utf8")))).join("\n");

  // A node added to a ladder without a backfill leaves existing accounts owing
  // a reward they have already earned, which is the failure 040 exists to avoid.
  for (const reward of [...definition.levelEntitlements.player, ...definition.levelEntitlements.track]) {
    assert.ok(
      sql.includes(`'${reward.entitlementId}'`),
      `${reward.entitlementId} is granted at level ${reward.level} but never backfilled`,
    );
  }

  // A per-bowler title is one row per qualifying track, not per player, so its
  // backfill has to read game_xp_tracks rather than the best-track rollup.
  assert.match(sql, /replace\(reward\.entitlement_id, '\{track\}', tracks\.track_id\)/);

  // The player ladder reads the account total. The reconciled mastery ladder
  // evaluates each track independently because every remaining reward is tied
  // to the bowler that earned it.
  assert.match(sql, /from game_xp_profiles/);
  assert.match(sql, /from game_xp_tracks tracks/);
  assert.match(sql, /on tracks\.xp >= reward\.min_xp/);
  assert.match(sql, /on conflict \(player_id, game_slug, entitlement_id\) do nothing/);

  // Thresholds are literals so the migration keeps its meaning after a retune;
  // spot-check two against the curves they were derived from today.
  assert.ok(sql.includes(`${xpForLevel(definition.curves.player, 2)}`), "player level 2");
  assert.ok(sql.includes(`${xpForLevel(definition.curves.track, 30)}`), "bowler level 30");
});

test("career claims accept only bounded canonical match summaries", () => {
  const base = {
    gameSlug: "yam-bowling",
    kind: "career-match",
    claimId: "career-match:session-123",
    sourceId: "session-123",
    payload: { trackId: "daisy-monroe", outcome: "win", laneSlug: "royal-gold", spareAttempts: 3, spares: 3, sparePrefix: 3, spareSuffix: 3, spareBest: 3 },
  };
  assert.deepEqual(validateYamBowlingPublicClaim(base).careerStats, {
    trackId: "daisy-monroe",
    venueMask: 8,
    venueWinMask: 8,
    spareAttempts: 3,
    spares: 3,
    sparePrefix: 3,
    spareSuffix: 3,
    spareBest: 3,
    careerWins: 1,
  });
  for (const change of [
    { claimId: "career-match:another" },
    { payload: { ...base.payload, trackId: "invented" } },
    { payload: { ...base.payload, laneSlug: "invented" } },
    { payload: { ...base.payload, spareAttempts: 2, spares: 3 } },
  ]) assert.equal(validateYamBowlingPublicClaim({ ...base, ...change }).ok, false);
});

test("career spare streaks bridge clean matches and reset after a miss", () => {
  const bridged = mergeYamBowlingCareerStats(
    { careerSpareRun: 17, careerSpareBest: 17 },
    { spareAttempts: 3, spares: 3, sparePrefix: 3, spareSuffix: 3, spareBest: 3 },
    {},
  );
  assert.equal(bridged.careerSpareRun, 20);
  assert.equal(bridged.careerSpareBest, 20);

  const missed = mergeYamBowlingCareerStats(
    { careerSpareRun: 18, careerSpareBest: 18 },
    { spareAttempts: 5, spares: 4, sparePrefix: 2, spareSuffix: 2, spareBest: 2 },
    {},
  );
  assert.equal(missed.careerSpareRun, 2);
  assert.equal(missed.careerSpareBest, 20);
});

test("career badges evaluate all nine venues and all thirty canon bowlers", () => {
  const tracks = Object.fromEntries(YAM_BOWLING_BOWLER_SLUGS.map((slug) => [slug, { careerWins: 1 }]));
  Object.assign(tracks[YAM_BOWLING_BOWLER_SLUGS[0]], {
    careerVenueMask: YAM_BOWLING_ALL_VENUES_MASK,
    careerVenueWinMask: YAM_BOWLING_ALL_VENUES_MASK,
    careerSpareBest: 20,
  });
  assert.deepEqual(earnedYamBowlingCareerBadges(tracks), [
    "badge:precision-bowler", "badge:lane-legend", "badge:road-tested", "badge:deep-bench",
  ]);
  delete tracks[YAM_BOWLING_BOWLER_SLUGS.at(-1)];
  assert.equal(earnedYamBowlingCareerBadges(tracks).includes("badge:deep-bench"), false);
  assert.equal(YAM_BOWLING_BOWLER_SLUGS.length, 30);
});

test("the progression reconciliation adds an explicit draw counter", async () => {
  const sql = await readFile(
    new URL("../src/db/migrations/045-yam-bowling-progression-reconciliation.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /alter table game_xp_tracks[\s\S]*add column if not exists draws integer/i);
  assert.match(sql, /check \(draws >= 0\)/i);
});

test("XP persistence records and publishes draws separately from wins", async () => {
  const source = await readFile(new URL("../src/db/game-xp.mts", import.meta.url), "utf8");

  assert.match(source, /isDraw:\s*outcome === "draw"/);
  assert.match(source, /insert into game_xp_tracks[\s\S]*wins, draws, stats/i);
  assert.match(source, /draws = game_xp_tracks\.draws \+ excluded\.draws/);
  assert.match(source, /select track_id, xp, matches, wins, draws, stats/i);
  assert.match(source, /draws:\s*clampCount\(row\.draws\)/);
});

test("the voucher migration backfills existing level 10 and 25 players", async () => {
  const sql = await readFile(new URL("../src/db/migrations/040-yam-bowling-skin-vouchers.sql", import.meta.url), "utf8");
  assert.match(sql, /xp\s*>=\s*9000/i);
  assert.match(sql, /xp\s*>=\s*51000/i);
  assert.match(sql, /skin-voucher/i);
});
