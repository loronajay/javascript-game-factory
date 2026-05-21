// flare_bite charge: 3 sounds at 0/180/360ms synced with flash peaks at 8%/38%/68% of 560ms
// flare_bite hitDelay: ~40% of 540ms cast = peak at ~216ms
registerMoveAnimations({
  spark_flick:  { cast: 'anim-cast-spark-flick',  castSound: 'fire', hit: 'anim-hit-fire-light', hitSound: 'hit-light' },
  heat_haze:    { cast: 'anim-cast-heat-haze' },
  flare_bite:   { chargeClass: 'anim-cast-flare-charge', chargeSound: 'charge-light', chargeSoundCount: 3, chargeSoundInterval: 180,
                  cast: 'anim-cast-flare-bite', castSound: 'fire', hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', lunge: true, hitDelay: 220 },
  cinder_burst: { cast: 'anim-cast-cinder-burst', castSound: 'fire', hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy' },
});
