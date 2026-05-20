// Preloads all sprite images and sound files from the extracted asset folders.
// Call loadAssets(onReady) once; then use getSprite(sprite, frame) and getSound(name).

// Sprites that use .png instead of .svg
const PNG_SPRITES = new Set([
  'Stage/forest',
  'Floor_Sprite/bridge',
  'P1_-_Wins/p1-0-wins',
  'P1_-_Wins/p1-1-win',
  'P1_-_Wins/p1-2-wins',
  'P1_-_Wins/p1-3-wins',
  'P2_-_Wins/p2-0-wins',
  'P2_-_Wins/p2-1-win',
  'P2_-_Wins/p2-2-wins',
  'P2_-_Wins/p2-3-wins',
]);

const SPRITE_DEFS = {
  Player_1: [
    'idle', 'attack', 'attack2', 'attack3', 'attack4', 'attack5', 'attack6',
    'hurt', 'run1', 'run2', 'run3', 'run4', 'run5', 'run6', 'run7', 'run8',
    'gridlock', 'dash1', 'dash2', 'dash3',
    'death1', 'death2', 'death3', 'death4', 'death5', 'death6',
    'throw1', 'throw2', 'throw3',
  ],
  Stage:       ['forest'],
  Floor_Sprite: ['bridge'],
  Platforms:   ['costume2'],
  'P1_-_projectile': ['costume1'],
  'P1_hitbox': ['costume1', 'costume2'],
  'P2_-_Shield': [
    '_0000_Layer-1', '_0000_Layer-2', '_0000_Layer-3',
    '_0001_Layer-2', '_0001_Layer-3', '_0001_Layer-4',
    '_0002_Layer-3', '_0003_Layer-2', '_0003_Layer-4',
  ],
  'p1_-_stamina': ['s0','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'],
  'p2_-_stamina': ['s0','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'],
  'p1_meter': ['p1_frame','p1_frame2','p1_frame3','p1_frame4','p1_frame5','p1_frame6'],
  'p2_meter': ['p2_frame','p2_frame2','p2_frame3','p2_frame4','p2_frame5','p2_frame6'],
  'P1_-_Wins': ['p1-0-wins','p1-1-win','p1-2-wins','p1-3-wins'],
  'P2_-_Wins': ['p2-0-wins','p2-1-win','p2-2-wins','p2-3-wins'],
  'shield': ['shield-1','shield-2','shield-3','shield-4','shield-5','shield-6','shield-7','shield-8','shield-9'],
  'ching':  ['ching-1','ching-2','ching-3','ching-4','ching-5'],
  'blood':  ['blood1','blood2','blood3','blood4','blood5','blood6','blood7','blood8'],
  'p1_-_shadow': ['costume1'],
  'blood':    ['blood1','blood2','blood3','blood4','blood5','blood6','blood7','blood8'],
  'P1_-_Death': ['1','2','3'],
  'mash_p1': ['keyboard1', 'keyboard_2'],
  'mash_p2': ['UI_Controller_Keys_g156', 'UI_Controller_Keys_g157'],
  'ROUND_STARTER': ['round_1','round_2','round_3','round_4','round_5','FIGHT!','GAME_OVER','P1_Wins','P2_Wins'],
  'spotlight': ['costume1'],
};

const SOUND_DEFS = [
  ['swing',         'swing.wav'],
  ['throw',         'throw.wav'],
  ['hit',           'hit.wav'],
  ['hurt',          'hurt.mp3'],
  ['death',         'death.wav'],
  ['dash',          'dash-charge.wav'],
  ['dash2',         'dash-attack.wav'],
  ['shield',        'shield.wav'],
  ['ching',         'ching.mp3'],
  ['explosion',     'Death__explosion.wav'],
  ['proj_hit',      'projectile__hit.wav'],
  ['gridlock_end',  'gridlock-disengage.wav'],
  ['bg_music',      'bg-music.wav'],
  ['are_you_ready', 'ROUND_STARTER__are-you-ready.wav'],
  ['fight',         'ROUND_STARTER__fight!.wav'],
];

const sprites = {};
const sounds  = {};

function loadAssets(onReady) {
  let pending = 0;

  function tick() {
    pending--;
    if (pending === 0) onReady({ sprites, sounds });
  }

  // Load sprites
  for (const [spriteName, frames] of Object.entries(SPRITE_DEFS)) {
    sprites[spriteName] = {};
    for (const frame of frames) {
      pending++;
      const img = new Image();
      img.onload  = tick;
      img.onerror = tick; // skip missing gracefully
      const ext = PNG_SPRITES.has(`${spriteName}/${frame}`) ? '.png' : '.svg';
      img.src = `assets/sprites/${spriteName}/${frame}${ext}`;
      sprites[spriteName][frame] = img;
    }
  }

  // Load sounds
  for (const [name, file] of SOUND_DEFS) {
    pending++;
    const audio = new Audio(`assets/sounds/${file}`);
    audio.addEventListener('canplaythrough', tick, { once: true });
    audio.addEventListener('error', tick, { once: true });
    sounds[name] = audio;
  }
}

function getSprite(spriteName, frame) {
  return sprites[spriteName]?.[frame] ?? null;
}

function getSound(name) {
  return sounds[name] ?? null;
}

export { loadAssets, getSprite, getSound };
