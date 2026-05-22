const _sfx = {};
let _battleMusic = null;
let _battleMusicPlaying = false;

function loadSfx(id, src) {
  const a = new Audio(src);
  a.preload = 'auto';
  _sfx[id] = a;
}

function loadMusic(src) {
  const a = new Audio(src);
  a.preload = 'auto';
  a.loop = true;
  a.volume = 0.55;
  return a;
}

function playSfx(id) {
  const src = _sfx[id];
  if (!src) return;
  const clone = src.cloneNode();
  clone.volume = src.volume;
  clone.play().catch(() => {});
}

function initSounds() {
  loadSfx('click',        'creature-battler/assets/sounds/button-click.wav');
  loadSfx('invalid',      'creature-battler/assets/sounds/invalid.wav');
  loadSfx('hit-light',    'creature-battler/assets/sounds/combat-sounds/hit-light.wav');
  loadSfx('hit-heavy',    'creature-battler/assets/sounds/combat-sounds/hit-heavy.wav');
  loadSfx('fire',         'creature-battler/assets/sounds/combat-sounds/fire.wav');
  loadSfx('charge-light', 'creature-battler/assets/sounds/combat-sounds/charge-light.wav');
  loadSfx('beam-light',   'creature-battler/assets/sounds/combat-sounds/beam-light.mp3');
  _battleMusic = loadMusic('creature-battler/assets/sounds/battle-theme.mp3');
}

function startBattleMusic() {
  if (!_battleMusic || _battleMusicPlaying) return;
  _battleMusicPlaying = true;
  _battleMusic.play().catch(() => { _battleMusicPlaying = false; });
}

function stopBattleMusic() {
  if (!_battleMusic) return;
  _battleMusic.pause();
  _battleMusic.currentTime = 0;
  _battleMusicPlaying = false;
}

function playClick()       { playSfx('click'); }
function playInvalid()     { playSfx('invalid'); }
function playHitLight()    { playSfx('hit-light'); }
function playHitHeavy()    { playSfx('hit-heavy'); }
function playFire()        { playSfx('fire'); }
function playChargeLight() { playSfx('charge-light'); }
