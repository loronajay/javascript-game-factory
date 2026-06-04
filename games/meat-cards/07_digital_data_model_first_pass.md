# Digital Data Model — First Pass

This document reflects the actual card data and engine shapes as implemented. Update it when new effect families, timings, or targets are introduced by real cards.

## Card Types

```ts
type CardType = "monster" | "accessory" | "later";
```

## Zones

```ts
type CardZone =
  | "deck"
  | "hand"
  | "monsterBoard"
  | "attachedToMonster"
  | "activeLaterBoard"
  | "graveyard";
```

## Base Card Definition

```ts
type CardDefinition = {
  id: string;
  type: CardType;
  name: string;
  imageUrl?: string;
  rulesText: string;
};
```

## Monster Definition

```ts
type MonsterCardDefinition = CardDefinition & {
  type: "monster";

  summonCostStars: number; // currently up to 4
  printedHp: number;
  printedStrength: number;

  effectSlots: MonsterEffectSlot[]; // max 4 total abilities/passives

  normalAttack: {
    baseCostStars: 2;
    damageSource: "currentStrength";
    rollRule: "standardOffensiveD6";
  };

  baseAccessorySlots: 1;
};
```

## Monster Effect Slot

```ts
type MonsterEffectSlot =
  | ActiveMonsterAbility
  | MonsterPassive;
```

```ts
type ActiveMonsterAbility = {
  id: string;
  kind: "activeAbility";
  name: string;
  costStars: number;
  oncePerTurn?: boolean; // defaults to true in the engine when absent
  effects: EffectDefinition[];
  choiceOptions?: ChoiceOption[]; // present when the ability offers a player choice
  rulesText: string;
};
```

```ts
type ChoiceOption = {
  id: string;
  label: string;
  effects: EffectDefinition[];
};
```

```ts
type MonsterPassive = {
  id: string;
  kind: "passive";
  name: string;
  effects: EffectDefinition[];
  rulesText: string;
};
```

## Accessory Definition

```ts
type AccessoryCardDefinition = CardDefinition & {
  type: "accessory";
  baseEquipCostStars: 1;
  allowedTargets: "ownMonster";
  effects: EffectDefinition[];
};
```

## Later Definition

```ts
type LaterCardDefinition = CardDefinition & {
  type: "later";
  playCostStars: number;
  lifecycle: LaterLifecycle;
  effects: EffectDefinition[];
};
```

```ts
type LaterLifecycle =
  | "instantToGraveyard"
  | "activeOnBoard"
  | "untilEndOfTurn"
  | "forDuration"
  | "whileConditionTrue";
```

## Runtime Card Instance

```ts
type CardInstance = {
  instanceId: string;
  definitionId: string;
  ownerPlayerId: string;
  controllerPlayerId: string;
  zone: CardZone;
};
```

## Runtime Monster State

```ts
type MonsterInstance = {
  instanceId: string;
  definitionId: string;
  ownerPlayerId: string;
  controllerPlayerId: string;

  printedMaxHp: number;
  currentMaxHp: number;
  currentHp: number;

  printedStrength: number;
  currentStrength: number;

  attachedCardInstanceIds: string[];

  attacksUsedThisTurn: number;
  maxAttacksThisTurn: number;

  abilityUsesThisTurn: Record<string, number>;

  activeModifiers: ModifierInstance[];
  cooldowns: CooldownState[];
};
```

## Player State

```ts
type PlayerState = {
  playerId: string;

  printedStartingMaxHp: 20;
  currentMaxHp: number;
  currentHp: number;

  deck: string[];
  hand: string[];
  monsterBoard: string[];
  activeLaterBoard: string[];
  graveyard: string[];

  hasTakenSetupTurn: boolean;
};
```

## Turn State

```ts
type TurnState = {
  activePlayerId: string;
  turnNumber: number;

  starsPerTurn: 5;
  starsSpentThisTurn: number;
  delayedStarsAutoSpent: number;

  phase:
    | "startTurn"
    | "main"
    | "finalUnusedStarDiscard"
    | "handLimitCleanup"
    | "endTurn";

  finalDiscardActionUsed: boolean;
};
```

## Pending Star Cost

```ts
type PendingStarCost = {
  id: string;
  playerId: string;
  sourceCardInstanceId: string;
  amount: number;
  due: "startOfNextOwnTurn";
  autoSpend: true;
};
```

## Effect Skeleton

```ts
type EffectDefinition = {
  family: EffectFamily;
  timing?: EffectTiming;
  target?: EffectTarget;
  duration?: EffectDuration;
  amount?: number;
  payload?: Record<string, unknown>;
  // passive effects that fire after a specific ability use:
  triggeredByAbilityId?: string;
  // Big Smac / maxHpChange only — current HP follows max HP increase:
  currentHpFollowsMaxIncrease?: boolean;
};
```

```ts
type RollRule =
  | "none"
  | "standardOffensiveD6"
  | "cardSpecific";
```

## Effect Families

Effect families that are currently scripted in at least one card:

```ts
type EffectFamily =
  // Core damage and healing
  | "damage"                    // deal N damage to target
  | "heal"                      // restore N HP to target
  | "maxHpChange"               // change player max HP (currentHpFollowsMaxIncrease flag if HP also rises)
  | "gainMaxHp"                 // increase monster max HP and current HP by N
  | "preventHealing"            // while in play, no heals resolve for any target
  // Stat changes
  | "strengthChange"            // add N to monster strength; payload.mode controls accessory behavior
  // Monster removal
  | "koMonster"                 // knock out target monster with no overflow damage
  | "conditionalKo"             // knock out target if it meets a condition (payload.condition)
  | "massKoWithSplashDamage"    // knock out all monsters and deal splash damage to both players
  | "returnToHand"              // return target monster and its attachments to owner's hand
  // Summon
  | "forceSummon"               // force a monster from opponent's hand into play
  // Restrictions
  | "restriction"               // prevent a monster from taking a category of actions for N turns
  | "accessorySlotModification" // change a monster's accessory capacity
  // Accessory grants
  | "grantAction";              // while equipped, grant the monster an additional active ability
```

Effect families known from rules but not yet scripted:

```ts
type DeferredEffectFamily =
  | "rollRequirement"
  | "rollModification"
  | "starModification"
  | "draw"
  | "discard"
  | "costModification"
  | "attackModification"
  | "overflowModification"
  | "directPlayerDamage"
  | "graveyardInteraction"
  | "deckSearch"
  | "handInteraction"
  | "deathPrevention"
  | "lossPrevention"
  | "interrupt";
```

## Effect Timings

```ts
type EffectTiming =
  | "startOfTurn"          // fires at start of owner's turn (Homie Snacks)
  | "onAbilityUse"         // fires when the slot's ability is activated
  | "afterAbilityUse"      // passive that fires after a specific ability (use triggeredByAbilityId)
  | "onAllyDies"           // passive fires when another allied monster dies
  | "onSourceDies"         // passive fires when the card itself is knocked out
  | "afterAttacked"        // passive fires after this monster is attacked
  | "whileInPlay"          // persistent while the monster is on the board
  | "whileEquipped"        // persistent while the accessory is attached
  | "onPlay";              // fires when a Later card is played
```

## Effect Targets

```ts
type EffectTarget =
  | "selfMonster"            // the monster using the ability
  | "ownerPlayer"            // the player who owns the source card
  | "selfPlayer"             // the active player playing a Later card
  | "ownerAlliedMonsters"    // all monsters controlled by the owner
  | "equippedMonster"        // the monster this accessory is attached to
  | "enemyMonster"           // an opponent's monster (requires target slot)
  | "anyMonster"             // any monster on either side (requires target slot)
  | "attackingEnemyMonster"  // the attacker, used in afterAttacked passives
  | "opponentHandMonster"    // a card from the opponent's hand
  | "allMonsters"            // every monster currently in play
  | "allTargets";            // global — all players and monsters (Lunch Lady)
```

## Effect Duration

```ts
type EffectDuration =
  | "instant"
  | "permanent"
  | "untilEndOfTurn"
  | "untilStartOfOwnerNextTurn"
  | "untilStartOfOpponentNextTurn"
  | "fixedTurnCount"
  | "whileEquipped"
  | "whileSourceInPlay"
  | "whileActiveLaterInPlay"
  | "whileConditionTrue"
  | "untilMonsterDies"
  | "untilRemovedByEffect";
```

## Payload Shapes by Effect Family

These are the payload shapes actually used by scripted cards.

**`strengthChange` on an accessory (`whileEquipped`):**
```json
{ "mode": "add", "amount": 2 }
{ "mode": "setToCurrentMaxHp", "requiresCurrentStrengthGreaterThan": 0 }
```

**`accessorySlotModification`:**
```json
{ "mode": "setCapacity", "capacity": 2 }
```

**`restriction`:**
```json
{ "blockedActionCategory": "offensive", "turns": 1 }
{ "blockedActionCategory": "specificTarget", "turns": 1 }
{ "blockedActionCategory": "allActions" }
```

`specificTarget` blocks attack against the monster that applied the restriction. The engine fills in `blockedTargetPlayerId` and `blockedTargetSlotIndex` at runtime.

**`damage` (afterAttacked, no overflow):**
```json
{ "overflowDamage": false }
```

**`massKoWithSplashDamage`:**
```json
{ "splashDamage": 5, "extraDamagePerExtraMonster": 1 }
```

**`conditionalKo`:**
```json
{ "condition": "strengthPlusHpLessThan", "threshold": 6 }
```

**`grantAction` (accessory grants an ability):**
```json
{
  "actionId": "selfie_stick_ko",
  "name": "Selfie Stick",
  "costStars": 3,
  "oncePerTurn": true,
  "effects": [{ "family": "koMonster", "target": "selfMonster" }]
}
```
