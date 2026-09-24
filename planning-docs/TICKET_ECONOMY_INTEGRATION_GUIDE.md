# Ticket Economy Integration Guide

Status: the platform wallet is shipped with ten cabinets paying out: Lovers Lost (through its achievement run) and Battleshits, Sumorai, Mini-Tactics, Bird Duty, Illuminauts, Creature Battler, Shark Hall, Mini Hoops and Puck'd Up (through the generic result route, below). Still to do: Echo Duel (its online session controller is a known hotspot — extract first), Cockpit Swarm (campaign clears want a `campaign-clear:` key of their own), then Build Buddy, Circuit Siege, Speed Demon, Yam Bowling, Hide and Seek and Orbit Pong. This document is the contract for adding ticket payouts to another cabinet. Tactical Arena is deliberately a separate pass: its campaign, competitive and CPU modes need a richer formula, and its Valor is a TA-only currency unrelated to tickets.

## The fast path: `POST /games/:slug/results`

A cabinet with no achievement run to ride on uses the generic result path. This is the default now, and adding a game is four small pieces:

1. `platform-api/src/services/<slug>-ticket-rewards.mts`: export `normalize<Game>Result(raw)` (returns `{ result }` or `{ error }`; build it on `game-result-shared.mts`, and the result must carry `resultId` and `durationMs`) and a pure `calculate<Game>TicketReward({ result })`.
2. Register the normalizer in `services/game-result-catalog.mts` and the formula in `services/ticket-reward-catalog.mts`.
3. `games/<slug>/scripts/ticket-result.js`: a pure builder from match state to the result payload (no amount, and `null` for modes that pay nothing).
4. In the cabinet, `createGameResultId(prefix)` when the match starts and `createGameResultReporter().report(slug, payload)` once when it ends (`js/platform/api/game-results-api.mjs`). Spend the id on report.

The route, settlement, ledger, dedupe, replay and balance publish are shared; `db/game-results.mts` is the reference. References: `battleshits-ticket-rewards.mts` and `sumorai-ticket-rewards.mts` plus their tests, `game-result-settlement.test.mjs`. A cabinet that imports platform code lazily so it can boot standalone (Bird Duty, Illuminauts) uses a small `scripts/ticket-reporter.js` that wraps the reporter behind a dynamic `import()`.

**Rules learned the hard way:**
- **Completion must be earned by time.** Measure how fast a player can *throw* a match (stand still against the hardest CPU). If a flat completion payout divided by that time beats the hourly target, accrue completion per second of match instead (Sumorai: 1 per 15 s; Battleshits: 1 per 9 s).
- **So must any bonus worth more than the fence can bound.** A win bonus can stay flat only if the normalizer's duration floor makes a forged win cost real time. Mini-Tactics' floor is loose (a quarter second a turn), so a faked 4-second win paid 25 until its win bonus accrued at 1 per 12 s too. Bird Duty solo is score-driven, and ten blind drops scored 35, so its total is capped at 1 per 7 s. Before settling a formula, play the laziest possible run and a forged one through the real normalizer.
- **The page must load `js/platform-config.mjs`.** Without it the client's API URL is empty everywhere except localhost, so `canReport()` is false in production and nothing is filed, silently. A localhost test will not catch this; check the cabinet's `index.html`, and add a test that reads it (Shark Hall and Puck'd Up do).
- **A server-decided forfeit can look like an ordinary win.** Shark Hall's network server ends a match for whoever stayed when a seat walks, and the cabinet hears a normal `win` event. Find how *this* cabinet surfaces a forfeit (a disconnected seat, a `reason: 'forfeit'`, a `'disconnect'` overlay) and have the pure builder decline it.
- **A classic-script global is not on `window`.** `const state` at the top of a classic script is a lexical global; a module reading `window.state` gets `undefined`. Creature Battler's end hook now passes the facts explicitly.
- **The time-budget fence** in `db/game-results.mts` rejects any result claiming more play time than has elapsed since the player's previous result on this path. It is the only thing bounding a forger, so every normalizer must require an honest `durationMs` and refuse durations faster than the game's own floor (shot animations, round banners).

## Start here

Tickets are factory-wide account currency. The platform owns the wallet, ledger, prices, and durable identity. A cabinet owns gameplay and produces facts about a completed result; it never owns a balance and never names a ticket amount.

Reference files:

- `platform-api/src/db/tickets.mts` — wallet creation and atomic/idempotent ledger credits.
- `platform-api/src/db/migrations/049-ticket-wallets.sql` — wallet and transaction tables.
- `platform-api/src/services/ticket-reward-catalog.mts` — the one registry for per-game payout evaluators.
- `platform-api/src/services/lovers-lost-ticket-rewards.mts` — reference pure payout formula and explicit achievement rewards.
- `platform-api/src/db/achievements.mts` — reference atomic settlement: result verdict, unlocks, ticket credit, and replay record commit together.
- `platform-api/src/db/migrations/050-achievement-run-ticket-rewards.sql` — stored replay verdict for achievement-backed results.
- `js/platform/api/ticket-wallet.mts` — balance reads and the shared balance-update event.
- `platform-api/tests/lovers-lost-ticket-rewards.test.mjs` and `lovers-lost-ticket-settlement.test.mjs` — minimum test shape.

Do not modify migrations 049 or 050 after deployment. Add a new numbered migration for schema changes.

## Locked economy rules

| Result | Rule |
|---|---|
| Fresh account | 5,000 tickets exactly once |
| Local hotseat/shared-screen PvP | 0 repeatable tickets |
| Practice/tutorial/debug | 0 |
| Completed eligible solo/CPU/online result | Eligible under that cabinet's server formula |
| Online loss | Gets the configured completion payout |
| Early quit, disconnect, invalid result, or AFK | 0 unless a cabinet has server evidence for a legitimate completion |
| Achievement | One-time explicit reward |
| Rematch | Normal reward for another real completed result |
| Duplicate result ID | Replay the stored verdict; 0 additional mint |
| Client-provided `tickets`, `reward`, or price | Never accepted |

The balancing target is roughly 450–600 tickets per median active hour, with strong play around 600–800. Do not add a global daily cap. Measure `ticketsEarned / activeMinutes` per cabinet and tune that cabinet's formula.

## The required architecture

Every integration has four parts:

1. **A stable result ID.** Mint it once when a match/run begins and reuse it for retries. Never mint a new ID because a request timed out.
2. **A server normalization or attestation seam.** Convert untrusted input into a bounded result shape. Reject impossible modes, counts, timing, scores, ownership, completion states, and identifiers before opening an economy transaction.
3. **A pure reward evaluator.** It receives normalized facts and returns a breakdown. Add it to `ticket-reward-catalog.mts`. It must not read the DOM, storage, network, wallet, or a client-supplied amount.
4. **One atomic settlement transaction.** Lock/deduplicate the result, determine newly inserted achievements, calculate the reward, call `awardTicketsInTransaction`, store the ticket verdict beside the result, then commit. A retry returns the stored verdict and current balance without awarding again.

The transaction key format is namespaced and stable, for example:

```text
achievement-run:lovers-lost:<runId>
game-result:battleshits:<matchId>
campaign-clear:cockpit-swarm:<playerId>:<stageId>:<clearId>
```

The database also enforces uniqueness on `(player_id, transaction_key)`. This is a second fence, not a replacement for storing the result verdict.

## Choose the evidence path before coding

### Deterministic solo games

Short term: submit bounded telemetry and reject impossible results, as Lovers Lost currently does. Document that this is a plausibility gate, not proof.

Long term: submit an input log/seed and replay it server-side. Once tickets are meaningful, replay validation is the desired authority for deterministic games.

### CPU matches

Normalize mode, difficulty, completion, score/outcome, and duration. The server applies any Easy/Normal/Hard multiplier; the client sends only the difficulty that was played. Refuse sandbox or custom settings that trivialize the match.

### Online matches

Prefer an authoritative match record or network-server attestation keyed by match ID and participant. Never accept each peer's independent claim as proof of the same match. Settle each participant once from the authoritative outcome; completion rewards may pay both sides, while win/performance bonuses follow the recorded result.

### Local shared-screen

It may unlock achievements, but repeatable tickets are zero. This prevents instant self-farming without blocking trophy play.

## Implementation recipe

Follow TDD and keep `.mts`/generated `.mjs` synchronized.

1. Read the cabinet's `GDD.md`, local `CLAUDE.md`, and local `AGENTS.md`.
2. Identify its terminal result transition and existing server record. Do not bolt payout logic into rendering or a giant entry point.
3. Write tests for the payout table first: win/loss, difficulty, mode exclusions, early quit, performance caps, and maximum tickets per result.
4. Add `platform-api/src/services/<slug>-ticket-rewards.mts` with one pure calculator and explicit achievement reward map if the game has achievements.
5. Register the calculator in `ticket-reward-catalog.mts`.
6. Add settlement tests proving atomic credit, duplicate-ID replay, token/player ownership, and rollback behavior.
7. Reuse an existing authoritative transaction when possible. If none exists, add a focused result route/service; never add a generic public `/award-tickets` or `/claim-tickets` route.
8. Persist at least `ticket_awarded` and `ticket_breakdown` on the deduplicated result record. Existing pre-ticket rows must default to zero so old IDs cannot be replayed for retroactive currency.
9. Return this stable response shape:

```json
{
  "tickets": {
    "awarded": 20,
    "balance": 5020,
    "repeatable": 20,
    "achievements": 0,
    "breakdown": {}
  }
}
```

10. Have the shared client call `publishTicketBalance(balance)` after settlement. Do not create a cabinet-owned balance cache.
11. Rebuild both TypeScript projects and run the focused tests, cabinet suite, full API suite, and `npm run verify:build`.

## Reward evaluator template

```ts
export function calculateExampleTicketReward({ result, unlockedIds = [] }: {
  result: NormalizedExampleResult;
  unlockedIds?: readonly string[];
}) {
  if (!result.completed || result.mode === "local" || result.practice || result.disconnected) {
    return { repeatable: { total: 0 }, achievements: [], achievementTotal: 0, total: 0 };
  }

  const completion = 20;
  const win = result.won ? 15 : 0;
  const repeatable = { completion, win, total: completion + win };
  const achievements = [...new Set(unlockedIds)]
    .map((id) => ({ id, amount: ACHIEVEMENT_REWARDS[id] || 0 }))
    .filter((entry) => entry.amount > 0);
  const achievementTotal = achievements.reduce((sum, entry) => sum + entry.amount, 0);
  return { repeatable, achievements, achievementTotal, total: repeatable.total + achievementTotal };
}
```

## Achievement reward ladder

Use explicit values, never achievement points or tree depth automatically:

| Difficulty | Tickets |
|---|---:|
| Routine/progression | 50 |
| Moderate skill | 100 |
| Hard | 250 |
| Very hard | 500 |
| Major mastery | 1,000 |
| Exceptional/legendary | 1,500–2,500 |
| Signature exceptional feat | Up to 5,500, once only |

A completeness test must compare the reward-map keys with the cabinet's achievement definition IDs. That makes adding an achievement without pricing it a failing test.

## Review checklist

- No request body field controls the amount.
- Acting player comes from verified auth/server match membership, never a body `playerId`.
- Local/practice/debug/quit/disconnect paths are explicitly tested.
- Reward components and total have hard caps.
- Online ownership cannot pay one player for a partner's performance.
- Result ID and ledger transaction key are unique and stable.
- Verdict is stored and replayed; retries do not recalculate against changed rules.
- Achievement rewards apply only to rows newly inserted in this transaction.
- Wallet credit and game-result persistence share one database transaction.
- Client failure never blocks the cabinet's end-of-match flow.
- Shared balance UI updates after a successful settlement.
- Median tickets/hour estimate is recorded for later telemetry comparison.
- The cabinet's `index.html` loads `js/platform-config.mjs`.

## Median tickets/hour estimates (to compare against telemetry)

| Cabinet | Estimate |
|---|---|
| Battleshits | CPU Medium ~5-min win 35 → ~420/h |
| Sumorai | fast flawless Hard Bo5 ~700/h (strong band) |
| Mini-Tactics | 10-min Normal CPU win 75 → ~450/h; Hard ~510/h; ending every turn untouched ≤360/h |
| Bird Duty | careful 50 s solo run scoring 60 → 7 (~500/h); blind spray ~420/h; online 2P 2.5 min → 20 (~480/h) |
| Illuminauts | 90 s Sprint under par 14 → ~560/h; 4-min Sweep under par 34 → ~510/h |
| Creature Battler | 4-min training win 34 (held by the 7 s ceiling) → ~510/h; loss 24 → ~360/h; 6-min online win 45 → ~450/h |
| Shark Hall | 4-min Sharp CPU rack win 34 → ~510/h; 5-min Club win 35 → ~420/h; online race to 3 in 15 min, win 100 → ~400/h, loss 75 → ~300/h |
| Mini Hoops | 30 s run with 12 made → 6 per ~40 s cycle → ~540/h; 7 made → ~360/h; blind spam (2 made) → ~180/h |
| Puck'd Up | 3.5-min win vs Viper 27 → ~460/h; 4-min win vs the Ace 35 → ~525/h; loss 20 → ~300/h |

## Lovers Lost reference behavior

Repeatable eligible solo/online lane: 5 completion, `floor(perfects / 20)` capped at 5, 3 for no Misses, 2 for finishing within 60 seconds, and 5 for an all-Perfect lane. Maximum 20. Local mode, disconnects, and unfinished owned lanes earn zero repeatable tickets. Online evaluates only the submitting account's owned lane.

All 23 achievements have explicit one-time values. `ll_perfect_run` is the 5,500-ticket signature jackpot; it is never part of repeatable payout. The complete verdict is settled by `submitAchievementRun` because that route already owns the normalized, deduplicated run transaction.
