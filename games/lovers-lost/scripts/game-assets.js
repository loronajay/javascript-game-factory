function loadGameAssets(onReady) {
  const mk = (src) => { const img = new Image(); img.src = src; return img; };

  const images = {
    boy:          mk('images/boy.png'),
    girl:         mk('images/girl.png'),
    sword:        mk('images/SHORT SWORD.png'),
    birds:        [mk('images/red1.png'), mk('images/red2.png'), mk('images/red3.png')],
    goblinIdle:   mk('images/goblin-idle.png'),
    goblinAttack: mk('images/goblin-attack.png'),
    goblinTakeHit:mk('images/goblin-take-hit.png'),
    goblinDeath:  mk('images/goblin-death.png'),
    arrows:       mk('images/arrows.png'),
  };

  const emoteImages = {
    heart:           mk('images/emojis/heart.png'),
    'middle-finger': mk('images/emojis/middle-finger.png'),
    smile:           mk('images/emojis/smile.png'),
    crying:          mk('images/emojis/crying.png'),
  };

  const all = [
    images.boy, images.girl, images.sword,
    ...images.birds,
    images.goblinIdle, images.goblinAttack, images.goblinTakeHit, images.goblinDeath,
    images.arrows,
    ...Object.values(emoteImages),
  ];

  let loaded = 0;
  function onLoad() { if (++loaded >= all.length) onReady(images, emoteImages); }
  all.forEach(img => { img.onload = onLoad; img.onerror = onLoad; });
}

export { loadGameAssets };
