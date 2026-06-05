import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSceneLayout } from "../src/ui/scene/scene-layout.mjs";

const sceneCssDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/scene");
const firstAbilityRules = "Whenever another one of your monsters dies, this monster gains +3 strength.";
const secondAbilityRules = "At the start of your turn, heal each of your monsters by 1 HP.";

test("selected hand card viewer omits discard explanatory copy", () => {
  const scene = buildSceneLayout(testView(), {
    selected: {
      playerId: "p1",
      source: "hand",
      card: selectedMonster(),
    },
  });

  assert.equal(scene.overlays.viewer.canDiscard, true);
  assert.equal(scene.overlays.viewer.discardLabel, "Discard");
  assert.equal(scene.overlays.viewer.discardDetail, "");
});

test("selected card viewer omits top-level rules for any card with effect slots", () => {
  const scene = buildSceneLayout(testView(), {
    selected: {
      playerId: "p1",
      source: "hand",
      card: selectedMonster(),
    },
  });

  assert.equal(scene.overlays.viewer.card.rulesText, `First: ${firstAbilityRules} Second: ${secondAbilityRules}`);
  assert.equal(scene.overlays.viewer.card.effectSlots.length, 2);
  assert.equal(scene.overlays.viewer.detailRulesText, "");
});

test("battle resolution overlay is exposed while attacks play out", () => {
  const attackResolution = {
    type: "attack",
    roll: 1,
    hit: false,
    damage: 0,
    floatText: "MISS!",
    attacker: { card: { type: "monster", name: "Attacker", currentHp: 5, maxHp: 5, currentStrength: 2 } },
    target: {
      beforeHp: 4,
      afterHp: 4,
      card: { type: "monster", name: "Target", currentHp: 4, maxHp: 4, currentStrength: 1 },
    },
  };

  const scene = buildSceneLayout(testView(), { battleResolution: attackResolution });

  assert.equal(scene.overlays.battleResolution, attackResolution);
});

test("selected monsters blocked from offensive actions cannot offer attack", () => {
  const scene = buildSceneLayout(testView(), {
    selected: {
      playerId: "p1",
      source: "monster",
      slotIndex: 0,
      card: {
        ...selectedMonster(),
        actionRestrictions: [{ blockedActionCategory: "offensive", remainingControllerTurns: 1 }],
      },
    },
  });

  assert.equal(scene.overlays.viewer.canAttack, false);
  assert.match(scene.overlays.viewer.actionBlockedDetail, /blocked from offensive actions/i);
});

test("hand lanes reserve room for hovered cards", () => {
  const handCss = readSceneCss("hand-layer.css");
  const responsiveCss = readSceneCss("responsive-scene.css");
  const rowRule = handCss.match(/\.hand-card-row\s*\{[^}]+\}/)?.[0] ?? "";
  const opponentRowRule = handCss.match(/\.hand-layer--opponent\s+\.hand-card-row\s*\{[^}]+\}/)?.[0] ?? "";

  assert.match(rowRule, /padding:\s*14px 4px 10px;/);
  assert.doesNotMatch(opponentRowRule, /mask-image:/);
  assert.match(handCss, /\.hand-layer--opponent\s*\{[^}]*height:\s*116px;/s);
  assert.match(handCss, /\.hand-layer--player\s*\{[^}]*height:\s*170px;/s);
  assert.match(responsiveCss, /\.hand-layer--opponent\s*\{[^}]*height:\s*110px;/s);
  assert.match(responsiveCss, /\.hand-layer--player\s*\{[^}]*height:\s*138px;/s);
  assert.match(responsiveCss, /\.hand-layer--player\s*\{[^}]*height:\s*132px;/s);
});

function testView() {
  return {
    phase: "playerTurn",
    currentPlayerId: "p1",
    currentPlayerName: "Player One",
    log: [],
    players: [
      {
        id: "p1",
        name: "Player One",
        isCurrentPlayer: true,
        hpLabel: "20",
        starsLabel: "5 / 5",
        starsRemaining: 5,
        deckCount: 10,
        graveyardCount: 0,
        hand: [selectedMonster()],
        monsterSlots: [null, null, null, null],
      },
      {
        id: "p2",
        name: "Player Two",
        isCurrentPlayer: false,
        hpLabel: "20",
        starsLabel: "0 / 5",
        starsRemaining: 0,
        deckCount: 10,
        graveyardCount: 0,
        hand: [],
        monsterSlots: [null, null, null, null],
      },
    ],
  };
}

function selectedMonster() {
  return {
    instanceId: "p1_baseballz_1",
    id: "multi_ability_monster",
    type: "monster",
    name: "Multi Ability Monster",
    rulesText: `First: ${firstAbilityRules} Second: ${secondAbilityRules}`,
    summonCostStars: 2,
    printedHp: 5,
    printedStrength: 1,
    effectSlots: [
      {
        id: "first",
        kind: "activeAbility",
        name: "First",
        costStars: 4,
        rulesText: firstAbilityRules,
      },
      {
        id: "second",
        kind: "passive",
        name: "Second",
        rulesText: secondAbilityRules,
      },
    ],
  };
}

function readSceneCss(fileName) {
  return fs.readFileSync(path.join(sceneCssDir, fileName), "utf8");
}
