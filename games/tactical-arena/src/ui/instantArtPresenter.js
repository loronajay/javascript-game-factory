import { findUnit } from "../core/state.js";
import { getCommandBuffStats, getUnitType } from "../core/unitCatalog.js";
import { getConeCells, getVolleyShotCells } from "../rules/arts.js";
import { positionKey } from "../rules/movement.js";
import { teamColor } from "../match/matchBuilder.js";
import { createBoardMetrics } from "./isometric.js";
import { unitCenter } from "./battleEventPresenter.js";

const COMMAND_FLOAT = Object.freeze({
  strike: { stat: "strength", suffix: "STR", color: "#ff9a6b" },
  hold: { stat: "defense", suffix: "DEF", color: "#8cc0f0" },
  pursue: { stat: "moveRange", suffix: "MOVE", color: "#8fe08a" },
  "higher-ground": { stat: "attackRange", suffix: "RANGE", color: "#f2d472" },
});

const WEATHER_FLOAT = Object.freeze({
  blizzard: { label: "-1 MOVE", color: "#70b7ff" },
  "spring-shower": { label: "SPRING", color: "#8cf0a4" },
  heatwave: { label: "+1 STR", color: "#ff9a4c" },
  thunderstorm: { label: "+1 MAGIC", color: "#b08cff" },
});

export function commandFloatFor(command) {
  return COMMAND_FLOAT[command] ?? null;
}

export function weatherFloatFor(artId) {
  return WEATHER_FLOAT[artId] ?? null;
}

// Presents an already-accepted instant ART against immutable pre-command state.
// State commit, turn advancement, networking, and tutorial/campaign bookkeeping stay
// in main.js so this module owns animation only.
export async function presentInstantArt({
  state,
  result,
  resolved,
  actorBefore,
  targetsBefore,
  effects,
  audio,
  revealRoll,
  artDefinition,
  render,
}) {
  if ((resolved?.artId === "footwork" || resolved?.artId === "stumble" || resolved?.artId === "dark-rush") && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    // Map each harmed enemy to its tile so we can strike it as the dasher arrives there,
    // instead of dumping every hit after the slide. The dasher glides tile-by-tile and
    // the contact fires the recoil/damage/death the moment it reaches the occupied tile.
    const harmedByTile = new Map(targetsBefore.map((target) => [positionKey(target.position), target]));
    await effects.footworkCharge(actorBefore, resolved.path, async (tile) => {
      const target = harmedByTile.get(positionKey(tile));
      if (!target) return;
      const center = unitCenter(metrics, target);
      audio.play("attackHit");
      effects.impact(center, false, "true");
      await effects.hitRecoil(target.id, target.position, false);
      const amount = resolved.damageByTarget?.[target.id] ?? 2;
      await effects.floatText(center, `-${amount}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    });
  } else if (resolved?.artId === "volley-shot" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const coneCells = getVolleyShotCells(state, actorBefore, resolved.targetPosition) ?? [];
    await effects.playAbilityVfx("volley-shot", {
      actor: actorBefore,
      targets: targetsBefore,
      targetPosition: resolved.targetPosition,
      coneCells
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      await effects.hitRecoil(target.id, target.position, false);
      const dmg = resolved.damageByTarget?.[target.id] ?? 2;
      await effects.floatText(center, `-${dmg}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId && artDefinition(actorBefore, resolved.artId)?.targeting?.shape === "cone" && actorBefore) {
    // Any other cone-shaped ART cast manually through the ART button (e.g. Flamethrower),
    // generalized from the Volley Shot branch above — reads its own per-target damage
    // instead of a hardcoded amount.
    const metrics = createBoardMetrics(state.size);
    const coneCells = getConeCells(state, actorBefore, resolved.targetPosition, artDefinition(actorBefore, resolved.artId)) ?? [];
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: targetsBefore,
      targetPosition: resolved.targetPosition,
      coneCells
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      await effects.hitRecoil(target.id, target.position, false);
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      await effects.floatText(center, `-${dmg}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if ((resolved?.artId === "flee" || resolved?.artId === "dematerialize") && actorBefore) {
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: [],
      path: resolved.path ?? [actorBefore.position]
    });
  } else if ((resolved?.artId === "summon-ghoul" || resolved?.artId === "summon" || resolved?.artId === "beckon") && actorBefore) {
    const summoned = findUnit(result.nextState, resolved.summonedUnitId);
    if (summoned) {
      await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: [summoned] });
      if (resolved.ghostTurn) await effects.floatText(unitCenter(createBoardMetrics(state.size), summoned), "GHOST", "#cbb8ff");
    }
  } else if ((resolved?.artId === "build-cover" || resolved?.artId === "shaft-prop") && resolved.position) {
    const point = unitCenter(createBoardMetrics(state.size), { position: resolved.position });
    audio.play("buildCover");
    effects.impact(point, false);
    effects.shake(4);
  } else if ((resolved?.artId === "ore-harvest" || resolved?.artId === "ore-abundance") && actorBefore) {
    await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: [actorBefore] });
    await effects.floatText(unitCenter(createBoardMetrics(state.size), actorBefore), `+${resolved.oreGained} ORE`, "#d8b35e");
  } else if (resolved?.artId === "throw-cigar" && resolved.position && actorBefore) {
    // The cigar visibly tumbles from the Sniper to the tile before the fire takes
    // (the lob recipe plays the throwCigar sound and lands its own impact).
    await effects.playAbilityVfx("throw-cigar", { actor: actorBefore, targetPosition: resolved.position });
  } else if (resolved?.artId === "study" && actorBefore) {
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("study", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "STUDIED", "#f2d98a");
    }
  } else if (resolved?.artId === "relay-power" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("relay-power", { actor: actorBefore, targets: targetsBefore });
    const actorCenter = unitCenter(metrics, actorBefore);
    const floats = [];
    if ((resolved.hpPaid ?? 0) > 0) floats.push(effects.floatText({ ...actorCenter, y: actorCenter.y - 10 }, `-${resolved.hpPaid}`, "#ff7684"));
    if ((resolved.mpPaid ?? 0) > 0) floats.push(effects.floatText({ ...actorCenter, y: actorCenter.y + 10 }, `-${resolved.mpPaid} MP`, "#8cc8ff"));
    if (targetBefore) {
      const targetCenter = unitCenter(metrics, targetBefore);
      const healed = resolved.healingByTarget?.[targetBefore.id] ?? 0;
      const restored = resolved.restoredByTarget?.[targetBefore.id] ?? 0;
      if (healed > 0) floats.push(effects.floatText({ ...targetCenter, y: targetCenter.y - 10 }, `+${healed}`, "#8cf0a4"));
      if (restored > 0) floats.push(effects.floatText({ ...targetCenter, y: targetCenter.y + 10 }, `+${restored} MP`, "#8cc8ff"));
    }
    await Promise.all(floats);
  } else if (resolved?.artId === "age" && actorBefore) {
    // A time-mote glides to the target; the ±stat change floats where it lands.
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("age", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore) {
      const stat = resolved.stat === "defense" ? "DEF" : "STR";
      const label = `${resolved.delta >= 0 ? "+" : "−"}${Math.abs(resolved.delta)} ${stat}`;
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), label, resolved.delta >= 0 ? "#8cf0a4" : "#ff9d6b");
    }
  } else if (resolved?.artId === "time-stretch" && actorBefore) {
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("time-stretch", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.effect?.applied) {
      const enemy = targetBefore.player !== actorBefore.player;
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), enemy ? "SLOW" : "HASTE", enemy ? "#70b7ff" : "#8cf0a4");
    }
  } else if (resolved?.artId === "rewind") {
    // The revived ally rises from the placement tile (summon-rise motif, warm palette).
    const revived = findUnit(result.nextState, resolved.revivedUnitId);
    if (revived) {
      await effects.playAbilityVfx("rewind", { actor: actorBefore ?? revived, targets: [revived] });
      await effects.floatText(unitCenter(createBoardMetrics(state.size), revived), "REWIND", "#f7e9c0");
    }
  } else if (resolved?.stance !== undefined && actorBefore) {
    // Witch Doctor dances: a global team/board ritual, never a single-target cast.
    // One VFX (`ritual`) plays against every unit the reducer says the ritual
    // actually reached (`beaconTargetIds`), then every numeric/status outcome the
    // reducer recorded gets its own floating text — heals, MP, buffs, cleanses,
    // and the global blind all read exactly like every other ability's feedback.
    const metrics = createBoardMetrics(state.size);
    const beaconTargets = (resolved.beaconTargetIds ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: beaconTargets });

    const floats = [];
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4"));
    }
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#8cc8ff"));
    }
    if (resolved.buffed?.length && resolved.buffLabel) {
      for (const id of resolved.buffed) {
        const unit = findUnit(state, id);
        if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), resolved.buffLabel, "#ffb45e"));
      }
    }
    for (const id of resolved.cleansed ?? []) {
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), "CLEANSED", "#c89cff"));
    }
    if (resolved.selfBuffed && resolved.selfBuffLabel) {
      floats.push(effects.floatText(unitCenter(metrics, actorBefore), resolved.selfBuffLabel, "#ff9a4c"));
    }
    for (const id of resolved.statusTargets ?? []) {
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), "BLIND", "#f0d77a"));
    }
    await Promise.all(floats);
  } else if (resolved?.command !== undefined && actorBefore) {
    // A King command (Strike / Hold / Pursue / Higher Ground): a global one-turn team
    // order. The banner ritual washes over every living squadmate, then each ally floats
    // the exact buff it just gained — read from getCommandBuffStats on the COMMITTED state
    // (where the King's command is now recorded), so the number already folds in the
    // +1-per-raging-ally scaling and Strike's Pursue bonus, just like the Witch Doctor's
    // dance floats above.
    const metrics = createBoardMetrics(state.size);
    const allies = result.nextState.units.filter(
      (u) => u.hp > 0 && u.player === actorBefore.player && u.id !== actorBefore.id && !getUnitType(u.type).commandOnly
    );
    await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: allies });
    const label = COMMAND_FLOAT[resolved.command];
    if (label) {
      await Promise.all(allies.map((ally) => {
        const amount = getCommandBuffStats(ally, result.nextState)[label.stat] ?? 0;
        return amount > 0
          ? effects.floatText(unitCenter(metrics, ally), `+${amount} ${label.suffix}`, label.color)
          : Promise.resolve();
      }));
    }
  } else if (resolved?.artId === "tether-grab" && actorBefore) {
    // Fire the tether, then — on a landed grab — haul the unit to the Juggernaut's side and
    // land the magic hit if it was an enemy. `state` is still pre-commit, so the target
    // reads at its old tile; a missed enemy grab hauls no one, so float MISS in place.
    const metrics = createBoardMetrics(state.size);
    const target = findUnit(state, resolved.targetId);
    await effects.playAbilityVfx("tether-grab", { actor: actorBefore, targets: target ? [target] : [] });
    // An enemy grab rolls to-hit like any strike — reveal the die before hauling/damaging.
    // An ally grab (rolled === false) is pure repositioning and always lands, so no reveal.
    if (resolved.rolled) await revealRoll({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) }, null, actorBefore);
    if (resolved.missed) {
      if (target) await effects.floatText(unitCenter(metrics, target), "MISS", "#c9d4e8");
    } else {
      if (target && resolved.from && resolved.to) await effects.animateMovement(target.id, resolved.from, resolved.to);
      if (target && resolved.damage > 0) {
        const center = unitCenter(metrics, { position: resolved.to });
        effects.impact(center, resolved.critical, "magic");
        await effects.floatText(center, `-${resolved.damage}`, "#c89cff");
        const after = findUnit(result.nextState, target.id);
        if (!after || after.hp <= 0) await effects.deathDissolve(target.id, resolved.to, teamColor(target.player));
      }
    }
  } else if (resolved?.artId === "rocket-punch" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const target = findUnit(state, resolved.targetId);
    await effects.playAbilityVfx("rocket-punch", { actor: actorBefore, targets: target ? [target] : [] });
    // Rocket Punch always rolls to-hit — reveal the die before the impact resolves.
    await revealRoll({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) }, null, actorBefore);
    if (target) {
      if (resolved.missed) {
        await effects.floatText(unitCenter(metrics, target), "MISS", "#c9d4e8");
      } else {
        const dmg = resolved.damageByTarget?.[target.id] ?? 0;
        const center = unitCenter(metrics, target);
        if (dmg > 0) {
          effects.impact(center, resolved.critical, "physical");
          effects.shake(resolved.critical ? 10 : 7);
          await effects.hitRecoil(target.id, target.position, resolved.critical);
          await effects.floatText(center, `-${dmg}`, "#ff7684");
        }
        if (resolved.stunned) await effects.floatText(center, "STUN", "#ffe45e");
        const after = findUnit(result.nextState, target.id);
        if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
      }
    }
  } else if (resolved?.artId === "recharge" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("recharge", { actor: actorBefore, targets: [actorBefore] });
    const recipient = findUnit(result.nextState, resolved.recipientId) ?? actorBefore;
    if (resolved.mpRestored > 0) await effects.floatText(unitCenter(metrics, recipient), `+${resolved.mpRestored} MP`, "#7fd0ff");
    else if (resolved.hpHealed > 0) await effects.floatText(unitCenter(metrics, recipient), `+${resolved.hpHealed}`, "#8cf0a4");
  } else if (resolved?.artId === "enrich" && actorBefore) {
    // Treant pours power into an ally: MP (or HP if the ally was already full MP).
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("enrich", { actor: actorBefore, target: targetBefore, targets: targetBefore ? [targetBefore] : [] });
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      const unit = findUnit(state, id);
      if (unit && amount > 0) await effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#8cc8ff");
    }
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      const unit = findUnit(state, id);
      if (unit && amount > 0) await effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4");
    }
  } else if (resolved?.artId === "source-shift" && actorBefore) {
    // The Treant's HP and MP pools swap in a shimmer; float the new totals.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("source-shift", { actor: actorBefore, targets: [actorBefore] });
    await effects.floatText(unitCenter(metrics, actorBefore), "SOURCE SHIFT", "#a0e0c0");
  } else if (resolved?.artId === "petrify" && actorBefore) {
    // The grove-guardian roots into an invulnerable stone statue.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("petrify", { actor: actorBefore, targets: [actorBefore] });
    effects.shake(8);
    await effects.floatText(unitCenter(metrics, actorBefore), "PETRIFY", "#d8c9a8");
  } else if (resolved?.artId === "polarity-shift" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("polarity-shift", { actor: actorBefore, targets: [actorBefore] });
    const label = resolved.restorePolarityShift ? "POLARITY SHIFTED" : "POLARITY RESTORED";
    await effects.floatText(unitCenter(metrics, actorBefore), label, "#b08cff");
  } else if (resolved?.artId === "self-destruct" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("self-destruct", { actor: actorBefore, targets: targetsBefore });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#ffffff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    // The core overloads — the Juggernaut is consumed.
    await effects.deathDissolve(actorBefore.id, actorBefore.position, teamColor(actorBefore.player));
  } else if (resolved?.artId === "heavenseeker" && actorBefore) {
    // A holy pulse: true damage to enemies on white tiles AND a heal to allies on them.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("heavenseeker", { actor: actorBefore, targets: targetsBefore });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#fff2a8");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    await Promise.all(Object.entries(resolved.healingByTarget ?? {}).map(([id, amount]) => {
      const ally = findUnit(state, id);
      return ally && amount > 0
        ? effects.floatText(unitCenter(metrics, ally), `+${amount}`, "#8cf0a4")
        : Promise.resolve();
    }));
  } else if (resolved?.artId === "anoint" && actorBefore) {
    // A holy mote glides to the ally; the +1 range float lands where it lights.
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("anoint", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.effect?.applied) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "+1 RNG", "#f7e9c0");
    }
  } else if (resolved?.artId === "purify" && actorBefore) {
    // A clean green-white mote lifts the status stack off the ally.
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("purify", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.cleansed?.includes(targetBefore.id)) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "PURIFIED", "#dfffd8");
    }
  } else if (resolved?.artId === "cleanse" && actorBefore) {
    // A gold-white mote lifts the negative statuses off the ally (buffs stay).
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("cleanse", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.cleansed?.includes(targetBefore.id)) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "CLEANSED", "#fff2c0");
    }
  } else if (resolved?.artId === "flight" && actorBefore) {
    // The Gargoyle surges to the landing tile (dash trail), then a TRUE blast pops on
    // every enemy within a tile of it. `state` is pre-commit, so victims read at their
    // current tiles; the token relocates when the board re-renders after commit.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("flight", { actor: actorBefore, targets: [], path: resolved.path ?? [actorBefore.position] });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#ffffff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "smoke-bomb-riot" && actorBefore) {
    // Riot Cop lobs a canister at the tile; on a landed throw every caught enemy floats
    // BLIND, on a fizzle the tile puffs harmlessly.
    const metrics = createBoardMetrics(state.size);
    const clouded = (resolved.statusTargets ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    await effects.playAbilityVfx("smoke-bomb-riot", { actor: actorBefore, targets: clouded, targetPosition: resolved.center });
    if (resolved.missed) {
      await effects.floatText(unitCenter(metrics, { position: resolved.center }), "FIZZLE", "#b9b19a");
    } else {
      await Promise.all(clouded.map((target) => effects.floatText(unitCenter(metrics, target), "BLIND", "#d9d2c0")));
    }
  } else if (resolved?.artId === "cover" && actorBefore) {
    // Riot Cop and the ally slide through each other's tiles, then he braces (guard pulse).
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    if (targetBefore && resolved.swap) {
      await Promise.all([
        effects.animateMovement(actorBefore.id, actorBefore.position, resolved.swap[actorBefore.id]),
        effects.animateMovement(targetBefore.id, targetBefore.position, resolved.swap[targetBefore.id])
      ]);
    }
    await effects.playAbilityVfx("cover", { actor: actorBefore, targets: targetBefore ? [targetBefore] : [] });
    if (resolved.empowered) {
      const landing = resolved.swap?.[actorBefore.id] ?? actorBefore.position;
      await effects.floatText(unitCenter(metrics, { position: landing }), "+1 STR", "#ff9a4c");
    }
  } else if (resolved?.artId === "lockdown" && actorBefore) {
    // A self-centred crackdown shockwave; every unit caught (allies included) floats LOCKDOWN.
    const metrics = createBoardMetrics(state.size);
    const affected = (resolved.statusTargets ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    await effects.playAbilityVfx("lockdown", { actor: actorBefore, targets: affected });
    effects.shake(9);
    await Promise.all(affected.map((target) => effects.floatText(unitCenter(metrics, target), "LOCKDOWN", "#8fb4e8")));
  } else if (resolved?.artId === "smog" && actorBefore) {
    // A blind cloud rolls out from Virus; every caught enemy floats BLIND (no roll).
    const metrics = createBoardMetrics(state.size);
    const clouded = (resolved.statusTargets ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    await effects.playAbilityVfx("smog", { actor: actorBefore, targets: clouded });
    await Promise.all(clouded.map((target) => effects.floatText(unitCenter(metrics, target), "BLIND", "#f0d77a")));
  } else if (resolved?.artId === "poison-tick" && actorBefore) {
    // Every poisoned enemy convulses for true damage (ignores DEF/Defend).
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("poison-tick", { actor: actorBefore, targets: targetsBefore });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#9be86b");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "explosion" && actorBefore) {
    // The rage ultimate detonates every poisoned enemy, then consumes Virus itself.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("explosion", { actor: actorBefore, targets: targetsBefore });
    effects.shake(10);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#9be86b");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    await effects.deathDissolve(actorBefore.id, actorBefore.position, teamColor(actorBefore.player));
  } else if (resolved?.artId === "dark-tick" && actorBefore) {
    // Every blinded enemy convulses for true damage (ignores DEF/Defend), anywhere.
    const metrics = createBoardMetrics(state.size);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#c8a2ff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "banish-dark" && actorBefore) {
    // The RAGE ultimate: every enemy on a dark tile is destroyed, then Blacksword falls.
    const metrics = createBoardMetrics(state.size);
    effects.shake(12);
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      effects.impact(center, true, "true");
      await effects.hitRecoil(target.id, target.position, true);
      await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    await effects.deathDissolve(actorBefore.id, actorBefore.position, teamColor(actorBefore.player));
  } else if (resolved?.artId === "dark-ether" && actorBefore) {
    // A self crit-charge: no target, just a dark shimmer + a readiness float on Blacksword.
    const metrics = createBoardMetrics(state.size);
    const center = unitCenter(metrics, actorBefore);
    effects.impact(center, false, "magic");
    await effects.floatText(center, "CRIT READY", "#c8a2ff");
  } else if (resolved?.artId === "void-gravity" && actorBefore) {
    await effects.playAbilityVfx("void-gravity", { actor: actorBefore, targets: targetsBefore });
    effects.shake(8);
    await Promise.all(Object.entries(resolved.pushed ?? {}).map(([id, shift]) => {
      const target = findUnit(state, id);
      return target ? effects.animateMovement(id, shift.from, shift.to) : Promise.resolve();
    }));
  } else if (resolved?.artId === "quake" && actorBefore) {
    // A self-centred ground slam: earthen magic ripples out and shakes everyone caught.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("quake", { actor: actorBefore, targets: targetsBefore });
    effects.shake(9);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "magic");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#c8b06a");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    if (resolved.refunded) await effects.floatText(unitCenter(metrics, actorBefore), "MP REFUND", "#8cc8ff");
  } else if (resolved?.artId === "dark-pulse" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("dark-pulse", {
      actor: actorBefore,
      targets: targetsBefore,
      rays: resolved.pulseRays ?? []
    });
    const feedback = [];
    for (const target of targetsBefore) {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const healed = resolved.healingByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        feedback.push((async () => {
          await effects.hitRecoil(target.id, target.position, false);
          await effects.floatText(center, `-${dmg}`, "#c89cff");
          const after = findUnit(result.nextState, target.id);
          if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
        })());
      } else if (healed > 0) {
        feedback.push(effects.floatText(center, `+${healed}`, "#8cf0a4"));
      }
    }
    await Promise.all(feedback);
    if (resolved.refunded) await effects.floatText(unitCenter(metrics, actorBefore), "MP REFUND", "#8cc8ff");
  } else if (resolved?.artId === "thunderous-charge" && actorBefore) {
    // The RAGE ultimate: Clod CHARGES to the chosen tile, then quakes a 2-tile radius —
    // physical damage + a mass stun, launching everyone caught up into a brief pop.
    const metrics = createBoardMetrics(state.size);
    const from = resolved.from ?? actorBefore.position;
    const dest = resolved.center ?? actorBefore.position;
    // Move the live token to the landing tile and slide it in, so the charge reads as a
    // charge (mutating the about-to-be-replaced input state is safe — result.nextState,
    // a clone, already stands Clod on `dest` and overwrites it right after this branch).
    if (from.x !== dest.x || from.y !== dest.y) {
      const live = findUnit(state, actorBefore.id);
      if (live) { live.position = { ...dest }; render(); }
      await effects.animateMovement(actorBefore.id, from, dest);
    }
    await effects.playAbilityVfx("thunderous-charge", { actor: { ...actorBefore, position: dest }, targets: targetsBefore, targetPosition: dest });
    effects.shake(13);
    effects.impact(unitCenter(metrics, { position: dest }), true, "physical");
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) effects.impact(center, false, "physical");
      // Launch the target up and let it drop right back down.
      const bounce = effects.knockUp(target.id, target.position);
      if (dmg > 0) await effects.floatText(center, `-${dmg}`, "#ff7684");
      await bounce;
      if ((resolved.stunnedIds ?? []).includes(target.id)) await effects.floatText(center, "STUN", "#ffe45e");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "focus-prayer" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await revealRoll({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) }, null, actorBefore);
    if (!resolved.missed) {
      await effects.playAbilityVfx("focus-prayer", { actor: actorBefore, targets: targetsBefore });
      const healed = resolved.healingByTarget?.[targetBefore?.id] ?? 0;
      if (targetBefore && healed > 0) {
        await effects.floatText(unitCenter(metrics, targetBefore), `+${healed}`, "#8cf0a4");
      }
    } else if (targetBefore && resolved.effect?.attempted) {
      const statusLabel = resolved.effect.status?.toUpperCase() ?? "STATUS";
      await revealRoll(
        { missed: !resolved.effect.applied, critical: false },
        resolved.effect.applied ? statusLabel : "RESISTED",
        actorBefore
      );
      if (resolved.effect.applied) {
        await effects.playAbilityVfx(resolved.artId, {
          actor: actorBefore,
          target: targetBefore,
          effect: resolved.effect
        });
        await effects.floatText(unitCenter(metrics, targetBefore), statusLabel, "#c89cff");
      }
    }
  } else if (resolved?.artId === "blasting-cap" && resolved.destroyedWall && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const center = unitCenter(metrics, { position: resolved.position });
    await effects.animateAttack(actorBefore, { id: `wall:${positionKey(resolved.position)}`, position: resolved.position }, true, "blasting-cap");
    audio.play("wallBreak");
    effects.impact(center, false, "true");
    effects.deathBurst(center, "#9a9384");
    effects.shake(8);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      if (dmg <= 0) return;
      const targetCenter = unitCenter(metrics, target);
      effects.impact(targetCenter, false, "true");
      await effects.hitRecoil(target.id, target.position, false);
      await effects.floatText(targetCenter, `-${dmg}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.weather && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const beaconTargets = (resolved.beaconTargetIds ?? resolved.targetIds ?? resolved.statusTargets ?? [])
      .map((id) => findUnit(state, id))
      .filter(Boolean);
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: beaconTargets
    });

    const floats = [];
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4"));
    }
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#7fd0ff"));
    }
    const weatherFloat = WEATHER_FLOAT[resolved.artId];
    const statusLabel = resolved.buffLabel ?? weatherFloat?.label;
    if (statusLabel) {
      for (const id of resolved.statusTargets ?? []) {
        const unit = findUnit(state, id);
        if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), statusLabel, weatherFloat?.color ?? "#f7e9c0"));
      }
    }
    if (!floats.length && weatherFloat) {
      floats.push(effects.floatText(unitCenter(metrics, actorBefore), weatherFloat.label, weatherFloat.color));
    }
    await Promise.all(floats);
  } else if (resolved?.artId === "landscaper" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("landscaper", {
      actor: actorBefore,
      targets: targetBefore ? [targetBefore] : [],
      targetPosition: resolved.from
    });
    if (targetBefore && resolved.pushed) {
      await effects.animateMovement(targetBefore.id, resolved.from, resolved.to);
      const wallCenter = unitCenter(metrics, { position: resolved.from });
      effects.impact(wallCenter, false, "physical");
      effects.deathBurst(wallCenter, "#8f7a52");
      await effects.floatText(wallCenter, "WALL", "#c8b06a");
    } else if (targetBefore) {
      const dmg = resolved.damageByTarget?.[targetBefore.id] ?? resolved.damage?.damage ?? 0;
      const center = unitCenter(metrics, targetBefore);
      if (dmg > 0) {
        effects.impact(center, false, "physical");
        effects.shake(7);
        await effects.hitRecoil(targetBefore.id, targetBefore.position, false);
        await effects.floatText(center, `-${dmg}`, "#ff7684");
      }
      const after = findUnit(result.nextState, targetBefore.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(targetBefore.id, targetBefore.position, teamColor(targetBefore.player));
    }
  } else if (resolved?.artId === "great-flood" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("great-flood", { actor: actorBefore, targets: targetsBefore });
    effects.shake(12);

    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "magic");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText({ ...center, y: center.y - 8 }, `-${dmg}`, "#6fb7f2");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));

    const restoreFloats = [];
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) restoreFloats.push(effects.floatText({ ...unitCenter(metrics, unit), y: unitCenter(metrics, unit).y + 10 }, `+${amount}`, "#8cf0a4"));
    }
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) restoreFloats.push(effects.floatText({ ...unitCenter(metrics, unit), y: unitCenter(metrics, unit).y + 10 }, `+${amount} MP`, "#7fd0ff"));
    }
    await Promise.all(restoreFloats);

    await Promise.all(Object.entries(resolved.afterPositions ?? {}).map(([id, to]) => {
      const from = resolved.beforePositions?.[id];
      const unit = findUnit(state, id);
      if (!unit || !from || positionKey(from) === positionKey(to)) return Promise.resolve();
      return effects.animateMovement(id, from, to);
    }));
  } else if (resolved?.damageByTarget && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: targetsBefore
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#c89cff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.healingByTarget && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: targetsBefore
    });
    await Promise.all(targetsBefore.map((target) => {
      const healed = resolved.healingByTarget[target.id] ?? 0;
      const restored = resolved.restoredByTarget?.[target.id] ?? 0;
      const floats = [];
      if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4"));
      if (restored > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${restored} MP`, "#7fd0ff"));
      return Promise.all(floats);
    }));
  } else if (resolved?.effect && actorBefore) {
    const targetBefore = targetsBefore[0];
    if (targetBefore && resolved.effect.attempted) {
      const statusLabel = resolved.effect.status?.toUpperCase() ?? "STATUS";
      await revealRoll(
        { missed: !resolved.effect.applied, critical: false },
        resolved.effect.applied ? statusLabel : "RESISTED",
        actorBefore
      );
      if (resolved.effect.applied) {
        await effects.playAbilityVfx(resolved.artId, {
          actor: actorBefore,
          target: targetBefore,
          effect: resolved.effect
        });
        await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), statusLabel, "#c89cff");
      }
    }
  }
}
