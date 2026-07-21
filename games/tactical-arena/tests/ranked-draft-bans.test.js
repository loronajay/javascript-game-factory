import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBan,
  applyDraftPick,
  bannedTypes,
  canBanType,
  canDraftType,
  createDraftState,
  currentBanSeat,
  currentDraftSeat,
  draftPhase,
  draftPickOrder,
  isBanPhaseComplete,
} from "../src/ui/draftModel.js";

const OPEN = { isUnlocked: () => true };

test("a plain draft (no banFirstSeat) has no ban phase and the default pick order", () => {
  const draft = createDraftState({ seats: [1, 2] });
  assert.equal(isBanPhaseComplete(draft), true);
  assert.equal(currentBanSeat(draft), null);
  assert.equal(draftPhase(draft), "pick");
  assert.deepEqual(draftPickOrder(draft), [1, 2, 2, 1, 1, 2, 2, 1]);
  assert.equal(currentDraftSeat(draft), 1);
});

test("banFirstSeat=1 makes seat 1 ban first and gives up the first PICK to seat 2", () => {
  const draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 });
  assert.deepEqual(draft.banOrder, [1, 2]);
  assert.deepEqual(draftPickOrder(draft), [2, 1, 1, 2, 2, 1, 1, 2]);
  assert.equal(draftPhase(draft), "ban");
  assert.equal(currentBanSeat(draft), 1);
  // No picking allowed during the ban phase.
  assert.equal(currentDraftSeat(draft), null);
  assert.equal(canDraftType(draft, 2, "swordsman", OPEN), false);
});

test("banFirstSeat=2 keeps the default pick order (seat 1 picks first)", () => {
  const draft = createDraftState({ seats: [1, 2], banFirstSeat: 2 });
  assert.deepEqual(draft.banOrder, [2, 1]);
  assert.deepEqual(draftPickOrder(draft), [1, 2, 2, 1, 1, 2, 2, 1]);
  assert.equal(currentBanSeat(draft), 2);
});

test("bans alternate one each, then picking opens for the non-first-banner", () => {
  let draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 });

  assert.equal(canBanType(draft, 2, "archer", OPEN), false); // not seat 2's ban turn
  let r = applyBan(draft, { seat: 1, type: "archer", ...OPEN });
  assert.equal(r.accepted, true);
  draft = r.nextState;
  assert.equal(currentBanSeat(draft), 2);
  assert.equal(draftPhase(draft), "ban");

  r = applyBan(draft, { seat: 2, type: "mystic", ...OPEN });
  assert.equal(r.accepted, true);
  draft = r.nextState;

  assert.equal(isBanPhaseComplete(draft), true);
  assert.equal(draftPhase(draft), "pick");
  assert.equal(currentDraftSeat(draft), 2); // seat 1 banned first, so seat 2 picks first
  assert.deepEqual([...bannedTypes(draft)], ["archer", "mystic"]);
});

test("bans cover the WHOLE roster, including units you don't own", () => {
  const draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 });
  // No isUnlocked injected — ownership must be irrelevant for banning.
  assert.equal(canBanType(draft, 1, "necromancer"), true);
  assert.equal(canBanType(draft, 1, "sniper"), true);
  const r = applyBan(draft, { seat: 1, type: "necromancer" });
  assert.equal(r.accepted, true);
  assert.deepEqual([...bannedTypes(r.nextState)], ["necromancer"]);
});

test("a banned unit cannot be drafted by either seat", () => {
  let draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 });
  draft = applyBan(draft, { seat: 1, type: "archer", ...OPEN }).nextState;
  draft = applyBan(draft, { seat: 2, type: "mystic", ...OPEN }).nextState;
  // seat 2 picks first; try to draft a banned unit
  assert.equal(canDraftType(draft, 2, "archer", OPEN), false);
  assert.equal(canDraftType(draft, 2, "mystic", OPEN), false);
  assert.equal(applyDraftPick(draft, { seat: 2, type: "archer", ...OPEN }).accepted, false);
  // a non-banned unit is fine
  assert.equal(canDraftType(draft, 2, "swordsman", OPEN), true);
});

test("cannot ban the same unit twice, and cannot pick before bans finish", () => {
  let draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 });
  draft = applyBan(draft, { seat: 1, type: "archer", ...OPEN }).nextState;
  // seat 2 tries to ban the already-banned unit
  assert.equal(canBanType(draft, 2, "archer", OPEN), false);
  // and no one can draft yet
  assert.equal(applyDraftPick(draft, { seat: 2, type: "swordsman", ...OPEN }).accepted, false);
});

test("a full ranked draft with bans completes to two four-unit squads", () => {
  let draft = createDraftState({ seats: [1, 2], banFirstSeat: 2 });
  draft = applyBan(draft, { seat: 2, type: "archer", ...OPEN }).nextState;
  draft = applyBan(draft, { seat: 1, type: "mystic", ...OPEN }).nextState;
  // seat 2 banned first -> seat 1 picks first (default order)
  const order = draftPickOrder(draft);
  const pool = ["swordsman", "paladin", "necromancer", "magician", "sniper", "juggernaut", "monk", "angel"];
  let p = 0;
  for (let i = 0; i < order.length; i += 1) {
    const seat = currentDraftSeat(draft);
    const r = applyDraftPick(draft, { seat, type: pool[p++], ...OPEN });
    assert.equal(r.accepted, true, `pick ${i} accepted`);
    draft = r.nextState;
  }
  assert.equal(draftPhase(draft), "complete");
  assert.equal(draft.picks[1].length, 4);
  assert.equal(draft.picks[2].length, 4);
});
