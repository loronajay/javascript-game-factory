// Flor timing notes:
// sprout_tap cast 420ms      — hit at 175ms (~42%)
// petal_mend cast 620ms      — hit at 240ms (~39%)
// root_snare cast 560ms      — hit at 250ms (~45%)
// verdant_guard cast 570ms   — utility self/ally buff
// thorn_bind cast 520ms      — hit at 215ms (~41%)
// toxic_spores cast 540ms    — hit at 225ms (~42%)
// bloom_surge cast 560ms     — utility self-buff
// cleanse cast 520ms         — hit at 230ms (~44%, ally target)
// sprout_tap_2 cast 460ms    — hit at 190ms (~41%)
// pollen_veil cast 560ms     — hit at 235ms (~42%)
// natures_ward cast 580ms    — utility all-ally buff
// petal_mend_2 cast 640ms    — hit at 265ms (~41%)
// sprout_tap_3 cast 500ms    — hit at 205ms (~41%)
// petal_mend_3 cast 700ms    — hit at 290ms (~41%)
// world_tree charge 480ms + cast 820ms — hit at 340ms (~41%)
registerMoveAnimations({
  sprout_tap:    { cast: 'anim-cast-sprout-tap',    castSound: 'beam-light',   hit: 'anim-hit-gaia-light',   hitSound: 'hit-light',  hitDelay: 175 },
  petal_mend:    { cast: 'anim-cast-petal-mend',    castSound: 'charge-light', hit: 'anim-hit-petal-heal',   hitSound: 'beam-light', hitDelay: 240 },
  thorn_bind:    { cast: 'anim-cast-thorn-bind',    castSound: 'beam-light',   hit: 'anim-hit-gaia-heavy',   hitSound: 'hit-heavy',  hitDelay: 215 },
  root_snare:    { cast: 'anim-cast-root-snare',    castSound: 'charge-light', hit: 'anim-hit-root-snare',   hitSound: 'hit-heavy',  hitDelay: 250 },
  verdant_guard: { cast: 'anim-cast-verdant-guard', castSound: 'charge-light' },
  toxic_spores:  { cast: 'anim-cast-toxic-spores',  castSound: 'charge-light', hit: 'anim-hit-toxic-spores', hitSound: 'hit-light',  hitDelay: 225 },
  bloom_surge:   { cast: 'anim-cast-bloom-surge',   castSound: 'charge-light' },
  cleanse:       { cast: 'anim-cast-cleanse',       castSound: 'charge-light', hit: 'anim-hit-cleanse', hitSound: 'beam-light', hitDelay: 230 },
  sprout_tap_2:  { cast: 'anim-cast-sprout-tap-2',  castSound: 'beam-light',   hit: 'anim-hit-gaia-light',   hitSound: 'hit-light',  hitDelay: 190 },
  pollen_veil:   { cast: 'anim-cast-pollen-veil',   castSound: 'charge-light', hit: 'anim-hit-pollen-veil',  hitSound: 'hit-light',  hitDelay: 235 },
  natures_ward:  { cast: 'anim-cast-natures-ward',  castSound: 'charge-light' },
  petal_mend_2:  { cast: 'anim-cast-petal-mend-2',  castSound: 'charge-light', hit: 'anim-hit-petal-heal',   hitSound: 'beam-light', hitDelay: 265 },
  sprout_tap_3:  { cast: 'anim-cast-sprout-tap-3',  castSound: 'beam-light',   hit: 'anim-hit-gaia-heavy',   hitSound: 'hit-heavy',  hitDelay: 205 },
  petal_mend_3:  { cast: 'anim-cast-petal-mend-3',  castSound: 'charge-light', hit: 'anim-hit-petal-heal',   hitSound: 'beam-light', hitDelay: 290 },
  world_tree:    { chargeClass: 'anim-cast-world-tree-charge', chargeSound: 'charge-light', chargeSoundCount: 3, chargeSoundInterval: 220,
                   cast: 'anim-cast-world-tree', castSound: 'beam-light', hit: 'anim-hit-gaia-heavy', hitSound: 'hit-heavy', hitDelay: 340 },
});
