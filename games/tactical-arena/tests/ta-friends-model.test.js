import test from "node:test";
import assert from "node:assert/strict";

import {
  canBlockRelationship,
  filterTaPlayers,
  nextRelationshipAfter,
  taFriendsTabCounts,
  taPlayerName,
  taPlayerRecordLine,
  taRelationshipAction,
  taSocialErrorMessage,
} from "../src/ui/taFriendsModel.js";

test("a player name prefers a real display name over the generic factory default", () => {
  assert.equal(taPlayerName({ displayName: "Bobcat", tagline: "Never skips bans" }), "Bobcat");
  // "Commander" is the factory's placeholder, so a chosen tagline beats it.
  assert.equal(taPlayerName({ displayName: "Commander", tagline: "Never skips bans" }), "Never skips bans");
  assert.equal(taPlayerName({ displayName: "commander" }), "commander", "with nothing better, show what they have");
  assert.equal(taPlayerName({}), "Commander", "never blank");
  assert.equal(taPlayerName({}, { fallback: "Unknown" }), "Unknown");
});

test("the record line pairs rating with W/L/D and stays honest when unranked", () => {
  assert.equal(taPlayerRecordLine({ rating: 1300, wins: 5, losses: 1, draws: 2 }), "1300 · 5W / 1L / 2D");
  assert.equal(taPlayerRecordLine({ rating: null, wins: 0, losses: 0, draws: 0 }), "No ranked record yet");
  // A record without a rating row still shows the record rather than claiming none.
  assert.equal(taPlayerRecordLine({ rating: null, wins: 1, losses: 0, draws: 0 }), "1W / 0L / 0D");
  assert.equal(taPlayerRecordLine({}), "No ranked record yet");
});

test("each relationship maps to exactly one primary action", () => {
  assert.equal(taRelationshipAction("none").action, "send");
  assert.equal(taRelationshipAction("request-sent").action, "cancel");
  assert.equal(taRelationshipAction("request-received").action, "accept");
  assert.equal(taRelationshipAction("friend").action, "remove");
  assert.equal(taRelationshipAction("blocked").action, "unblock");
  assert.equal(taRelationshipAction("self").action, null);
  // An unknown value must not crash a row; treat it as a stranger.
  assert.equal(taRelationshipAction("nonsense").action, "send");
  assert.equal(taRelationshipAction(undefined).action, "send");
});

test("block is offered for strangers and friends, never for yourself or the already-blocked", () => {
  assert.equal(canBlockRelationship("none"), true);
  assert.equal(canBlockRelationship("friend"), true);
  assert.equal(canBlockRelationship("request-received"), true);
  assert.equal(canBlockRelationship("self"), false);
  assert.equal(canBlockRelationship("blocked"), false);
});

test("filtering matches name, tagline, id and rating, case-insensitively", () => {
  const players = [
    { playerId: "p1", displayName: "Bobcat", tagline: "Never skips bans", rating: 1300 },
    { playerId: "p2", displayName: "Carol", tagline: "Turtle main", rating: 1100 },
  ];
  assert.deepEqual(filterTaPlayers(players, "bob").map((p) => p.playerId), ["p1"]);
  assert.deepEqual(filterTaPlayers(players, "TURTLE").map((p) => p.playerId), ["p2"]);
  assert.deepEqual(filterTaPlayers(players, "1300").map((p) => p.playerId), ["p1"]);
  assert.deepEqual(filterTaPlayers(players, "p2").map((p) => p.playerId), ["p2"]);
  assert.equal(filterTaPlayers(players, "   ").length, 2, "a blank filter shows everything");
  assert.deepEqual(filterTaPlayers(null, "bob"), []);
});

test("tab counts surface incoming requests as the only actionable badge", () => {
  const counts = taFriendsTabCounts({
    friends: [1, 2, 3],
    incoming: [1, 2],
    outgoing: [1],
    blocked: [],
  });
  assert.equal(counts.friends, 3);
  assert.equal(counts.requests, 2);
  assert.equal(counts.blocked, 0);
  // Outgoing requests need nothing from the player, so they don't drive the badge.
  assert.equal(counts.actionable, 2);
  assert.deepEqual(taFriendsTabCounts(), { friends: 0, requests: 0, outgoing: 0, blocked: 0, actionable: 0 });
});

test("a successful action implies the next relationship without a refetch", () => {
  assert.equal(nextRelationshipAfter("send", { status: "pending" }), "request-sent");
  // Two people adding each other at once resolves straight to friends.
  assert.equal(nextRelationshipAfter("send", { status: "auto_accepted" }), "friend");
  assert.equal(nextRelationshipAfter("accept", { status: "accepted" }), "friend");
  assert.equal(nextRelationshipAfter("decline", { status: "declined" }), "none");
  assert.equal(nextRelationshipAfter("cancel", { status: "canceled" }), "none");
  assert.equal(nextRelationshipAfter("remove", { status: "removed" }), "none");
  assert.equal(nextRelationshipAfter("block", { status: "blocked" }), "blocked");
  assert.equal(nextRelationshipAfter("unblock", { status: "unblocked" }), "none");
});

test("a failed or refused action never invents a new relationship", () => {
  assert.equal(nextRelationshipAfter("send", null), null, "network failure");
  assert.equal(nextRelationshipAfter("send", { error: "blocked" }), null, "server refusal");
  assert.equal(nextRelationshipAfter("accept", { error: "request_not_pending" }), null);
  assert.equal(nextRelationshipAfter("nonsense", { status: "ok" }), null);
});

test("server error codes become readable copy, never raw codes", () => {
  assert.match(taSocialErrorMessage("already_friends"), /already friends/i);
  assert.match(taSocialErrorMessage("blocked"), /blocked/i);
  assert.match(taSocialErrorMessage("request_not_pending"), /already answered/i);
  assert.equal(taSocialErrorMessage(""), "");
  // An unrecognized code must not leak into the UI.
  const unknown = taSocialErrorMessage("some_new_server_code");
  assert.doesNotMatch(unknown, /some_new_server_code/);
  assert.match(unknown, /try again/i);
});
