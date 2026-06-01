# Digital Data Model — First Pass

This is not final implementation. It is a structured first-pass shape based on captured paper rules.

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
  oncePerTurn: true;
  targetRule: TargetRule;
  effects: EffectDefinition[];
  rulesText: string;
};
```

```ts
type MonsterPassive = {
  id: string;
  kind: "passive";
  name: string;
  activeFromZones: CardZone[];
  condition?: EffectCondition;
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
  id: string;
  family: EffectFamily;
  timing: EffectTiming;
  cost?: EffectCost;
  target?: TargetRule;
  rollRule?: RollRule;
  duration?: EffectDuration;
  payload: Record<string, unknown>;
  rulesText: string;
};
```

```ts
type RollRule =
  | "none"
  | "standardOffensiveD6"
  | "cardSpecific";
```

```ts
type EffectFamily =
  | "damage"
  | "rollRequirement"
  | "rollModification"
  | "heal"
  | "statChange"
  | "maxHpChange"
  | "strengthChange"
  | "starModification"
  | "draw"
  | "discard"
  | "summon"
  | "equip"
  | "destroy"
  | "sacrifice"
  | "deathTrigger"
  | "restriction"
  | "costModification"
  | "accessorySlotModification"
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

This model should stay loose until real card examples are entered.
