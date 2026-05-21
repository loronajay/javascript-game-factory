// Timing notes:
// spark_flick cast 420ms  — hit at default 200ms (~48%)
// spark_flick_2 cast 470ms — hit at 200ms
// spark_flick_3 cast 510ms — hit at 210ms
// ember_trail cast 480ms   — hit at 215ms (slow smolder)
// smoke_screen cast 540ms  — utility hit at 225ms
// flare_bite charge 560ms + cast 540ms — lunge peak ~43% = 215ms
// cinder_burst cast 600ms  — hit at 250ms
// cinder_burst_2 cast 660ms — hit at 275ms
// cinder_burst_3 cast 720ms — hit at 300ms
// scorch cast 480ms         — first hit at 200ms, second at 340ms
// magma_surge cast 820ms    — hit at 340ms (~41%)
registerMoveAnimations({
  spark_flick:    { cast: 'anim-cast-spark-flick',    castSound: 'fire',         hit: 'anim-hit-fire-light', hitSound: 'hit-light' },
  spark_flick_2:  { cast: 'anim-cast-spark-flick-2',  castSound: 'fire',         hit: 'anim-hit-fire-light', hitSound: 'hit-light', hitDelay: 200 },
  spark_flick_3:  { cast: 'anim-cast-spark-flick-3',  castSound: 'fire',         hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', hitDelay: 210 },
  heat_haze:      { cast: 'anim-cast-heat-haze' },
  ember_trail:    { cast: 'anim-cast-ember-trail',    castSound: 'fire',         hit: 'anim-hit-ember-burn', hitSound: 'hit-light', hitDelay: 215 },
  ash_veil:       { cast: 'anim-cast-ash-veil',       castSound: 'charge-light' },
  smoke_screen:   { cast: 'anim-cast-smoke-screen',   castSound: 'charge-light', hit: 'anim-hit-smoke-blind', hitSound: 'hit-light', hitDelay: 225 },
  flare_bite:     { chargeClass: 'anim-cast-flare-charge', chargeSound: 'charge-light', chargeSoundCount: 3, chargeSoundInterval: 180,
                    cast: 'anim-cast-flare-bite', castSound: 'fire', hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', lunge: true, hitDelay: 220 },
  cinder_burst:   { cast: 'anim-cast-cinder-burst',   castSound: 'fire',         hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', hitDelay: 250 },
  cinder_burst_2: { cast: 'anim-cast-cinder-burst-2', castSound: 'fire',         hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', hitDelay: 275 },
  cinder_burst_3: { cast: 'anim-cast-cinder-burst-3', castSound: 'fire',         hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', hitDelay: 300 },
  scorch:         { cast: 'anim-cast-scorch',         castSound: 'fire',         hit: 'anim-hit-fire-light', hitSound: 'hit-light', hitDelay: 200 },
  magma_surge:    { cast: 'anim-cast-magma-surge',    castSound: 'fire',         hit: 'anim-hit-fire-heavy', hitSound: 'hit-heavy', hitDelay: 340 },
});
