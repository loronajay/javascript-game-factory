// Suit lore: the reserve charge lights the next few steps; batteries restore useful reach.
// Keep these values together so readability can be tuned without changing map geometry.
const RESERVE = Object.freeze({ beamIntensity: 8, beamDistance: 10, suitIntensity: 1.3, suitDistance: 5.5, fogDensity: 0.075 });
const CHARGED = Object.freeze({ beamIntensity: 31, beamDistance: 26, suitIntensity: 6.2, suitDistance: 11, fogDensity: 0.04 });
export function getSuitLighting(player, now) {
  return now < player.powerUntil ? CHARGED : RESERVE;
}
