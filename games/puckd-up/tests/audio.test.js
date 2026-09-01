import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createAudio, MIX } from '../scripts/audio/audio.js';
import { SOUNDTRACK, SFX } from '../scripts/audio/catalog.js';
test('menu transitions preserve button feedback and paused menus can click', () => {
    const { audio, media, setTime } = fixture();
    audio.unlock();
    audio.handle({ type: 'button-click' });
    audio.handle({ type: 'screen', screen: 'setup' });
    const button = media.find(m => m.src === SFX.button);
    assert.equal(button.paused, false);
    audio.handle({ type: 'screen', screen: 'paused' });
    setTime(100);
    audio.handle({ type: 'button-click' });
    assert.equal(button.plays, 2);
    audio.setMuted(true);
    assert.ok(media.every(m => m.paused));
    audio.dispose();
});
function fixture(fail = false) {
    const media = [];
    let now = 0;
    const audio = createAudio({ random: () => .999, now: () => now, createMedia: src => {
            const item = { src, paused: true, plays: 0, currentTime: 0, volume: 1, play() {
                    this.plays++;
                    this.paused = false;
                    return fail ? Promise.reject(Error('autoplay')) : Promise.resolve();
                }, pause() {
                    this.paused = true;
                }, removeAttribute() {
                }, load() {
                } };
            media.push(item);
            return item;
        } });
    return { audio, media, setTime: value => now = value };
}
test('all supplied soundtrack and effect files are mapped to real assets', () => {
    assert.equal(SOUNDTRACK.length, 6);
    assert.equal(Object.keys(SFX).length, 10);
    for (const url of [...SOUNDTRACK, ...Object.values(SFX)])
        assert.ok(existsSync(new URL(url)), url);
});
test('goal explosions play once and the music-to-effects mix stays balanced', () => {
    const { audio, media, setTime } = fixture();
    audio.unlock();
    audio.setScreen('playing');
    audio.handle({ type: 'goal', playerScored: true });
    audio.handle({ type: 'goal', playerScored: true });
    const explosion = media.find(m => m.src === SFX.explosion);
    const music = media.find(m => m.src === SOUNDTRACK[0]);
    assert.equal(explosion.plays, 1);
    assert.equal(music.volume, MIX.music);
    assert.equal(explosion.volume, MIX.explosion);
    assert.ok(MIX.music >= .3);
    assert.ok(MIX.puck <= .55 && MIX.wall <= .4 && MIX.explosion <= .6);
    audio.handle({ type: 'screen', screen: 'result' });
    assert.equal(explosion.paused, false);
    audio.setScreen('playing');
    setTime(1100);
    audio.handle({ type: 'goal', playerScored: false });
    assert.equal(explosion.plays, 2);
    audio.dispose();
});
test('audio waits for a gesture, loops ambience only during play and rotates music', () => {
    const { audio, media } = fixture();
    audio.setScreen('playing');
    assert.equal(media.length, 0);
    audio.unlock();
    const music = media.find(m => m.src === SOUNDTRACK[0]);
    assert.equal(music.plays, 1);
    assert.equal(media.find(m => m.src === SFX.crowd).loop, true);
    music.onended();
    assert.equal(music.src, SOUNDTRACK[1]);
    assert.equal(music.plays, 2);
    audio.setScreen('paused');
    assert.ok(media.every(m => m.paused));
    audio.setScreen('playing');
    audio.setMuted(true);
    assert.ok(media.every(m => m.paused));
    audio.dispose();
    audio.unlock();
    assert.ok(media.every(m => m.paused));
});
test('every wall impact plays, including rapid hits, using a bounded pool of voices', () => {
    const { audio, media } = fixture();
    audio.unlock();
    audio.setScreen('playing');
    for (let i = 0; i < 40; i++)
        audio.handle({ type: 'wall-hit' });
    const walls = media.filter(m => m.src === SFX.wall);
    assert.equal(walls.reduce((n, m) => n + m.plays, 0), 40);
    assert.ok(walls.length > 1 && walls.length <= 4);
    audio.dispose();
    assert.ok(media.every(m => m.paused));
});
test('rejected media playback does not reject the game action', async () => {
    const { audio } = fixture(true);
    audio.unlock();
    audio.handle({ type: 'button-click' });
    await new Promise(resolve => setImmediate(resolve));
    audio.dispose();
});
test('playlist loops every track without resetting on rematch or mute', () => {
    const { audio, media } = fixture();
    audio.unlock();
    const music = media.find(m => m.src === SOUNDTRACK[0]);
    for (let i = 1; i <= 12; i++) {
        music.onended();
        assert.equal(music.src, SOUNDTRACK[i % 6]);
    }
    music.onended();
    music.currentTime = 42;
    audio.setScreen('playing');
    audio.handle({ type: 'match-start' });
    audio.setMuted(true);
    audio.setMuted(false);
    assert.equal(music.src, SOUNDTRACK[1]);
    assert.equal(music.currentTime, 42);
    audio.dispose();
});
test('a queued ended event cannot restart music while paused or muted', () => {
    const { audio, media } = fixture();
    audio.unlock();
    const music = media[0];
    audio.setMuted(true);
    music.onended();
    assert.equal(music.paused, true);
    audio.setMuted(false);
    audio.setScreen('paused');
    music.onended();
    assert.equal(music.paused, true);
    audio.dispose();
});
test('unavailable audio hardware does not prevent user actions', () => {
    const audio = createAudio({ createMedia() {
            throw Error('Audio unavailable');
        } });
    assert.doesNotThrow(() => {
        audio.unlock();
        audio.handle({ type: 'button-click' });
        audio.dispose();
    });
});
