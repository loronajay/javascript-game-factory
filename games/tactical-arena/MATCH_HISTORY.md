# Match History

How a finished match becomes a row a player can click, and why the model is shaped the
way it is. Ranked is the only recorded source today; the contract exists so the general
(all-modes) history tab can be added later without reshaping anything.

Code is the source of truth. This file records the decisions that are not obvious from
reading it.

## The one contract

`platform-api/src/db/match-history.mts` defines the single shape every match-history
surface reads. It is pure: no db handle, no clock, fully unit-tested in
`platform-api/tests/match-history-contract.test.mjs`.

A source subsystem owns its own storage and adapts its rows into a record; the contract
owns perspective, derivation, and normalization. Today the only adapter is
`platform-api/src/db/ranked-history.mts`.

```
MatchHistoryEntry {
  contractVersion, matchId, gameSlug,
  source,            // "ranked" — the recording subsystem, so a merged feed can group
  mode,              // "ranked-1v1"
  status,            // resolved | voided | disputed  (never a live match)
  rated,             // did this actually move a rating
  board, startedAt, endedAt, durationMs, turns,
  verified,          // was the final board cross-attested by both clients
  viewer: { playerId, seat, outcome, ratingBefore, ratingAfter, ratingDelta } | null,
  participants: [{
    playerId, seat, team, isViewer,
    displayName, title, avatarUnit, avatarSkin,
    outcome, ratingBefore, ratingAfter, ratingDelta,
    squad, unitsTotal, unitsAlive, unitsLost
  }],
  notes: [{ code, text }],
  hasDetail
}
// detail adds:
  units: [{ id, unitType, seat, playerId, isViewer, alive, kills }]
```

### Why these four rules

1. **Participant-shaped, not me/opponent-shaped.** Ranked is 1v1, but Tactical Arena
   already plays 3/4-player FFA and 2v2 Teams. A `me`/`opponent` payload would have to
   be redesigned the day casual matches start being recorded; a participant list with
   `seat`/`team` does not. The renderer collapses it to "you vs them".
2. **Viewer-relative, never viewer-stored.** A match is stored once. `viewerPlayerId`
   decides ordering (viewer first) and the `viewer` projection, so the same row reads
   "Victory +15" for one member and "Defeat -15" for the other, and neutrally for a
   spectator. The list and the popup run the same builder, so a row can never disagree
   with the detail it opens.
3. **Nothing is invented.** A field the source cannot attest is `null`. In particular a
   rating `before` with no `after` yields `ratingDelta: null`, not `0` — the two mean
   very different things, and the UI drops unknown values from the meta row instead of
   rendering a dash. (`intOrNull` guards this explicitly: `Number(null)` is `0`, which
   would have printed a -1200 delta on every voided match.)
4. **Note text belongs to the adapter.** Flag vocabularies are source-specific, so the
   contract only normalizes `{ code, text }` pairs. `platform-api/tests/architecture.test.mjs`
   fails if ranked vocabulary leaks into the contract module.

## What makes it server-authoritative

The client sends a result report; it never sends a history record. Everything shown in
the popup is read back from `ranked_matches`, and two rules keep a single client from
writing its own story:

- **The per-unit final board is exposed only when both members' reports agree.** This is
  the same dual-attestation that gates per-unit stat crediting
  (`ranked-unit-stats.mts`). One side's unopposed report is never presented as fact —
  the popup falls back to squad names with no survival claim attached and shows a
  `board_unverified` note explaining why.
- **Squads for a verified match come from that cross-attested board,** not from either
  player's self-reported `squad_a`/`squad_b` column. A client that lies about what it
  brought is overridden by the board both clients confirmed.

`turns` rides on the same attestation: it comes from deterministic `state.turnNumber`,
and the server compares it across both reports. It is compared only when *both* sides
sent it, so a client predating the field still reaches agreement rather than silently
costing the pair its per-unit stat credit.

## Endpoints

```
GET /ranked/:gameSlug/matches/:playerId[?limit=]      list, that player's perspective
GET /ranked/:gameSlug/match/:matchId[?perspective=]   one match in full
```

Both require a signed-in caller and are otherwise public reads, matching the existing
ranked card/leaderboard reads. `perspective` defaults to the caller and must be a member
of the match (403 `not_a_member` otherwise) — it exists so a history list opened for
another player keeps *their* outcome rather than flipping to the reader's, which is what
the general history tab and any future "view a friend's matches" surface will need.

Only finished matches are readable. A live `ranked_matches` row carries the lobby token
and seed, so the detail query filters on `status in ('resolved','voided','disputed')`
and never selects those columns.

## Client

| Module | Owns |
| --- | --- |
| `src/ui/rankedMatchDetailModel.js` | Pure view-model shaping for both the row and the popup. No DOM, so it is tested under `node --test`. |
| `src/ui/rankedMatchHistory.js` | The "Recent Matches" list; each row is a button that opens the popup. |
| `src/ui/rankedMatchDetail.js` | The popup itself, layered as a second `.ref-modal` over the ranked profile. |

The popup stops Escape propagation so closing it leaves the ranked profile beneath it
open.

## Adding a second source later

The general history tab is a new *adapter*, not a new contract:

1. Record casual/campaign results somewhere (there is no such table today — casual
   online matches are currently not persisted at all).
2. Write an adapter beside `ranked-history.mts` that maps those rows into a
   `MatchHistoryRecord` and supplies its own note text.
3. Merge adapter outputs by `endedAt`. `source` and `mode` are already on every entry,
   so a mixed feed can group and filter without inspecting shapes.

One thing to be honest about when that happens:

- **A single-player source cannot be dual-attested.** `verified` will be `false` for
  anything with only one client, so those entries should either present squads without
  survival claims (as the unverified ranked path already does) or the source must define
  its own trust story.

## Per-unit kills

`kills` is real and rendered. Attribution lives in `src/core/killAttribution.js`: callers
open a credit *scope* around a chunk of resolution, and whatever died inside it is
attributed to that scope's killer. Scopes nest and the innermost wins, so a fire tick or a
self-sacrifice claims its death before the broad per-command scope sweeps up the rest.

The rules that matter when reading these numbers:

- **Kills need not add up to deaths.** Environmental deaths (Black Death, void pressure,
  authored mission fire) and self-inflicted ones (self-destruct ARTS, the Beckoned-ghost
  sacrifice) credit nobody by design. `deathCause` records which it was.
- **Friendly fire and self-kills never count.** They are recorded in `killedBy` so the UI
  can still explain a death, but they do not increment anyone's tally.
- **Fire and poison carry their own credit.** Fire tiles store `ownerId` and damaging
  statuses store `appliedBy`, so a burn or a poison tick credits whoever lit or applied it
  rather than whoever happened to be acting at the rollover.
- **Trust is unchanged.** `kills` rides the same both-clients-must-agree attestation as
  `alive` (`buildRankedUnitReport` → `unitReportsAgree`). A client that inflated its own
  tally would simply disagree with its opponent and have the whole report dropped.
  `unitReportsAgree` compares `kills` only when *both* sides sent it, matching the `turns`
  precedent, so a pre-kills client never silently costs the pair its survival stats.

`kills`/`killedBy`/`deathCause` are deliberately **not** in the authoritative state hash —
they never affect legality, damage, or the RNG. Fire's `ownerId` *is* hashed, because
`tileObjects` is hashed wholesale; that is why `ONLINE_RULESET_VERSION` went to 3.
