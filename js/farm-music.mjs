// The farm owns this soundtrack. It starts only after the Enter gesture, streams
// through one audio element, and keeps one shuffled order for the whole visit.
export const FARM_MUSIC_TRACKS = Object.freeze([
    Object.freeze({
        id: "farm-life",
        title: "Farm Life",
        file: "farm/assets/sounds/soundtrack/farm-life.mp3",
        src: "./assets/sounds/soundtrack/farm-life.mp3",
    }),
    Object.freeze({
        id: "blue-skies",
        title: "Blue Skies",
        file: "farm/assets/sounds/soundtrack/blue-skies.mp3",
        src: "./assets/sounds/soundtrack/blue-skies.mp3",
    }),
]);
const FARM_MUSIC_VOLUME = 0.24;
function shuffled(rows, random) {
    const result = [...rows];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}
export function createFarmMusic(options = {}) {
    const tracks = shuffled(options.tracks ?? FARM_MUSIC_TRACKS, options.random ?? Math.random);
    const createAudio = options.createAudio ?? (() => typeof globalThis.Audio === "function" ? new globalThis.Audio() : null);
    const volume = options.volume ?? FARM_MUSIC_VOLUME;
    let audio = null;
    let trackIndex = 0;
    let started = false;
    let muted = Boolean(options.muted);
    let destroyed = false;
    function ignorePlayRejection(result) {
        if (result && typeof result.catch === "function") {
            result.catch(() => undefined);
        }
    }
    function currentTrack() {
        return audio && tracks.length ? tracks[trackIndex] ?? null : null;
    }
    function playCurrent() {
        if (!audio || muted || destroyed || tracks.length === 0)
            return;
        audio.src = tracks[trackIndex].src;
        ignorePlayRejection(audio.play());
    }
    function advance() {
        if (tracks.length === 0)
            return;
        trackIndex = (trackIndex + 1) % tracks.length;
        playCurrent();
    }
    function ensureAudio() {
        if (audio || destroyed)
            return audio;
        audio = createAudio();
        if (!audio)
            return null;
        audio.volume = volume;
        audio.preload = "metadata";
        audio.addEventListener("ended", advance);
        audio.addEventListener("error", () => {
            // Changing a source can dispatch an empty error; only skip a file the
            // browser actually identified as failed.
            if (audio?.error)
                advance();
        });
        return audio;
    }
    return Object.freeze({
        start() {
            if (destroyed)
                return;
            started = true;
            if (muted || !ensureAudio())
                return;
            // A later gesture is a useful retry when the browser declined an earlier play.
            if (audio && !audio.src)
                playCurrent();
            else
                ignorePlayRejection(audio?.play());
        },
        setMuted(next) {
            muted = Boolean(next);
            if (muted)
                audio?.pause();
            else if (started && ensureAudio()) {
                if (!audio?.src)
                    playCurrent();
                else
                    ignorePlayRejection(audio.play());
            }
            return muted;
        },
        isMuted: () => muted,
        currentTrack,
        destroy() {
            destroyed = true;
            audio?.pause();
            audio = null;
        },
    });
}
