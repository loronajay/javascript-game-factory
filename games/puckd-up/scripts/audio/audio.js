import { SFX, SOUNDTRACK } from './catalog.js';
import { createPlaylist } from './playlist.js';
import { getPuckFeedback } from '../render/puck-feedback.js';
export const MIX = Object.freeze({
    music: .34, crowd: .12, button: .36, tick: .5, go: .5,
    end: .58, explosion: .56, wall: .34, puck: .5, fire: .5,
});
// Browser media stays outside simulation. No eager downloads, unbounded voices,
// or autoplay errors can block starting a game. dispose() releases every channel.
export function createAudio({ createMedia = src => new Audio(src), now = () => performance.now(), muted = false, random = Math.random } = {}) {
    const channels = new Map(), lastPlayed = new Map();
    const playlist = createPlaylist({ ids: SOUNDTRACK, random });
    let unlocked = false, disposed = false, screen = 'menu', hidden = false, variant = 0, wallVoice = 0;
    function channel(key, src, volume, loop = false) {
        if (!channels.has(key)) {
            try {
                const media = createMedia(src);
                media.preload = 'none';
                media.volume = volume;
                media.loop = loop;
                channels.set(key, media);
            }
            catch {
                channels.set(key, null);
            }
        }
        return channels.get(key);
    }
    function play(media, restart = false) {
        if (!media)
            return;
        try {
            if (restart)
                media.currentTime = 0;
            const result = media.play();
            result?.catch(() => {
            });
        }
        catch { /* Missing files and autoplay denial are nonfatal. */
        }
    }
    function pitch(media, speed) {
        if (!media) return media;
        try { media.playbackRate = getPuckFeedback(speed).pitch; }
        catch { /* Some embedded media adapters expose a read-only rate. */ }
        return media;
    }
    function enabled() {
        return unlocked && !muted && !hidden && !disposed;
    }
    function stopAll(keepButton = false) {
        for (const [key, media] of channels)
            if (!keepButton || key !== 'button') media?.pause();
    }
    function sync() {
        if (!enabled()) {
            stopAll();
            return;
        }
        if (screen === 'paused') {
            stopAll(true);
            return;
        }
        const music = channel('music', playlist.current(), MIX.music);
        if (music) {
            music.onended = () => {
                if (disposed)
                    return;
                music.src = playlist.advance();
                if (enabled() && screen !== 'paused')
                    play(music, true);
            };
            if (music.paused)
                play(music);
        }
        if (screen === 'playing') {
            const crowd = channel('crowd', SFX.crowd, MIX.crowd, true);
            if (crowd?.paused)
                play(crowd);
        }
        else
            channels.get('crowd')?.pause();
    }
    function effect(key, gap = 0, volume = .5) {
        if (!enabled() || (screen === 'paused' && key !== 'button'))
            return;
        const time = now();
        if (time - (lastPlayed.get(key) ?? -Infinity) < gap)
            return;
        lastPlayed.set(key, time);
        play(channel(key, SFX[key], volume), true);
    }
    return {
        unlock() {
            if (disposed)
                return;
            unlocked = true;
            sync();
        },
        setScreen(value) {
            screen = value;
            sync();
        },
        setHidden(value) {
            hidden = value;
            sync();
        },
        setMuted(value) {
            muted = Boolean(value);
            sync();
        },
        handle(event) {
            if (event.type === 'screen') {
                screen = event.screen;
                for (const [key, media] of channels)
                    if (key !== 'button' && key !== 'music' && !(screen === 'result' && key === 'explosion')) media?.pause();
                sync();
            }
            if (event.type === 'button-click')
                effect('button', 40, MIX.button);
            if (event.type === 'round-reset')
                effect('tick', 100, MIX.tick);
            if (event.type === 'serve')
                effect('go', 100, MIX.go);
            if (event.type === 'goal')
                effect('explosion', 100, MIX.explosion);
            if (event.type === 'match-end')
                effect('end', 100, MIX.end);
            // Every impact gets a voice, even a second wall in the same corner tick.
            // Cycling a small pool allows overlaps without unbounded media allocation.
            if (event.type === 'wall-hit' && enabled() && screen !== 'paused') {
                play(pitch(channel(`wall-${wallVoice++ % 4}`, SFX.wall, MIX.wall), event.speed), true);
            }
            if (event.type === 'puck-hit') {
                const time = now();
                if (time - (lastPlayed.get('puck') ?? -Infinity) < 55)
                    return;
                lastPlayed.set('puck', time);
                const key = variant++ % 2 ? 'puckB' : 'puckA';
                play(pitch(channel(key, SFX[key], MIX.puck), event.speed), true);
            }
            if (event.type === 'on-fire')
                effect('fire', 4000, MIX.fire);
        },
        dispose() {
            disposed = true;
            stopAll();
            for (const media of channels.values()) {
                if (!media)
                    continue;
                media.onended = null;
                media.removeAttribute('src');
                media.load();
            }
            channels.clear();
        },
    };
}
