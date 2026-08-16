import test from "node:test";
import assert from "node:assert/strict";

import {
  getYamBowlingTournamentEvent,
  selectYamBowlingTournamentPrize,
} from "../src/services/yam-bowling-tournament-catalog.mjs";
import { normalizeYamBowlingGarage } from "../src/services/yam-bowling-loadout-catalog.mjs";

test("Yam tournaments open for four days every other week", () => {
  const open = getYamBowlingTournamentEvent("2026-08-16T12:00:00.000Z");
  const closed = getYamBowlingTournamentEvent("2026-08-20T12:00:00.000Z");

  assert.equal(open.status, "open");
  assert.equal(open.event.id, "yam-major-0000");
  assert.equal(open.event.startsAt, "2026-08-14T00:00:00.000Z");
  assert.equal(open.event.endsAt, "2026-08-18T00:00:00.000Z");
  assert.equal(open.event.rounds.length, 3);
  assert.equal(open.event.rounds[2].modeId, "classic");
  assert.equal(open.event.rounds[2].cpuLevelId, "champion");

  assert.equal(closed.status, "closed");
  assert.equal(closed.event.id, "yam-major-0001");
  assert.equal(closed.event.startsAt, "2026-08-28T00:00:00.000Z");
});

test("the server rolls from tournament-only cosmetics with rare room and voucher outcomes", () => {
  const common = selectYamBowlingTournamentPrize({
    playerId: "player-1",
    eventId: "yam-major-0000",
    roll: 0,
    ownedEntitlementIds: [],
  });
  const rareVoucher = selectYamBowlingTournamentPrize({
    playerId: "player-1",
    eventId: "yam-major-0000",
    roll: 0.999999,
    ownedEntitlementIds: [],
  });

  assert.equal(common.kind, "entitlement");
  assert.match(common.entitlementId, /^(?:ball-trail|strike-burst):/);
  assert.equal(common.tier, "rare");
  assert.deepEqual(rareVoucher, {
    kind: "inventory",
    itemId: "skin-voucher",
    quantity: 1,
    name: "Skin Voucher",
    tier: "legendary",
  });
});

test("an owned prize is removed before the weighted roll and voucher remains the fallback", () => {
  const first = selectYamBowlingTournamentPrize({
    playerId: "player-1",
    eventId: "yam-major-0000",
    roll: 0,
    ownedEntitlementIds: [],
  });
  const rerolled = selectYamBowlingTournamentPrize({
    playerId: "player-1",
    eventId: "yam-major-0000",
    roll: 0,
    ownedEntitlementIds: [first.entitlementId],
  });
  const allEntitlements = [
    "ball-trail:championship-gold",
    "ball-trail:bracket-fire",
    "ball-trail:cosmic-ribbon",
    "ball-trail:royal-confetti",
    "strike-burst:pin-crown",
    "strike-burst:finals-fireworks",
    "strike-burst:cosmic-cup",
    "strike-burst:victory-ribbon",
    "room:champion-room",
  ];
  const fallback = selectYamBowlingTournamentPrize({
    playerId: "player-1",
    eventId: "yam-major-0000",
    roll: 0,
    ownedEntitlementIds: allEntitlements,
  });

  assert.notEqual(rerolled.entitlementId, first.entitlementId);
  assert.equal(fallback.itemId, "skin-voucher");
});

test("the authoritative loadout accepts every tournament cosmetic it can grant", () => {
  const tournamentIds = [
    "ball-trail:championship-gold",
    "strike-burst:pin-crown",
    "room:champion-room",
    "title:yam-champion",
  ];
  const garage = normalizeYamBowlingGarage({
    version: 1,
    featured: { bowlerSlug: "daisy-monroe", skinId: "canon" },
    global: {
      ballTrail: tournamentIds[0],
      strikeBurst: tournamentIds[1],
      room: tournamentIds[2],
      title: tournamentIds[3],
    },
  }, { ownedEntitlementIds: new Set(tournamentIds) });

  assert.deepEqual(garage.global, {
    ballTrail: tournamentIds[0],
    strikeBurst: tournamentIds[1],
    title: tournamentIds[3],
    room: tournamentIds[2],
  });
});
