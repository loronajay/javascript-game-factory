// Damage values are always rounded up after defend so minimum damage remains
// legible in an integer-HP game (1 damage defended is still 1 damage).
export function resolveDamage({ attacker, defender, type, amount }) {
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

  const defended = type !== "true" && defender.defending;
  return {
    type,
    baseDamage,
    damage: defended ? Math.ceil(baseDamage / 2) : baseDamage,
    defended
  };
}
