const _sfx = {};

function loadSfx(id, src) {
  const a = new Audio(src);
  a.preload = 'auto';
  _sfx[id] = a;
}

function playSfx(id) {
  const src = _sfx[id];
  if (!src) return;
  const clone = src.cloneNode();
  clone.volume = src.volume;
  clone.play().catch(() => {});
}

function initSounds() {
  loadSfx('click',        'assets/sounds/button-click.wav');
  loadSfx('invalid',      'assets/sounds/invalid.wav');
  loadSfx('hit-light',    'assets/sounds/combat-sounds/hit-light.wav');
  loadSfx('hit-heavy',    'assets/sounds/combat-sounds/hit-heavy.wav');
  loadSfx('fire',         'assets/sounds/combat-sounds/fire.wav');
  loadSfx('charge-light', 'assets/sounds/combat-sounds/charge-light.wav');
}

function playClick()       { playSfx('click'); }
function playInvalid()     { playSfx('invalid'); }
function playHitLight()    { playSfx('hit-light'); }
function playHitHeavy()    { playSfx('hit-heavy'); }
function playFire()        { playSfx('fire'); }
function playChargeLight() { playSfx('charge-light'); }
