# POT OF GREED

**Document Version:** 1.0  
**Status:** Prototype Scope  
**Host Platform:** Jaybox  
**Player Count:** 4–8  
**Input Model:** Shared display plus one phone per player  
**Target Match Length:** 15–25 minutes  

---

## 1. Game Overview

Pot of Greed is a browser-based social deduction party game for one shared public display and private mobile controllers.

It is the first cabinet available in Jaybox. Jaybox provides the room, display, and private controller sessions; this document defines the game that runs inside that session.

The shared display presents public game information, timers, vault audits, balance checks, vote results, player lockouts, and final results. Each player uses a phone as a private controller.

For the platform responsibilities and room lifecycle that precede this game, see the [Jaybox GDD](../jaybox-gdd.md).

---

## 2. High Concept

Every player begins with a private amount of gold.

A shared vault contains additional gold.

During repeated vault cycles, players with vault access secretly choose whether to:

- Invest personal gold for a delayed return.
- Steal gold from the shared vault.
- Take no action.

The server reports how much the vault changed, but it does not reveal who performed each action.

Players discuss what they believe happened and secretly vote to remove one active player from future vault access.

A removed player remains in the match as a jury player. Jury players continue discussing, voting, earning vote rewards, receiving pending investment returns, and competing for the final wealth victory.

There is no assigned culprit.

Any active player may steal during any eligible cycle. Multiple players may steal during the same cycle.

The player with the most personal gold at the end of the match wins.

---

## 3. Design Pillars

### 3.1 Greed Creates the Mystery

The game does not randomly assign an evil role.

Suspicion is created by player decisions.

A player may invest honestly during one cycle, steal during another, and vote correctly or incorrectly throughout the match.

### 3.2 Wealth Is the Victory Condition

The goal is not simply to expose thieves.

The winner is the player with the most gold.

Investment, theft, vote rewards, wrongful accusation compensation, and risk management all contribute to the final result.

### 3.3 Public Information Is Delayed

Players always know their own balance.

The group sees every balance only during scheduled Show Cycles.

This creates ambiguity between:

- Investment returns.
- Theft.
- Vote rewards.
- Vote penalties.
- Wrongful accusation compensation.
- Previous balance changes that were not publicly shown.

### 3.4 Removal Does Not End Participation

A player who loses vault access becomes a jury player.

Jury players remain socially and economically relevant.

They can still:

- Participate in discussion.
- Cast secret votes.
- Earn correct-vote bonuses.
- Lose gold for wrongful votes.
- Receive pending investment returns.
- Win the match.

### 3.5 Votes Carry Financial Risk

A vote is not free.

Correctly helping remove a thief earns gold.

Helping remove an innocent player costs gold.

A wrongly removed player receives compensation.

### 3.6 Caught Theft Is Punished, Not Erased

A caught thief does not lose all stolen gold.

They pay a partial fine based on the amount they successfully stole during the current cycle.

This preserves theft as a viable strategy while making detection costly.

---

## 4. Player States

Every player is always in one of two states.

### 4.1 Active Player

An active player:

- Has vault access.
- Participates in vault actions.
- Participates in discussion.
- Casts one secret vote.
- May be targeted by votes.
- Can earn vote rewards and penalties.
- Can win the game.

### 4.2 Jury Player

A jury player has already been removed from vault access.

A jury player:

- Cannot invest.
- Cannot steal.
- Cannot pass as a vault action because they no longer receive vault prompts.
- Cannot be targeted by future votes.
- Continues participating in discussion.
- Continues casting one secret vote each cycle.
- Can earn correct-vote bonuses.
- Can lose gold for wrongful votes.
- Receives pending investment returns.
- Retains all existing personal gold.
- Can still win the game.

Removal is an economic restriction, not player elimination.

---

## 5. Prototype Economy

All prototype values must be stored in configuration rather than hardcoded throughout the server and clients.

### 5.1 Starting Personal Gold

Each player begins with:

```text
20 gold
```

Personal balances remain private except during Show Cycles and final results.

### 5.2 Starting Vault Value

The shared vault begins with:

```text
12 gold × player count
```

Examples:

```text
4 players: 48 gold
6 players: 72 gold
8 players: 96 gold
```

### 5.3 External Bank

Investment returns, vote rewards, and wrongful accusation compensation are paid by the game bank.

They are not removed from the shared vault.

The vault changes only through:

- Investments entering the vault.
- Theft removing gold from the vault.
- Future mechanics that explicitly modify the vault.

### 5.4 Gold Floor

A personal balance cannot fall below zero.

Any penalty larger than the player’s current balance reduces that balance to zero.

---

## 6. Cycle Structure

The game alternates between two cycle types:

```text
Cycle 1: Hidden Cycle
Cycle 2: Show Cycle
Cycle 3: Hidden Cycle
Cycle 4: Show Cycle
```

The cycle type is always shown on the shared display.

---

## 7. Hidden Cycle

During a Hidden Cycle, active players may invest, steal, or pass.

Personal balances are not publicly shown.

### Hidden Cycle Sequence

1. Vault action
2. Simultaneous vault resolution
3. Vault audit
4. Discussion
5. Secret vote
6. Vote result
7. Selected player action reveal
8. Correct or wrongful accusation resolution
9. Partial theft fine if applicable
10. Player lockout
11. Private rewards and penalties
12. Advance to Show Cycle

---

## 8. Show Cycle

During a Show Cycle, investments from the previous Hidden Cycle mature.

Active players may steal or pass.

New investments cannot be created during a Show Cycle.

### Show Cycle Sequence

1. Pending investments mature
2. Vault action
3. Simultaneous vault resolution
4. Vault audit
5. Public balance reveal
6. Discussion
7. Secret vote
8. Vote result
9. Selected player action reveal
10. Correct or wrongful accusation resolution
11. Partial theft fine if applicable
12. Player lockout
13. Private rewards and penalties
14. Advance to Hidden Cycle

---

## 9. Vault Actions

All vault actions are selected privately and resolved simultaneously by the server.

### 9.1 Invest

Available only during Hidden Cycles.

The player spends personal gold immediately.

The invested amount enters the shared vault.

The player receives a larger return at the beginning of the next Show Cycle.

Initial investment packages:

| Cost Now | Return Next Show Cycle | Profit |
|---:|---:|---:|
| 3 | 6 | 3 |
| 5 | 11 | 6 |
| 8 | 18 | 10 |

Example:

```text
Current personal balance: 20
Investment selected: 5
Immediate personal balance: 15
Vault receives: 5

Next Show Cycle:
Player receives: 11
```

Investment rules:

- One investment may be selected per Hidden Cycle.
- A player cannot invest more gold than they currently hold.
- Investments cannot be cancelled after lock-in.
- Pending investments still mature if the player is later moved to the jury.
- Investment returns are paid by the bank.
- Investment returns do not reduce the vault.
- Investment must be disabled if no future Show Cycle or final settlement can pay it.

### 9.2 Steal

Available during Hidden and Show Cycles.

The player secretly removes gold from the vault and adds it to their personal balance.

Initial theft packages:

```text
Steal 3
Steal 5
Steal 8
```

A player who selects Steal is considered a thief for that cycle, even if the vault cannot satisfy the full requested amount.

The actual amount successfully received is used for the partial fine.

### 9.3 Pass

Available during Hidden and Show Cycles.

The player makes no change to their balance or the vault.

Pass does not count as theft.

### 9.4 Timeout

An active player who fails to lock an action before the timer expires automatically Passes.

---

## 10. Simultaneous Vault Resolution

All active actions resolve together after every active player locks an action or the timer expires.

Resolution order:

1. Validate all submitted actions.
2. Convert missing submissions to Pass.
3. Deduct investment costs from personal balances.
4. Add all investments to the vault.
5. Calculate the available vault total.
6. Resolve all theft requests.
7. Add successful theft amounts to thief balances.
8. Record requested and actual theft amounts.
9. Record every player’s resolved action.
10. Calculate the final vault value.

### 10.1 Insufficient Vault Funds

If total requested theft exceeds the available vault balance, payouts are reduced proportionally.

Recommended deterministic formula:

```text
player share =
available vault × player requested theft / total requested theft
```

Fractional results are rounded down.

Any remaining gold is distributed one unit at a time using a deterministic server order.

The public display does not reveal which thieves received reduced payouts.

A player still counts as a thief for that cycle if they selected Steal.

---

## 11. Vault Audit

After vault actions resolve, the shared display reveals:

```text
Vault before actions
Vault after actions
Net vault change
```

Example:

```text
Vault before: 72
Vault after: 79
Net change: +7
```

The audit does not reveal:

- Total invested.
- Total stolen.
- Number of investors.
- Number of thieves.
- Individual actions.

During a Hidden Cycle, the net change may include both investments and theft.

Example:

```text
Investments: +15
Theft: -8
Public audit: +7
```

During a Show Cycle, no new investments occur.

A negative Show Cycle audit proves that at least one active player stole, but it does not identify who.

A zero Show Cycle audit means every active player passed or theft requests failed because the vault was empty.

---

## 12. Public Balance Reveal

Balance reveals occur only during Show Cycles.

After the vault audit, the shared display shows the current personal balance of every player.

This includes:

- Active players.
- Jury players.
- Players with newly matured investments.
- Players who earned or lost gold from previous votes.
- Players who received wrongful accusation compensation.
- Players who stole during the current Show Cycle.

The display shows only the current total.

Example:

```text
Alex: 29
Morgan: 18
Riley: 34
Jordan: 21
```

The display must not itemize transaction sources.

Do not publicly show:

```text
+11 investment return
+5 theft
+2 vote reward
-2 wrongful vote
```

Full transaction histories are revealed only after the game ends.

---

## 13. Discussion Phase

After the audit and any scheduled balance reveal, all players enter a timed discussion phase.

Initial prototype duration:

```text
90 seconds
```

All active and jury players may participate.

The shared display shows:

- Current cycle number.
- Current cycle type.
- Vault audit.
- Active player list.
- Jury player list.
- Public balances if it is a Show Cycle.
- Discussion timer.

Players may:

- Claim they invested.
- Claim they passed.
- Admit or deny stealing.
- Compare current and previously shown balances.
- Discuss voting history.
- Accuse active players.
- Defend active players.
- Mislead the group.

The game does not verify verbal claims.

The prototype assumes discussion happens in the room; it does not include built-in voice chat.

---

## 14. Secret Vote

After discussion, every connected player casts one secret vote.

This includes active and jury players.

### Voting Rules

- Every connected player receives one vote.
- Votes are submitted privately through phones.
- Only active players may be targeted.
- Jury players cannot be targeted.
- An active player cannot vote for themselves.
- A jury player may vote for any active player.
- Votes remain hidden until voting closes.
- A player who does not submit before timeout abstains.

The shared display shows only submission progress:

```text
5 of 7 votes submitted
```

---

## 15. Vote Resolution

The active player with the most votes is selected for removal from vault access.

The shared display reveals:

1. Vote totals.
2. Selected player.
3. Selected player’s resolved vault action from the current cycle.
4. Whether the accusation was correct.
5. Any fine, reward, penalty, or compensation created by the result.
6. Player transition from Active to Jury.

### 15.1 Correct Accusation

The accusation is correct when the selected player chose Steal during the current cycle.

Result:

- The player pays a partial theft fine.
- The player becomes a jury player.
- Each player who voted for them receives a correct-vote bonus.
- The selected player receives no wrongful accusation compensation.
- The selected player keeps the unfined portion of the stolen gold.
- The selected player remains eligible to win.

### 15.2 Wrongful Accusation

The accusation is wrongful when the selected player chose Invest or Pass during the current cycle.

Result:

- The player becomes a jury player.
- Each player who voted for them receives a wrongful-vote penalty.
- The selected player receives wrongful accusation compensation.
- Any pending investment remains valid.
- The selected player remains eligible to win.

The lockout still occurs even when the accusation was wrong.

The group’s mistake has a permanent strategic consequence.

---

## 16. Partial Theft Fine

A correctly identified thief loses part of the gold they successfully stole during the current cycle.

### 16.1 Default Fine

Prototype default:

```text
50% of actual gold stolen during the current cycle
```

The fine rounds up to the nearest whole gold.

Formula:

```text
fine = ceil(actualStolenThisCycle × 0.50)
```

Examples:

| Actual Stolen | Fine | Thief Keeps |
|---:|---:|---:|
| 3 | 2 | 1 |
| 5 | 3 | 2 |
| 8 | 4 | 4 |

### 16.2 Fine Destination

The fine is returned to the shared vault.

This makes successful detection partially repair the damage caused by theft.

### 16.3 Fine Limits

The fine cannot exceed:

- The amount successfully stolen during the current cycle.
- The thief’s current personal balance.

### 16.4 Scope

The fine applies only to theft from the current cycle.

Previous theft is not retroactively confiscated.

Investment returns, vote rewards, and other legal earnings are not included in the fine calculation.

### 16.5 Design Intent

The partial fine exists to ensure:

- Theft remains profitable if the thief escapes detection.
- Theft may still produce some profit if the thief is caught.
- Correct votes materially protect the vault.
- A caught thief is punished without being removed from contention automatically.
- Players retain incentive to take risks throughout the match.

The fine percentage must remain configurable for playtesting.

---

## 17. Vote Rewards and Penalties

Initial prototype values:

```text
Correct vote bonus: +2 gold
Wrongful vote penalty: -2 gold
Wrongfully accused compensation: +5 gold
```

These values apply equally to active and jury voters.

### 17.1 Correct Vote Bonus

A player earns the correct-vote bonus if:

- They voted for the selected player.
- The selected player chose Steal during the current cycle.

### 17.2 Wrongful Vote Penalty

A player receives the wrongful-vote penalty if:

- They voted for the selected player.
- The selected player chose Invest or Pass during the current cycle.

### 17.3 Wrongful Accusation Compensation

A player receives compensation if:

- They were selected for removal.
- Their current-cycle action was Invest or Pass.

### 17.4 Reward Timing

Rewards, penalties, compensation, and fines resolve after the selected action is revealed.

They are shown privately to affected players.

Their effects become publicly visible through the next Show Cycle balance reveal.

---

## 18. Tie Resolution

If multiple active players tie for the most votes:

1. A secret runoff vote begins.
2. Only tied active players are eligible targets.
3. All connected active and jury players vote again.
4. Tied active players cannot vote for themselves.

If the runoff also ties:

1. Compare votes cast by active players only.
2. The tied target with more active-player votes is removed.
3. If still tied, the server selects randomly from the tied targets.

The random resolution must be announced publicly.

---

## 19. Lockout Transition

After vote resolution, the selected player changes from Active to Jury.

The player:

- Keeps all personal gold after any fine or penalty.
- Keeps pending investment returns.
- Loses access to future vault actions.
- Continues discussion.
- Continues voting.
- Continues receiving vote rewards or penalties.
- Remains eligible to win.

The shared display moves the player from the Active section to the Jury section.

---

## 20. Game End

One active player loses vault access after each completed cycle.

The match ends when no active players remain.

If a pending investment still exists after the final lockout, the game performs a Final Show Settlement.

### Final Show Settlement

1. All pending investments mature.
2. Final personal balances are revealed.
3. No vault action occurs.
4. No additional vote occurs.
5. Final scoring begins.

The player with the most personal gold wins.

A jury player may win.

The final active player does not automatically win.

---

## 21. Final Results and Reveal

The final reveal proceeds in this order:

1. Final balances.
2. Winner.
3. Final vault value.
4. Cycle-by-cycle transaction history.
5. Every investment.
6. Every investment return.
7. Every theft request.
8. Every successful theft amount.
9. Every Pass action.
10. Every vote.
11. Every correct-vote bonus.
12. Every wrongful-vote penalty.
13. Every wrongful accusation compensation payment.
14. Every partial theft fine.
15. Every player’s final status.

The transaction reveal must allow players to reconstruct how every final balance was produced.

---

## 22. Final Tiebreakers

If multiple players finish with the same amount of gold:

1. Most correct thief votes.
2. Fewest wrongful votes.
3. Most total legal investment profit.
4. Shared victory if still tied.

The prototype may use a shared victory immediately if the full tiebreak system is not yet implemented.

---

## Jaybox Integration Boundary

Jaybox owns game discovery, room creation, player sessions, the shared-display and phone-controller connection, lobby behavior, reconnect windows, and canonical player identity. Pot of Greed receives a locked match roster after the host launches this game.

Pot of Greed owns the rules that begin with match initialization: assigning initial balances, enforcing the four-to-eight player rule, selecting phases, resolving actions, and presenting all game-specific information.

Jaybox must provide Pot of Greed with a room identifier, stable match-scoped player identifiers, a host designation, connected/disconnected/reconnected/left events, a locked roster at launch, one public-display channel, and private controller channels.

Pot of Greed returns game state and game-specific display/controller models. It must not create a second durable player profile or take ownership of room membership.



### Launch Requirement

Pot of Greed accepts a Jaybox roster of four to eight players. Jaybox locks joining and player names before launching the game; Pot of Greed then assigns initial balances and starts the first Hidden Cycle.

### In-Match Connection Behavior

While Jaybox applies its reconnect window, Pot of Greed preserves the player's balance, pending investment, and active-or-jury state. Timers continue and already submitted actions remain valid.

When Jaybox reports that the reconnect window has expired, an active player automatically Passes during vault phases and abstains from voting. The player remains eligible to reconnect later.

---

## 23. Game Server Authority

The server owns:

- Active and jury state.
- Personal balances.
- Vault balance.
- Cycle type.
- Match phase.
- Timers.
- Vault actions.
- Pending investments.
- Investment returns.
- Requested theft.
- Actual successful theft.
- Vault audits.
- Public balance reveals.
- Votes.
- Vote resolution.
- Partial fines.
- Vote rewards and penalties.
- Wrongful accusation compensation.
- Final scoring.

Clients submit intended actions.

Clients do not calculate authoritative economic results.

---

## 24. Match State Machine

```text
MATCH_INTRO

HIDDEN_VAULT_ACTION
HIDDEN_VAULT_RESOLUTION
HIDDEN_VAULT_AUDIT
HIDDEN_DISCUSSION
HIDDEN_VOTE
HIDDEN_RUNOFF_VOTE
HIDDEN_VOTE_RESULT
HIDDEN_LOCKOUT

SHOW_INVESTMENT_PAYOUT
SHOW_VAULT_ACTION
SHOW_VAULT_RESOLUTION
SHOW_VAULT_AUDIT
SHOW_BALANCE_REVEAL
SHOW_DISCUSSION
SHOW_VOTE
SHOW_RUNOFF_VOTE
SHOW_VOTE_RESULT
SHOW_LOCKOUT

FINAL_SETTLEMENT
FINAL_RESULTS
ENDED
```

The server alternates Hidden and Show phase groups until no active players remain.

---

## 25. Core Phone Game Interfaces

The phone client requires:

```text
PrivateBalanceDisplay
CycleStatusDisplay
VaultActionSelection
InvestmentPackageSelection
TheftPackageSelection
PassSelection
LockActionButton
WaitingForPlayersScreen
SecretVoteGrid
RunoffVoteGrid
VoteConfirmation
PrivateTransactionNotice
FineNotice
RewardNotice
PenaltyNotice
JuryStatusScreen
PersonalFinalResults
```

Jury players continue to see:

- Personal balance.
- Public game state.
- Discussion status.
- Secret voting controls.
- Vote rewards and penalties.

They do not see vault action controls.

---

## 26. Core Shared-Screen Game Interfaces

The shared display requires:

```text
MatchIntro
CycleIntroduction
ActiveAndJuryPlayerList
VaultAuditDisplay
PublicBalanceBoard
DiscussionTimer
VoteProgress
VoteResults
ActionReveal
FineReveal
RewardAndPenaltyReveal
LockoutTransition
FinalSettlement
FinalBalanceReveal
TransactionHistoryReveal
WinnerScreen
```

---

## 27. Game Configuration

The following values must be stored in one shared configuration source:

```text
minimumPlayers
maximumPlayers
startingPersonalGold
startingVaultGoldPerPlayer
investmentPackages
theftPackages
correctVoteBonus
wrongfulVotePenalty
wrongfulAccusationCompensation
theftFinePercentage
vaultActionDuration
discussionDuration
voteDuration
runoffVoteDuration
```

The server is the authoritative consumer of all economic configuration.

Clients may receive read-only values for display.

---

## 28. Prototype Acceptance Criteria

The prototype is complete when:

1. Given a Jaybox session of four to eight players, every player receives a private gold balance.
2. Hidden and Show Cycles alternate correctly.
3. Investments are available only during Hidden Cycles and mature during the following Show Cycle.
4. Active players can steal or Pass during both cycle types.
5. Vault actions resolve simultaneously and server-side.
6. The vault audit shows only before, after, and net change.
7. Public balances appear only during Show Cycles.
8. All connected active and jury players can vote, and only active players can be targeted.
9. Voted players become jury players; jury players continue discussing and voting.
10. Correct voters receive gold, incorrect voters lose gold, and wrongfully removed players receive compensation.
11. Correctly identified thieves pay a configurable partial fine based only on actual current-cycle theft; the fine returns to the vault and the thief keeps the unfined amount.
12. Jury players can still win, pending investments survive player lockout, and runoff votes resolve ties.
13. The game ends when nobody has vault access; final settlement pays pending investments and transaction histories explain every balance.

---

## 29. Out of Scope for the First Prototype

Do not add:

- Assigned culprit roles.
- Character classes.
- Unique player powers.
- Multiple vaults.
- Purchasable items.
- Trading between players.
- Loans.
- Dynamic interest rates.
- Side minigames.
- Audience mode.
- Spectator voting.
- Cosmetics.
- AI players.
- Text chat.
- Voice chat.
- User-generated rules.
- Retroactive fines for earlier theft.
- Complete confiscation of caught theft.
- Elimination from discussion or voting.

The prototype must first prove the core loop:

```text
private economic choice
public vault audit
delayed balance evidence
social discussion
secret jury vote
economic reward or punishment
partial theft fine
vault lockout
final wealth victory
```

---

## 30. Values Requiring Playtesting

The following values are structurally supported but not final:

- Starting personal gold.
- Starting vault gold.
- Investment package sizes.
- Investment return values.
- Theft package sizes.
- Correct-vote reward.
- Wrongful-vote penalty.
- Wrongful accusation compensation.
- Partial fine percentage.
- Discussion duration.
- Vault action timer.
- Vote timer.
- Runoff vote timer.
- Whether theft packages remain fixed or become a limited slider.
- Whether the vault requires a minimum reserve.
- Whether the final cycle requires a special shortened presentation.

All of these values must be configurable without restructuring the game loop.
