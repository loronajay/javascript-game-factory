const GAME_TRACKS = ['assets/game1.mp3', 'assets/game2.mp3', 'assets/game3.mp3'];

let _menu = null;
let _game = null;

function makePool(path, size) {
  const nodes = Array.from({ length: size }, () => new Audio(path));
  let i = 0;
  return () => {
    const a = nodes[i++ % size];
    a.currentTime = 0;
    a.play().catch(() => {});
  };
}

function makeOnce(path) {
  return () => new Audio(path).play().catch(() => {});
}

export let sfxShoot      = () => {};
export let sfxEnemyDeath = () => {};
export let sfxExplosion  = () => {};
export let sfxPlayerHurt = () => {};
export let sfxShutdown   = () => {};
export let sfxPowerup    = () => {};
export let sfxEnemyShot  = () => {};
export let sfxClick      = () => {};

// Boss sounds (reuse the previously-unwired assets)
export let sfxBossLaser  = () => {};
export let sfxBossCharge = () => {};
export let sfxBossRoar   = () => {};
export let sfxBossHit    = () => {};

export function initAudio() {
  _menu = new Audio('assets/menu.mp3');
  _menu.loop = true;

  sfxShoot      = makePool('assets/player-shoot.wav', 4);
  sfxEnemyDeath = makeOnce('assets/enemy-death.wav');
  sfxExplosion  = makeOnce('assets/explosion.wav');
  sfxPlayerHurt = makeOnce('assets/player-hurt.wav');
  sfxShutdown   = makeOnce('assets/system-shutdown.wav');
  sfxPowerup    = makeOnce('assets/capture-powerup.wav');
  sfxEnemyShot  = makePool('assets/enemy-shot.wav', 3);
  sfxClick      = makeOnce('assets/button-click.wav');

  sfxBossLaser  = makeOnce('assets/big-laser.wav');
  sfxBossCharge = makeOnce('assets/enemy-bomb-incoming.wav');
  sfxBossRoar   = makeOnce('assets/enemy-idle.wav');
  sfxBossHit    = makePool('assets/big-beam.wav', 3);
}

let _runnerLoop = null;

export function sfxRunnerStart() {
  if (_runnerLoop) return;
  _runnerLoop = new Audio('assets/passerby-enemy.wav');
  _runnerLoop.loop = true;
  _runnerLoop.volume = 0.42;
  _runnerLoop.play().catch(() => {});
}

export function sfxRunnerStop() {
  if (!_runnerLoop) return;
  _runnerLoop.pause();
  _runnerLoop = null;
}

export function startMenuMusic() {
  stopGameMusic();
  if (_menu && _menu.paused) {
    _menu.currentTime = 0;
    _menu.play().catch(() => {});
  }
}

export function startGameMusic(withBlastoff) {
  stopGameMusic();
  stopMenuMusic();
  if (withBlastoff) new Audio('assets/blastoff.mp3').play().catch(() => {});
  const track = GAME_TRACKS[Math.floor(Math.random() * GAME_TRACKS.length)];
  _game = new Audio(track);
  _game.loop = true;
  _game.play().catch(() => {});
}

function stopMenuMusic() {
  if (_menu) { _menu.pause(); _menu.currentTime = 0; }
}

function stopGameMusic() {
  if (_game) { _game.pause(); _game.currentTime = 0; _game = null; }
}
