// The jukebox as the ROOM hears it.
//
// The page in the overlay only picks a record; this is what plays it, so the song
// carries on after the overlay closes and the player walks off. It owns one
// `<audio>` element, the record it is on, and WHICH placed jukebox is playing —
// the one the player opened — so the volume falls off with the distance to that
// box and the song stops if the box is deleted in the editor.
//
// The overlay page talks to it with `postMessage` (shapes in the pure catalog),
// and it answers every command with the full state so the page never keeps its
// own idea of what is playing. `suspend()`/`resume()` are for a cabinet game,
// which has its own soundtrack; the jukebox waits rather than competing.
//
// SPEAKERS RELAY, THEY DO NOT PLAY. Every placed speaker carries whatever is on,
// and the volume where the player stands is the LOUDEST emitter, never the sum
// (`jukeboxGainAt`), so two speakers side by side sound like one.
//
// THE HOUSE RECORD has no box. It is the layout's `music.defaultTrackId`, played
// on entry for owner and guest alike through every jukebox and speaker on the
// floor — and, in a room with neither, everywhere, so a host who set one is
// never met by silence. Picking a record at a box takes over from it; deleting
// a box never stops it, because it was not that box's record to begin with.
import { JUKEBOX_MESSAGE, JUKEBOX_ITEM_ID, JUKEBOX_RANGE, adjacentJukeboxTrack, findJukeboxTrack, isJukeboxCommand, isJukeboxEmitter, jukeboxGainAt, jukeboxTrackUrl, } from "./arcade-room-catalog/jukebox.mjs";
export { JUKEBOX_ITEM_ID };
export function createRoomJukebox(options) {
    const audio = options.createAudio ? options.createAudio() : new Audio();
    audio.loop = true;
    audio.preload = "none";
    const canSetDefault = options.canSetDefault === true;
    let track = null;
    let playing = false;
    let suspended = false;
    let sourceInstanceId = null;
    let defaultTrackId = "";
    // Full until a tick says otherwise, so the page can also run this standalone with no room to measure.
    let gain = JUKEBOX_RANGE.max;
    function status() {
        return Object.freeze({ track, playing, sourceInstanceId, defaultTrackId: defaultTrackId || null, canSetDefault });
    }
    function announce() {
        options.onChange?.(status());
        const state = {
            type: JUKEBOX_MESSAGE.state,
            trackId: track?.id ?? null,
            playing,
            defaultTrackId: defaultTrackId || null,
            canSetDefault,
        };
        try {
            options.frame.contentWindow?.postMessage(state, location.origin);
        }
        catch {
            // The frame is on about:blank or gone; nothing to tell.
        }
    }
    function applyVolume() {
        audio.volume = Math.max(0, Math.min(1, gain));
    }
    function play(trackId) {
        const next = findJukeboxTrack(trackId);
        if (!next)
            return;
        if (track?.id !== next.id) {
            track = next;
            audio.src = jukeboxTrackUrl(next, options.siteRoot);
        }
        playing = true;
        suspended = false;
        applyVolume();
        // Autoplay policy: this always follows a key press or a click, so the promise resolves;
        // when it does not (a headless run, a muted tab) the state still says playing and the
        // next gesture retries.
        audio.play().catch(() => undefined);
        announce();
    }
    function stop() {
        playing = false;
        suspended = false;
        audio.pause();
        announce();
    }
    function step(direction) {
        play(adjacentJukeboxTrack(track?.id ?? "", direction).id);
    }
    function toggle() {
        if (playing)
            stop();
        else if (track)
            play(track.id);
        else
            step(1);
    }
    function attach(instanceId) {
        sourceInstanceId = instanceId;
    }
    function setDefaultTrack(trackId) {
        const next = findJukeboxTrack(trackId) ? trackId : "";
        if (next === defaultTrackId)
            return;
        defaultTrackId = next;
        announce();
    }
    function playDefault() {
        if (!defaultTrackId)
            return;
        sourceInstanceId = null;
        play(defaultTrackId);
    }
    function chooseDefault(trackId) {
        if (!canSetDefault)
            return;
        if (trackId !== "" && !findJukeboxTrack(trackId))
            return;
        options.onSetDefault?.(trackId);
        setDefaultTrack(trackId);
    }
    /**
     * What the record is coming out of. A picked record: the box it was picked on
     * plus every speaker, and nothing at all once that box is gone. The house
     * record: every jukebox and speaker, or `null` for "everywhere" when the room
     * has none of either.
     */
    function emitters(decor) {
        if (sourceInstanceId) {
            const source = decor.find((item) => item.instanceId === sourceInstanceId && item.itemId === JUKEBOX_ITEM_ID);
            if (!source)
                return [];
            return [source, ...decor.filter((item) => isJukeboxEmitter(item.itemId) && item.itemId !== JUKEBOX_ITEM_ID)];
        }
        const all = decor.filter((item) => isJukeboxEmitter(item.itemId));
        return all.length ? all : null;
    }
    function update(player, decor) {
        if (!track)
            return;
        const points = emitters(decor);
        if (points && points.length === 0) {
            // The box the record was playing on is gone: no source, no sound.
            sourceInstanceId = null;
            if (playing)
                stop();
            return;
        }
        const nextGain = points ? jukeboxGainAt(player, points) : JUKEBOX_RANGE.max;
        if (nextGain === gain)
            return;
        gain = nextGain;
        applyVolume();
    }
    function emitterInstanceIds(decor) {
        if (!playing || suspended)
            return [];
        return (emitters(decor) ?? []).filter((item) => item.itemId === JUKEBOX_ITEM_ID).map((item) => item.instanceId);
    }
    function suspend() {
        if (!playing)
            return;
        suspended = true;
        audio.pause();
    }
    function resume() {
        if (!suspended)
            return;
        suspended = false;
        if (playing)
            audio.play().catch(() => undefined);
    }
    function onMessage(event) {
        if (event.origin !== location.origin)
            return;
        if (event.source !== options.frame.contentWindow)
            return;
        const data = event.data;
        if (data && typeof data === "object" && data.type === JUKEBOX_MESSAGE.hello) {
            announce();
            return;
        }
        if (!isJukeboxCommand(data))
            return;
        const command = data;
        if (command.action === "play")
            play(command.trackId);
        else if (command.action === "set-default")
            chooseDefault(command.trackId);
        else if (command.action === "clear-default")
            chooseDefault("");
        else if (command.action === "stop")
            stop();
        else if (command.action === "next")
            step(1);
        else if (command.action === "previous")
            step(-1);
        else
            toggle();
    }
    window.addEventListener("message", onMessage);
    return Object.freeze({
        attach,
        play,
        stop,
        next: () => step(1),
        previous: () => step(-1),
        toggle,
        setDefaultTrack,
        playDefault,
        setDefault: chooseDefault,
        clearDefault: () => chooseDefault(""),
        update,
        emitterInstanceIds,
        suspend,
        resume,
        status,
        pulse: (now) => (playing && !suspended ? 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 1.6) : 0),
        dispose: () => {
            window.removeEventListener("message", onMessage);
            audio.pause();
            audio.removeAttribute("src");
        },
    });
}
