// A critical hit multiplies the pre-Defend base damage (then rounds up). Defined
// here because it is a damage rule; the chance to crit lives in combat.js. Tuned
// for this game's larger numbers — Mini-Tactics' flat +1 reads as nothing on a
// 5-damage swing, so a crit is a half-again hit instead.
export const CRIT_MULTIPLIER = 1.5;

// Damage values are always rounded up after defend so minimum damage remains
// legible in an integer-HP game (1 damage defended is still 1 damage). A crit
// scales the base before Defend halves it, mirroring Mini-Tactics' ordering.
export function resolveDamage({ attacker, defender, type, amount, critical = false }) {
  let baseDamage;
  if (type === "physical") {
    baseDamage = Math.max(1, attacker.strength - defender.defense);
  } else if (type === "magic") {
    baseDamage = Math.max(0, Number(amount ?? attacker.strength));
  } else if (type === "true") {
    baseDamage = Math.max(0, Number(amount ?? 0));
  } else {
    throw new Error(`Unknown damage type: ${type}`);
  }

  if (critical) baseDamage = Math.ceil(baseDamage * CRIT_MULTIPLIER);
  const defended = type !== "true" && defender.defending;
  return {
    type,
    baseDamage,
    damage: defended ? Math.ceil(baseDamage / 2) : baseDamage,
    defended
  };
}
