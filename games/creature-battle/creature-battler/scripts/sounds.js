const _sfx = {};
let _battleMusic = null;
let _battleMusicPlaying = false;
let _menuMusic = null;
let _menuMusicPlaying = false;
let _winnerSfx = null;
let _loserSfx = null;

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
  // Intelligence / Spirit / Speed route sounds — mapped to closest existing assets
  // until dedicated audio files are added.
  loadSfx('hit-magic',          'creature-battler/assets/sounds/combat-sounds/hit-light.wav');
  loadSfx('charge-heavy',       'creature-battler/assets/sounds/combat-sounds/charge-light.wav');
  loadSfx('charge-medium',      'creature-battler/assets/sounds/combat-sounds/charge-light.wav');
  loadSfx('hit-heal',           'creature-battler/assets/sounds/combat-sounds/charge-light.wav');
  loadSfx('defend',             'creature-battler/assets/sounds/combat-sounds/charge-light.wav');
  loadSfx('hit-physical-light', 'creature-battler/assets/sounds/combat-sounds/hit-light.wav');
  loadSfx('hit-physical-heavy', 'creature-battler/assets/sounds/combat-sounds/hit-heavy.wav');
  loadSfx('hit-status',         'creature-battler/assets/sounds/combat-sounds/hit-light.wav');
  _battleMusic = loadMusic('creature-battler/assets/sounds/battle-theme.mp3');
  _menuMusic   = loadMusic('creature-battler/assets/sounds/menu.mp3');
  _winnerSfx   = loadMusic('creature-battler/assets/sounds/winner.mp3');
  _winnerSfx.loop = false;
  _loserSfx    = loadMusic('creature-battler/assets/sounds/loser.wav');
  _loserSfx.loop = false;
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

function startMenuMusic() {
  if (!_menuMusic || _menuMusicPlaying) return;
  _menuMusicPlaying = true;
  _menuMusic.play().catch(() => { _menuMusicPlaying = false; });
}

function stopMenuMusic() {
  if (!_menuMusic) return;
  _menuMusic.pause();
  _menuMusic.currentTime = 0;
  _menuMusicPlaying = false;
}

function playWinnerMusic() {
  if (!_winnerSfx) return;
  _winnerSfx.currentTime = 0;
  _winnerSfx.play().catch(() => {});
}

function playLoserMusic() {
  if (!_loserSfx) return;
  _loserSfx.currentTime = 0;
  _loserSfx.play().catch(() => {});
}

function stopResultsMusic() {
  if (_winnerSfx) { _winnerSfx.pause(); _winnerSfx.currentTime = 0; }
  if (_loserSfx)  { _loserSfx.pause();  _loserSfx.currentTime = 0;  }
}

function playClick()       { playSfx('click'); }
function playInvalid()     { playSfx('invalid'); }
function playHitLight()    { playSfx('hit-light'); }
function playHitHeavy()    { playSfx('hit-heavy'); }
function playFire()        { playSfx('fire'); }
function playChargeLight() { playSfx('charge-light'); }
