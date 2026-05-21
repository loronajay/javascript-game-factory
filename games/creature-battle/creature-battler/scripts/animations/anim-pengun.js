// Pengun timing notes:
// ice_pebble cast 390ms      — hit at 155ms (~40%)
// cold_feet cast 500ms       — hit at 210ms (~42%)
// snow_blind cast 540ms      — hit at 220ms (~41%)
// frost_nip charge 430ms + cast 500ms — lunge peak ~42% = 210ms
// shatter_chill cast 680ms   — hit at 275ms (~40%)
// glacier_wall cast 520ms    — utility self-buff
// whiteout cast 540ms        — hit at 225ms (~42%)
// ice_pebble_2 cast 430ms    — hit at 175ms (~41%)
// ice_lock cast 580ms        — hit at 245ms (~42%)
// frozen_pulse cast 560ms    — hit at 230ms (~41%)
// blizzard cast 660ms        — hit at 265ms (~40%)
// shatter_chill_2 cast 700ms — hit at 290ms (~41%)
// ice_pebble_3 cast 480ms    — hit at 200ms (~42%)
// shatter_chill_3 cast 760ms — hit at 315ms (~41%)
// absolute_zero charge 520ms + cast 640ms — lunge peak ~42% = 270ms
registerMoveAnimations({
  ice_pebble:      { cast: 'anim-cast-ice-pebble',      castSound: 'beam-light',   hit: 'anim-hit-ice-light',      hitSound: 'hit-light',  hitDelay: 155 },
  cold_feet:       { cast: 'anim-cast-cold-feet',       castSound: 'charge-light', hit: 'anim-hit-freeze-status',  hitSound: 'hit-light',  hitDelay: 210 },
  glacier_wall:    { cast: 'anim-cast-glacier-wall',    castSound: 'charge-light' },
  snow_blind:      { cast: 'anim-cast-snow-blind',      castSound: 'beam-light',   hit: 'anim-hit-snow-blind',     hitSound: 'hit-light',  hitDelay: 220 },
  whiteout:        { cast: 'anim-cast-whiteout',        castSound: 'beam-light',   hit: 'anim-hit-snow-blind',     hitSound: 'hit-light',  hitDelay: 225 },
  frost_nip:       { chargeClass: 'anim-cast-frost-charge', chargeSound: 'charge-light', chargeSoundCount: 2, chargeSoundInterval: 160,
                     cast: 'anim-cast-frost-nip', castSound: 'beam-light', hit: 'anim-hit-ice-heavy', hitSound: 'hit-heavy', lunge: true, hitDelay: 210 },
  shatter_chill:   { cast: 'anim-cast-shatter-chill',   castSound: 'beam-light',   hit: 'anim-hit-ice-heavy',      hitSound: 'hit-heavy',  hitDelay: 275 },
  ice_pebble_2:    { cast: 'anim-cast-ice-pebble-2',    castSound: 'beam-light',   hit: 'anim-hit-ice-light',      hitSound: 'hit-light',  hitDelay: 175 },
  ice_lock:        { cast: 'anim-cast-ice-lock',        castSound: 'charge-light', hit: 'anim-hit-freeze-status',  hitSound: 'hit-light',  hitDelay: 245 },
  frozen_pulse:    { cast: 'anim-cast-frozen-pulse',    castSound: 'beam-light',   hit: 'anim-hit-ice-heavy',      hitSound: 'hit-heavy',  hitDelay: 230 },
  blizzard:        { cast: 'anim-cast-blizzard',        castSound: 'beam-light',   hit: 'anim-hit-ice-heavy',      hitSound: 'hit-heavy',  hitDelay: 265 },
  shatter_chill_2: { cast: 'anim-cast-shatter-chill-2', castSound: 'beam-light',  hit: 'anim-hit-ice-heavy',      hitSound: 'hit-heavy',  hitDelay: 290 },
  ice_pebble_3:    { cast: 'anim-cast-ice-pebble-3',    castSound: 'beam-light',   hit: 'anim-hit-ice-heavy',      hitSound: 'hit-heavy',  hitDelay: 200 },
  shatter_chill_3: { cast: 'anim-cast-shatter-chill-3', castSound: 'beam-light',  hit: 'anim-hit-ice-heavy',      hitSound: 'hit-heavy',  hitDelay: 315 },
  absolute_zero:   { chargeClass: 'anim-cast-absolute-zero-charge', chargeSound: 'charge-light', chargeSoundCount: 3, chargeSoundInterval: 160,
                     cast: 'anim-cast-absolute-zero', castSound: 'beam-light', hit: 'anim-hit-ice-heavy', hitSound: 'hit-heavy', lunge: true, hitDelay: 270 },
});
