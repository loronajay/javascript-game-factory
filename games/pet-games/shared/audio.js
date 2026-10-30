// Small generated cues: no media downloads, and sound starts only after a gesture.
export function createPetGameAudio() {
  let context = null;
  let muted = false;
  let previous = {};
  let menuActive = true;
  const menuMusic = new Audio(new URL('../../../farm/assets/sounds/menus/pet-minigame-menu.mp3', import.meta.url).href);
  menuMusic.loop = true;
  menuMusic.volume = .2;
  menuMusic.preload = 'none';
  try { muted = localStorage.getItem('jgf.pet-games.muted') === 'true'; } catch {}
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  const paint = () => { button.textContent = muted ? 'Sound: off' : 'Sound: on'; button.setAttribute('aria-pressed', String(!muted)); button.setAttribute('aria-label', muted ? 'Turn game sounds on' : 'Mute game sounds'); };
  paint();
  const toolbar = document.querySelector('.topbar');
  if (toolbar) toolbar.append(button);
  else { Object.assign(button.style,{position:'absolute',top:'16px',right:'16px',zIndex:'10'}); document.querySelector('.world-menu')?.append(button); }
  function unlock() {
    if (muted) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    void context.resume().catch(() => {});
    if (menuActive && !document.hidden) void menuMusic.play().catch(() => {});
  }
  button.addEventListener('click', () => { muted = !muted; paint(); try { localStorage.setItem('jgf.pet-games.muted',String(muted)); } catch {} if (!muted) unlock(); else menuMusic.pause(); });
  window.addEventListener('pagehide',()=>menuMusic.pause());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)menuMusic.pause();else if(context && menuActive && !muted)void menuMusic.play().catch(()=>{});});
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  const cues = { countdown:[440,440,.08], go:[660,990,.18], jump:[350,750,.12], impact:[160,65,.12], splash:[420,55,.28], finish:[520,1040,.35] };
  function play(kind) {
    if (muted || !context || context.state !== 'running' || document.hidden) return;
    const cue = cues[kind];
    if (!cue) return;
    const [from,to,duration] = cue;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime;
    oscillator.type = kind === 'impact' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.1, at + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return {
    play,
    setMenuActive(active) { menuActive = active; if (!active) menuMusic.pause(); else if (context && !muted && !document.hidden) void menuMusic.play().catch(()=>{}); },
    reset() { previous = {}; },
    observe(next) {
      if (next.countdown > 0 && next.countdown !== previous.countdown) play('countdown');
      if (previous.countdown > 0 && next.countdown === 0) play('go');
      if (next.jumping && !previous.jumping) play('jump');
      if (next.impact > .5 && !(previous.impact > .5)) play('impact');
      if (next.out > (previous.out ?? 0)) play('splash');
      previous = {...next};
    },
  };
}
