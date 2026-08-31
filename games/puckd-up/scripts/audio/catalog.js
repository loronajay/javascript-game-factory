// URLs resolve relative to this module, including when hosted under /games/puckd-up/.
const asset = path => new URL(`../../assets/sounds/${path}`, import.meta.url).href;
export const SFX = Object.freeze({
    wall: asset('sfx/wall-hit.wav'),
    puckA: asset('sfx/puck-hit-a.wav'),
    puckB: asset('sfx/puck-hit-b.wav'),
    fire: asset('sfx/on-fire.wav'),
    go: asset('sfx/go.wav'),
    end: asset('sfx/game-end.wav'),
    crowd: asset('sfx/crowd-ambience.mp3'),
    tick: asset('sfx/countdown-tick.wav'),
    button: asset('sfx/button-click.wav'),
});
export const SOUNDTRACK = Object.freeze([
    'arcade-fever', 'heart-on-the-table', 'in-the-air', 'love-loop', 'puck-you', 'rollercoaster',
].map(name => asset(`soundtrack/${name}.mp3`)));
