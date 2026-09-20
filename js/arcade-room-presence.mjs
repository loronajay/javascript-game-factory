// Who else is standing in this arcade right now.
//
// The room used to be single-player in every sense: two people on the same
// `/room/?id=` each walked a private copy of the layout. Presence is the seam
// that makes the room shared — one WebSocket to `factory-network-server`, an
// `arcade_room_join` for the arcade being viewed (keyed by its OWNER's player
// id, so the owner and every guest land in the same room), and a stream of
// poses in each direction. The server keeps the roster and relays; it never
// simulates anyone, so a member here is exactly what its client last said.
//
// This module owns the protocol and the roster and nothing visual. It knows no
// THREE and no DOM: the socket is injectable, the clock is injectable, and the
// timers are injectable, so the whole thing runs under node against a fake
// socket. `arcade-room-visitors.mts` turns the roster into bodies.
//
// Reconnection is quiet: a dropped socket is retried on a backoff, and the
// roster is cleared meanwhile (a body that stays standing after its socket is
// gone is a ghost, not a guest). Poses are throttled to `poseIntervalMs` and
// sent only when they change, with a keepalive so a still player is still known
// to be there. The keepalive runs on its own timer rather than the frame loop,
// because a hidden tab stops animating but is still standing in the room.
//
// Every page load mints one `sessionId` that rides on every join. The server
// uses it to recognise a reconnect: the same player and session arriving on a
// new socket replaces the stale member instead of standing beside it, so a
// network blip never leaves a clone behind. Two tabs are two sessions and are
// allowed to coexist.
//
// Chat rides the same socket but is not roster state: a line is handed to
// `onChat` listeners as it arrives and forgotten here. The log, the fade and
// the input belong to `arcade-room-chat.mts`; this only carries the words.
import { resolveFactoryNetworkUrl } from "./platform/api/factory-network-url.mjs";
/** The server's limit; anything longer is cut here so the box can show what will actually go out. */
export const MAX_CHAT_LENGTH = 200;
const POSE_EPSILON = 0.005;
const YAW_EPSILON = 0.01;
function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
export function normalizeChatText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH) : "";
}
export function normalizePresencePose(value, previous = null) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze({
        x: finite(source.x, previous?.x ?? 0),
        z: finite(source.z, previous?.z ?? 0),
        yaw: finite(source.yaw, previous?.yaw ?? 0),
        moving: source.moving === true,
        activity: cleanText(source.activity).slice(0, 40),
    });
}
export function posesDiffer(a, b) {
    if (!a)
        return true;
    return Math.abs(a.x - b.x) > POSE_EPSILON
        || Math.abs(a.z - b.z) > POSE_EPSILON
        || Math.abs(a.yaw - b.yaw) > YAW_EPSILON
        || a.moving !== b.moving
        || a.activity !== b.activity;
}
function normalizeMember(value, now) {
    const source = value && typeof value === "object" ? value : null;
    const clientId = cleanText(source?.clientId);
    if (!clientId)
        return null;
    return Object.freeze({
        clientId,
        playerId: cleanText(source?.playerId),
        displayName: cleanText(source?.displayName) || "Player",
        avatarId: cleanText(source?.avatarId),
        pose: normalizePresencePose(source?.pose),
        poseAt: now,
        emote: "",
        emoteAt: 0,
    });
}
function defaultSocketFactory(url) {
    return new WebSocket(url);
}
function mintSessionId() {
    const cryptoLike = globalThis.crypto;
    if (cryptoLike?.randomUUID)
        return cryptoLike.randomUUID();
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function createRoomPresence(options) {
    const roomId = cleanText(options.roomId);
    const now = options.now ?? (() => Date.now());
    const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    const setRepeating = options.setRepeating ?? ((fn, ms) => setInterval(fn, ms));
    const clearRepeating = options.clearRepeating ?? ((handle) => clearInterval(handle));
    const sessionId = cleanText(options.sessionId) || mintSessionId();
    const socketFactory = options.socketFactory ?? defaultSocketFactory;
    const url = options.url ?? resolveFactoryNetworkUrl();
    const poseIntervalMs = options.poseIntervalMs ?? 100;
    const keepaliveMs = options.keepaliveMs ?? 2000;
    const reconnectDelayMs = options.reconnectDelayMs ?? 1500;
    const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 15000;
    let identity = options.identity;
    let socket = null;
    let status = "idle";
    let selfClientId = "";
    let wanted = false;
    let reconnectHandle = null;
    let reconnectAttempts = 0;
    let keepaliveHandle = null;
    const roster = new Map();
    const listeners = new Set();
    const chatListeners = new Set();
    const chatRefusedListeners = new Set();
    let lastSentPose = null;
    let lastSentAt = -Infinity;
    let pendingPose = null;
    function notify() {
        for (const listener of listeners)
            listener();
    }
    function setStatus(next) {
        if (status === next)
            return;
        status = next;
        notify();
    }
    function send(frame) {
        if (!socket || status !== "online")
            return false;
        try {
            socket.send(JSON.stringify(frame));
            return true;
        }
        catch {
            return false;
        }
    }
    function sendJoin() {
        if (!socket)
            return;
        try {
            socket.send(JSON.stringify({
                type: "arcade_room_join",
                roomId,
                sessionId,
                identity: { playerId: identity.playerId, displayName: identity.displayName, avatarId: identity.avatarId },
                pose: pendingPose ?? lastSentPose ?? normalizePresencePose(null),
            }));
        }
        catch {
            // The close handler owns recovery.
        }
    }
    function clearRoster() {
        if (roster.size === 0)
            return;
        roster.clear();
        notify();
    }
    /** Resend the standing pose when nothing else has gone out lately, frame loop or not. */
    function keepalive() {
        if (status !== "online")
            return;
        const at = now();
        if (at - lastSentAt < keepaliveMs)
            return;
        const pose = pendingPose ?? lastSentPose;
        if (!pose)
            return;
        if (send({ type: "arcade_room_pose", ...pose })) {
            lastSentPose = pose;
            lastSentAt = at;
        }
    }
    function startKeepalive() {
        if (keepaliveHandle !== null)
            return;
        keepaliveHandle = setRepeating(keepalive, keepaliveMs);
    }
    function stopKeepalive() {
        if (keepaliveHandle === null)
            return;
        clearRepeating(keepaliveHandle);
        keepaliveHandle = null;
    }
    function scheduleReconnect() {
        if (!wanted || reconnectHandle !== null)
            return;
        const delay = Math.min(maxReconnectDelayMs, reconnectDelayMs * 2 ** reconnectAttempts);
        reconnectAttempts += 1;
        reconnectHandle = setTimer(() => {
            reconnectHandle = null;
            if (wanted)
                open();
        }, delay);
    }
    function open() {
        if (socket)
            return;
        let next;
        try {
            next = socketFactory(url);
        }
        catch {
            setStatus("offline");
            scheduleReconnect();
            return;
        }
        socket = next;
        setStatus("connecting");
        next.addEventListener("open", () => {
            if (socket !== next)
                return;
            sendJoin();
        });
        next.addEventListener("message", (event) => {
            if (socket !== next)
                return;
            let data = null;
            try {
                data = JSON.parse(String(event?.data ?? ""));
            }
            catch {
                return;
            }
            handleEvent(data);
        });
        const dropped = () => {
            if (socket !== next)
                return;
            socket = null;
            selfClientId = "";
            lastSentPose = null;
            stopKeepalive();
            clearRoster();
            setStatus(wanted ? "offline" : "idle");
            scheduleReconnect();
        };
        next.addEventListener("close", dropped);
        next.addEventListener("error", dropped);
    }
    function handleEvent(data) {
        const event = data && typeof data === "object" ? data : null;
        if (!event)
            return;
        switch (String(event.event || "")) {
            case "arcade_room_joined": {
                if (cleanText(event.roomId) !== roomId)
                    return;
                selfClientId = cleanText(event.clientId);
                roster.clear();
                const at = now();
                for (const entry of Array.isArray(event.members) ? event.members : []) {
                    const member = normalizeMember(entry, at);
                    if (member && member.clientId !== selfClientId)
                        roster.set(member.clientId, member);
                }
                reconnectAttempts = 0;
                // The join carried the latest pose; nothing to resend until it moves.
                lastSentPose = pendingPose ?? lastSentPose;
                lastSentAt = at;
                status = "online";
                startKeepalive();
                notify();
                return;
            }
            case "arcade_room_member_joined": {
                if (cleanText(event.roomId) !== roomId)
                    return;
                const member = normalizeMember(event.member, now());
                if (!member || member.clientId === selfClientId)
                    return;
                roster.set(member.clientId, member);
                notify();
                return;
            }
            case "arcade_room_member_left": {
                if (roster.delete(cleanText(event.clientId)))
                    notify();
                return;
            }
            case "arcade_room_pose": {
                const member = roster.get(cleanText(event.clientId));
                if (!member)
                    return;
                const pose = normalizePresencePose(event, member.pose);
                roster.set(member.clientId, Object.freeze({ ...member, pose, poseAt: now() }));
                // Movement is read off the roster every frame; only what they are DOING is worth an event.
                if (pose.activity !== member.pose.activity)
                    notify();
                return;
            }
            case "arcade_room_emote": {
                const member = roster.get(cleanText(event.clientId));
                if (!member)
                    return;
                roster.set(member.clientId, Object.freeze({ ...member, emote: cleanText(event.emote), emoteAt: now() }));
                notify();
                return;
            }
            case "arcade_room_chat": {
                if (cleanText(event.roomId) !== roomId)
                    return;
                const member = roster.get(cleanText(event.clientId));
                const text = normalizeChatText(event.text);
                if (!member || !text)
                    return;
                const line = Object.freeze({
                    clientId: member.clientId,
                    playerId: member.playerId,
                    displayName: cleanText(event.displayName) || member.displayName,
                    text,
                    at: now(),
                });
                for (const listener of chatListeners)
                    listener(line);
                return;
            }
            case "error": {
                const code = String(event.code);
                if (code === "TOO_FAST") {
                    for (const listener of chatRefusedListeners)
                        listener(code);
                }
                else if (code === "ROOM_FULL") {
                    wanted = false;
                    setStatus("full");
                    socket?.close();
                }
                else if (code === "NOT_IN_ROOM" && status === "online") {
                    // The server forgot us (a stale sweep while the tab slept); walk back in.
                    sendJoin();
                }
                return;
            }
            default:
                return;
        }
    }
    function connect() {
        if (!roomId)
            return;
        wanted = true;
        open();
    }
    function disconnect() {
        wanted = false;
        if (reconnectHandle !== null) {
            clearTimer(reconnectHandle);
            reconnectHandle = null;
        }
        const current = socket;
        socket = null;
        selfClientId = "";
        stopKeepalive();
        if (current) {
            try {
                current.send(JSON.stringify({ type: "arcade_room_leave" }));
            }
            catch {
                // Closing anyway.
            }
            try {
                current.close();
            }
            catch {
                // Already gone.
            }
        }
        clearRoster();
        setStatus("idle");
    }
    function publishPose(pose) {
        const normalized = normalizePresencePose(pose);
        pendingPose = normalized;
        if (status !== "online")
            return;
        const at = now();
        const changed = posesDiffer(lastSentPose, normalized);
        if (changed ? at - lastSentAt < poseIntervalMs : at - lastSentAt < keepaliveMs)
            return;
        if (send({ type: "arcade_room_pose", ...normalized })) {
            lastSentPose = normalized;
            lastSentAt = at;
        }
    }
    function emote(name) {
        send({ type: "arcade_room_emote", emote: name });
    }
    function sendChat(text) {
        const clean = normalizeChatText(text);
        if (!clean)
            return false;
        return send({ type: "arcade_room_chat", text: clean });
    }
    function setIdentity(next) {
        identity = next;
        if (status === "online")
            sendJoin();
    }
    return Object.freeze({
        connect,
        disconnect,
        publishPose,
        emote,
        sendChat,
        onChat: (listener) => {
            chatListeners.add(listener);
            return () => { chatListeners.delete(listener); };
        },
        onChatRefused: (listener) => {
            chatRefusedListeners.add(listener);
            return () => { chatRefusedListeners.delete(listener); };
        },
        setIdentity,
        members: () => [...roster.values()],
        status: () => status,
        clientId: () => selfClientId,
        sessionId: () => sessionId,
        onChange: (listener) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        handleEvent,
    });
}
