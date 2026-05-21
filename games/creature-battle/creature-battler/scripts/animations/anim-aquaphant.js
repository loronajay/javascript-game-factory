// Aquaphant timing notes:
// bubble_shot cast 430ms     — hit at 180ms (~42%)
// bubble_shot_2 cast 470ms   — hit at 195ms (~41%)
// bubble_shot_3 cast 510ms   — hit at 205ms (~40%)
// healing_wave cast 560ms    — hit at 240ms (~43%, self-heal)
// tidal_bump charge 460ms + cast 520ms — lunge peak ~43% = 225ms
// undertow cast 560ms        — utility hit at 250ms (~45%)
// whirlpool cast 580ms       — utility hit at 245ms (~42%)
// surge_crash cast 660ms     — hit at 260ms (~39%)
// surge_crash_2 cast 700ms   — hit at 290ms (~41%)
// surge_crash_3 cast 740ms   — hit at 305ms (~41%)
// torrent charge 480ms + cast 560ms — lunge peak ~44% = 245ms
registerMoveAnimations({
  bubble_shot:   { cast: 'anim-cast-bubble-shot',   castSound: 'beam-light',   hit: 'anim-hit-water-light', hitSound: 'hit-light', hitDelay: 180 },
  bubble_shot_2: { cast: 'anim-cast-bubble-shot-2', castSound: 'beam-light',   hit: 'anim-hit-water-light', hitSound: 'hit-light', hitDelay: 195 },
  bubble_shot_3: { cast: 'anim-cast-bubble-shot-3', castSound: 'beam-light',   hit: 'anim-hit-water-heavy', hitSound: 'hit-heavy', hitDelay: 205 },
  soak_hide:     { cast: 'anim-cast-soak-hide',     castSound: 'charge-light' },
  healing_wave:  { cast: 'anim-cast-healing-wave',  castSound: 'charge-light', hit: 'anim-hit-water-heal',  hitSound: 'beam-light', hitDelay: 240 },
  tidal_bump:    { chargeClass: 'anim-cast-tidal-charge', chargeSound: 'charge-light', chargeSoundCount: 2, chargeSoundInterval: 190,
                   cast: 'anim-cast-tidal-bump', castSound: 'beam-light', hit: 'anim-hit-water-heavy', hitSound: 'hit-heavy', lunge: true, hitDelay: 225 },
  hydro_skin:    { cast: 'anim-cast-hydro-skin',    castSound: 'charge-light' },
  undertow:      { cast: 'anim-cast-undertow',      castSound: 'charge-light', hit: 'anim-hit-undertow',    hitSound: 'hit-light', hitDelay: 250 },
  surge_crash:   { cast: 'anim-cast-surge-crash',   castSound: 'beam-light',   hit: 'anim-hit-water-heavy', hitSound: 'hit-heavy', hitDelay: 260 },
  whirlpool:     { cast: 'anim-cast-whirlpool',     castSound: 'beam-light',   hit: 'anim-hit-whirlpool',   hitSound: 'hit-light', hitDelay: 245 },
  surge_crash_2: { cast: 'anim-cast-surge-crash-2', castSound: 'beam-light',   hit: 'anim-hit-water-heavy', hitSound: 'hit-heavy', hitDelay: 290 },
  surge_crash_3: { cast: 'anim-cast-surge-crash-3', castSound: 'beam-light',   hit: 'anim-hit-water-heavy', hitSound: 'hit-heavy', hitDelay: 305 },
  torrent:       { chargeClass: 'anim-cast-torrent-charge', chargeSound: 'charge-light', chargeSoundCount: 2, chargeSoundInterval: 220,
                   cast: 'anim-cast-torrent', castSound: 'beam-light', hit: 'anim-hit-water-heavy', hitSound: 'hit-heavy', lunge: true, hitDelay: 245 },
});
