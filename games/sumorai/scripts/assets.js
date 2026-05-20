// Preloads all sprite images and sound files from the extracted asset folders.
// Call loadAssets(onReady) once; then use getSprite(sprite, frame) and getSound(name).

// Sprites that use .png instead of .svg
const PNG_SPRITES = new Set([
  'Stage/forest',
  'Floor_Sprite/bridge',
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
  'P1_-_Shield': [
    '_0000_Layer-1', '_0000_Layer-2', '_0000_Layer-3',
    '_0001_Layer-2', '_0001_Layer-3', '_0001_Layer-4',
    '_0002_Layer-3', '_0003_Layer-2', '_0003_Layer-4',
  ],
  'p1_-_stamina': ['s0','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'],
  'p2_-_stamina': ['s0','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'],
  'p1_meter': ['p1_frame','p1_frame2','p1_frame3','p1_frame4','p1_frame5','p1_frame6'],
  'p2_meter': ['p2_frame','p2_frame2','p2_frame3','p2_frame4','p2_frame5','p2_frame6'],
  'p1_-_shadow': ['costume1'],
  'p1_blood': ['costume1','costume2','costume3','costume4','costume5','costume6','costume7','costume8'],
  'P1_-_Death': ['1','2','3'],
  'mash_p1': ['keyboard1', 'keyboard_2'],
  'mash_p2': ['UI_Controller_Keys_g156', 'UI_Controller_Keys_g157'],
  'ROUND_STARTER': ['round_1','round_2','round_3','round_4','round_5','FIGHT!','GAME_OVER','P1_Wins','P2_Wins'],
  'spotlight': ['costume1'],
};

const SOUND_DEFS = [
  // name → file path under assets/sounds/
  ['hit_p1',       'Player_1__hit.wav'],
  ['swing_p1',     'Player_1__swing.wav'],
  ['hurt_p1',      'Player_1__hurt.mp3'],
  ['death_p1',     'Player_1__death.wav'],
  ['dash_p1',      'Player_1__dash.wav'],
  ['dash2_p1',     'Player_1__dash2.wav'],
  ['shield_p1',    'Player_1__shield.wav'],
  ['hit_p2',       'Player_2__hit.wav'],
  ['swing_p2',     'Player_2__swing.wav'],
  ['hurt_p2',      'Player_2__hurt.mp3'],
  ['death_p2',     'Player_2__death.wav'],
  ['dash_p2',      'Player_2__dash.wav'],
  ['dash2_p2',     'Player_2__dash2.wav'],
  ['shield_p2',    'Player_2__shield.wav'],
  ['shield2',      'P1_-_Shield__shield2.wav'],
  ['ching',        'Stage__ching.mp3'],
  ['hit_charge',   'ching__hit-charge.wav'],
  ['explosion',    'P1_-_Death__explosion.wav'],
  ['proj_hit',     'P1_-_projectile__hit.wav'],
  ['woods',        'Stage__woods.wav'],
  ['are_you_ready','ROUND_STARTER__are-you-ready.wav'],
  ['fight',        'ROUND_STARTER__fight!.wav'],
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
