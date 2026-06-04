import { createMatch, startTurn, endTurn, summonMonster, useActiveAbility, normalAttack, equipAccessory, playLaterCard } from "../src/engine/game-state.mjs";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

function loadCards() {
  const c = {};
  const dirs = [
    "cards/meat-deck/monsters","cards/meat-deck/accessories","cards/meat-deck/later",
    "cards/useless-deck/monsters","cards/useless-deck/accessories","cards/useless-deck/later",
  ];
  for (const d of dirs) {
    try {
      for (const f of readdirSync(d)) {
        if (f.endsWith(".json")) { const x = JSON.parse(readFileSync(join(d,f),"utf8")); c[x.id]=x; }
      }
    } catch(e) {}
  }
  return c;
}

function buildState(cardsById, p1Monsters, p2Monsters, activePlayer = "p1") {
  const fakeDeck = (id) => ({ id, entries: [] });
  const s = createMatch({ cardsById, players: [{id:"p1",name:"P1",deck:fakeDeck("meat_deck")},{id:"p2",name:"P2",deck:fakeDeck("useless_deck")}]});
  let nextNum = 1;
  const makeMonster = (cardId, ownerId) => {
    const card = cardsById[cardId];
    return {instanceId:"m_"+(nextNum++),cardInstanceId:"ci_"+cardId+"_"+(nextNum++),cardId,ownerId,currentHp:card.printedHp,maxHp:card.printedHp,currentStrength:card.printedStrength,attachments:[],actionRestrictions:[],hasAttackedThisTurn:false,abilityUses:{}};
  };
  const p1Slots = Array(4).fill(null);
  const p2Slots = Array(4).fill(null);
  for (let i=0;i<p1Monsters.length;i++) p1Slots[i] = makeMonster(p1Monsters[i],"p1");
  for (let i=0;i<p2Monsters.length;i++) p2Slots[i] = makeMonster(p2Monsters[i],"p2");
  return {
    ...s, phase:"main", currentPlayerId:activePlayer,
    players:{
      ...s.players,
      p1:{...s.players.p1,turnsStarted:2,monsterSlots:p1Slots,stars:{available:5,spent:0}},
      p2:{...s.players.p2,turnsStarted:2,monsterSlots:p2Slots,stars:{available:5,spent:0}},
    }
  };
}

const cardsById = loadCards();
let passes = 0;
let failures = 0;

function check(label, got, expected) {
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  if (pass) { console.log("PASS", label); passes++; }
  else { console.log("FAIL", label + ":", JSON.stringify(got), "(expected " + JSON.stringify(expected) + ")"); failures++; }
}

let s;

// Retreat heals self
s = buildState(cardsById, [], ["elderly_turtle"], "p2");
s.players.p2.monsterSlots[0] = {...s.players.p2.monsterSlots[0], currentHp:3};
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"retreat"});
check("Retreat heals +2 HP", s.players.p2.monsterSlots[0].currentHp, 5);

// Retreat once-per-turn
try {
  useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"retreat"});
  check("Retreat once-per-turn blocks", "no error", "should throw");
} catch(e) {
  check("Retreat once-per-turn blocks", e.message.includes("once per turn"), true);
}

// Insurance heals owner on death
s = buildState(cardsById, ["fat_baby"], ["elderly_turtle"], "p1");
s.players.p2.monsterSlots[0] = {...s.players.p2.monsterSlots[0], currentHp:1};
const p2HpBefore = s.players.p2.currentHp;
s = normalAttack(s, {attackerPlayerId:"p1",attackerSlotIndex:0,targetPlayerId:"p2",targetSlotIndex:0,roll:2});
check("Insurance: turtle KOd", s.players.p2.monsterSlots[0], null);
check("Insurance: owner healed +2", s.players.p2.currentHp - p2HpBefore, 2);

// Bob the Brick Hard counter
s = buildState(cardsById, ["bob_the_brick"], ["fat_baby"], "p2");
const fbHP = s.players.p2.monsterSlots[0].currentHp;
s = normalAttack(s, {attackerPlayerId:"p2",attackerSlotIndex:0,targetPlayerId:"p1",targetSlotIndex:0,roll:3});
check("Hard: Bob takes 1 damage", s.players.p1.monsterSlots[0].currentHp, 4 - 1);
check("Hard: counter 2 dmg to attacker", s.players.p2.monsterSlots[0].currentHp, fbHP - 2);

// Hard counter kills attacker with no overflow
s = buildState(cardsById, ["bob_the_brick"], ["fat_baby"], "p2");
s.players.p2.monsterSlots[0] = {...s.players.p2.monsterSlots[0], currentHp:1};
const p2HpPre = s.players.p2.currentHp;
s = normalAttack(s, {attackerPlayerId:"p2",attackerSlotIndex:0,targetPlayerId:"p1",targetSlotIndex:0,roll:3});
check("Hard: attacker KOd by counter", s.players.p2.monsterSlots[0], null);
check("Hard: no overflow to P2 player", s.players.p2.currentHp, p2HpPre);

// Argue +1 STR
s = buildState(cardsById, [], ["conjoined_twins"], "p2");
const argueStrBefore = s.players.p2.monsterSlots[0].currentStrength;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"argue"});
check("Argue +1 STR", s.players.p2.monsterSlots[0].currentStrength, argueStrBefore + 1);

// Salami +2 STR on equip
s = buildState(cardsById, [], ["conjoined_twins"], "p2");
s = {...s, players:{...s.players, p2:{...s.players.p2, hand:[{instanceId:"salami_inst",cardId:"salami"}]}}};
const salamiStrBefore = s.players.p2.monsterSlots[0].currentStrength;
s = equipAccessory(s, {playerId:"p2",handCardInstanceId:"salami_inst",monsterSlotIndex:0});
check("Salami +2 STR", s.players.p2.monsterSlots[0].currentStrength, salamiStrBefore + 2);

// Do Nothing (grantAction from Lawn Chair)
s = buildState(cardsById, [], ["conjoined_twins"], "p2");
s = {...s, players:{...s.players, p2:{...s.players.p2, hand:[{instanceId:"lc_inst",cardId:"lawn_chair"}]}}};
s = equipAccessory(s, {playerId:"p2",handCardInstanceId:"lc_inst",monsterSlotIndex:0});
const starsBeforeDoNothing = s.players.p2.stars.available - s.players.p2.stars.spent;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"do_nothing"});
check("Do Nothing costs 1 star", s.players.p2.stars.available - s.players.p2.stars.spent, starsBeforeDoNothing - 1);

// Selfie Stick KO self (no overflow)
s = buildState(cardsById, [], ["conjoined_twins"], "p2");
s = {...s, players:{...s.players, p2:{...s.players.p2, hand:[{instanceId:"ss_inst",cardId:"selfie_stick"}]}}};
s = equipAccessory(s, {playerId:"p2",handCardInstanceId:"ss_inst",monsterSlotIndex:0});
const p2HpSS = s.players.p2.currentHp;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"selfie_stick_ko"});
check("Selfie Stick KOs self", s.players.p2.monsterSlots[0], null);
check("Selfie Stick no player damage", s.players.p2.currentHp, p2HpSS);

// Grow +1 HP
s = buildState(cardsById, [], ["useless_dragon"], "p2");
const growHPBefore = s.players.p2.monsterSlots[0].maxHp;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"grow",choiceOptionId:"hp"});
check("Grow +1 maxHp", s.players.p2.monsterSlots[0].maxHp, growHPBefore + 1);
check("Grow +1 currentHp follows", s.players.p2.monsterSlots[0].currentHp, growHPBefore + 1);

// Grow +1 STR
s = buildState(cardsById, [], ["useless_dragon"], "p2");
const growStrBefore = s.players.p2.monsterSlots[0].currentStrength;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"grow",choiceOptionId:"str"});
check("Grow +1 STR", s.players.p2.monsterSlots[0].currentStrength, growStrBefore + 1);

// Poop returns enemy monster to hand
s = buildState(cardsById, ["bob_the_brick"], ["fat_baby"], "p2");
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"poop",targetPlayerId:"p1",targetSlotIndex:0});
check("Poop removes Bob from slot", s.players.p1.monsterSlots[0], null);
check("Poop returns Bob to P1 hand", s.players.p1.hand.some(c=>c.cardId==="bob_the_brick"), true);

// Cry restricts specific attack
s = buildState(cardsById, ["fat_baby"], ["bob_the_brick"], "p1");
s = useActiveAbility(s, {playerId:"p1",monsterSlotIndex:0,abilityId:"cry",targetPlayerId:"p2",targetSlotIndex:0});
try {
  const sP2 = {...s, currentPlayerId:"p2", players:{...s.players, p2:{...s.players.p2, monsterSlots:s.players.p2.monsterSlots.map((m,i)=>i===0?{...m,hasAttackedThisTurn:false}:m)}}};
  normalAttack(sP2, {attackerPlayerId:"p2",attackerSlotIndex:0,targetPlayerId:"p1",targetSlotIndex:0,roll:3});
  check("Cry blocks specific attack", "no throw", "should throw");
} catch(e) {
  check("Cry blocks specific attack", e.message.includes("cannot attack that target"), true);
}

// Take Out Trash conditional KO + Life of Garbage
s = buildState(cardsById, ["bob_the_brick"], ["garbage_man"], "p2");
const bobSlot = s.players.p1.monsterSlots[0];
check("Bob qualifies for trash", bobSlot.currentStrength + bobSlot.currentHp < 6, true);
const gmStrBefore = s.players.p2.monsterSlots[0].currentStrength;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"take_out_trash",targetPlayerId:"p1",targetSlotIndex:0});
check("Take Out Trash KOs Bob", s.players.p1.monsterSlots[0], null);
check("Life of Garbage +1 STR", s.players.p2.monsterSlots[0].currentStrength, gmStrBefore + 1);

// Take Out Trash rejects strong monster
s = buildState(cardsById, ["homie"], ["garbage_man"], "p2");
try {
  useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"take_out_trash",targetPlayerId:"p1",targetSlotIndex:0});
  check("Trash rejects strong monster", "no throw", "should throw");
} catch(e) {
  check("Trash rejects STR+HP>=6", e.message.includes("not below"), true);
}

// Curfew returns own monster to hand
s = buildState(cardsById, [], ["conjoined_twins"], "p2");
s = {...s, players:{...s.players, p2:{...s.players.p2, hand:[{instanceId:"curfew_inst",cardId:"curfew"}]}}};
s = playLaterCard(s, {playerId:"p2",handCardInstanceId:"curfew_inst",targetPlayerId:"p2",targetSlotIndex:0});
check("Curfew removes monster from slot", s.players.p2.monsterSlots[0], null);
check("Curfew returns monster to hand", s.players.p2.hand.some(c=>c.cardId==="conjoined_twins"), true);

// Nuke - equal monsters (Bob+Bob vs FatBaby+FatBaby, no Insurance)
s = buildState(cardsById, ["bob_the_brick","bob_the_brick"], ["fat_baby","conjoined_twins"], "p2");
s = {...s, players:{...s.players, p2:{...s.players.p2, hand:[{instanceId:"nuke_inst",cardId:"unnecessary_nuke"}]}}};
const p1HNuke = s.players.p1.currentHp;
const p2HNuke = s.players.p2.currentHp;
s = playLaterCard(s, {playerId:"p2",handCardInstanceId:"nuke_inst"});
check("Nuke clears P1 monsters", s.players.p1.monsterSlots.filter(Boolean).length, 0);
check("Nuke clears P2 monsters", s.players.p2.monsterSlots.filter(Boolean).length, 0);
check("Nuke P1 -5 (equal)", s.players.p1.currentHp - p1HNuke, -5);
check("Nuke P2 -5 (equal)", s.players.p2.currentHp - p2HNuke, -5);

// Nuke - P1 has more monsters than P2 (using Bob x3 to avoid Insurance side effects)
s = buildState(cardsById, ["bob_the_brick","bob_the_brick","bob_the_brick"], ["fat_baby"], "p2");
s = {...s, players:{...s.players, p2:{...s.players.p2, hand:[{instanceId:"nuke_inst2",cardId:"unnecessary_nuke"}]}}};
const p1HNuke2 = s.players.p1.currentHp;
const p2HNuke2 = s.players.p2.currentHp;
s = playLaterCard(s, {playerId:"p2",handCardInstanceId:"nuke_inst2"});
check("Nuke: P1 (3 mons) gets -7", s.players.p1.currentHp - p1HNuke2, -7);
check("Nuke: P2 (1 mon) gets -5", s.players.p2.currentHp - p2HNuke2, -5);

// Homie +3 STR when ally dies (use roll:6 so 0+2=2 damage kills Fat Baby at 1 HP)
s = buildState(cardsById, ["bob_the_brick"], ["homie","fat_baby"], "p1");
s.players.p2.monsterSlots[1] = {...s.players.p2.monsterSlots[1], currentHp:1};
const homieStrBefore = s.players.p2.monsterSlots[0].currentStrength;
s = normalAttack(s, {attackerPlayerId:"p1",attackerSlotIndex:0,targetPlayerId:"p2",targetSlotIndex:1,roll:6});
check("Homie ally death +3 STR", s.players.p2.monsterSlots[0].currentStrength, homieStrBefore + 3);

// Snacks heals allies at start of turn
s = buildState(cardsById, [], ["homie","conjoined_twins"], "p2");
s.players.p2.monsterSlots[1] = {...s.players.p2.monsterSlots[1], currentHp:1};
s.phase = "betweenTurns";
const sNext = startTurn({...s, players:{...s.players, p2:{...s.players.p2, stars:{available:5,spent:5}, turnsStarted:2}}});
check("Snacks heals Twins to 2", sNext.players.p2.monsterSlots[1].currentHp, 2);

// Lunch Lady prevents healing
s = buildState(cardsById, ["lunch_lady"], ["elderly_turtle"], "p2");
s.players.p2.monsterSlots[0] = {...s.players.p2.monsterSlots[0], currentHp:3};
const turtleHPBefore = s.players.p2.monsterSlots[0].currentHp;
s = useActiveAbility(s, {playerId:"p2",monsterSlotIndex:0,abilityId:"retreat"});
check("Lunch Lady prevents Retreat heal", s.players.p2.monsterSlots[0].currentHp, turtleHPBefore);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
