// The other players in the arcade, as bodies.
//
// `arcade-room-presence.mts` owns who is here; this owns what they look like.
// Every roster member gets one group in the scene: the avatar GLB they chose
// (the same twelve the build-mode picker offers), scaled to a standing height,
// a name tag floating over its head, and a mixer playing idle / walk / run off
// the clips the pack ships with. Poses arrive ten times a second and a body
// drawn straight onto each one would stutter, so a body eases toward a target
// that `arcade-room-visitor-motion.mts` runs forward from the latest pose, and
// the gait follows the sender's measured speed. An emote plays its clip once
// and returns to idle.
//
// Movement is not an event. The roster is handed in on every `update` and each
// body reads its member's latest pose from it there; `sync` only reconciles who
// has a body at all. (The first version read poses off a member reference taken
// at sync time, so bodies stood still until somebody joined, left or waved and
// then teleported — the "super jumpy" room.)
//
// The GLBs are skinned and cloning a skinned mesh needs SkeletonUtils, which the
// vendored three does not ship; a body simply loads its own copy (the browser's
// HTTP cache makes the second load of the same file free). Until the model
// lands a body is a soft capsule, so a guest who just arrived is never invisible.
//
// The local player is never here: presence filters it out of the roster, and
// nothing in this module knows which member is "me".
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { findArcadeAvatar, DEFAULT_ARCADE_AVATAR_ID } from "./arcade-room-avatar-catalog.mjs";
import { findVisitorInReach } from "./arcade-room-interaction.mjs";
import { createRemoteMotion } from "./arcade-room-visitor-motion.mjs";
/** How tall a body stands, whatever the GLB's native units. */
export const VISITOR_HEIGHT = 1.78;
/** How long an emote clip is allowed to run before the body returns to idle. */
export const EMOTE_SECONDS = 2.2;
/** The target is caught up at this rate per second: quick enough to track a sprint, smooth enough not to snap. */
const POSITION_EASE = 11;
const YAW_EASE = 12;
function tagLabel(member) {
    return member.pose.activity ? `${member.displayName}\n▶ ${member.pose.activity}` : member.displayName;
}
export function createRoomVisitors(THREE, scene) {
    const root = new THREE.Group();
    root.name = "visitors";
    scene.add(root);
    const loader = new GLTFLoader();
    const bodies = new Map();
    const placeholderGeometry = new THREE.CapsuleGeometry(0.28, VISITOR_HEIGHT - 0.56, 6, 12);
    const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0x3b7dd8, emissive: 0x11284a, roughness: 0.6, transparent: true, opacity: 0.55 });
    function paintTag(body) {
        const label = tagLabel(body.member);
        if (label === body.tagText)
            return;
        body.tagText = label;
        const lines = label.split("\n");
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = lines.length > 1 ? 176 : 112;
        const context = canvas.getContext("2d");
        if (!context)
            return;
        context.fillStyle = "rgba(7, 16, 27, 0.82)";
        const radius = 22;
        context.beginPath();
        context.roundRect(6, 6, canvas.width - 12, canvas.height - 12, radius);
        context.fill();
        context.strokeStyle = "rgba(103, 220, 255, 0.7)";
        context.lineWidth = 4;
        context.stroke();
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#ffffff";
        context.font = "700 54px system-ui, sans-serif";
        context.fillText(lines[0], canvas.width / 2, lines.length > 1 ? 56 : canvas.height / 2, canvas.width - 60);
        if (lines.length > 1) {
            context.fillStyle = "#ffd33d";
            context.font = "600 40px system-ui, sans-serif";
            context.fillText(lines[1], canvas.width / 2, 122, canvas.width - 60);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const previous = body.tag.material.map;
        body.tag.material.map = texture;
        body.tag.material.needsUpdate = true;
        body.tag.scale.set(1.1, 1.1 * (canvas.height / canvas.width), 1);
        previous?.dispose?.();
    }
    function fitModel(model) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = size.y > 0 ? VISITOR_HEIGHT / size.y : 1;
        model.scale.setScalar(scale);
        const fitted = new THREE.Box3().setFromObject(model);
        const centre = fitted.getCenter(new THREE.Vector3());
        model.position.set(-centre.x, -fitted.min.y, -centre.z);
    }
    function play(body, clip, loopOnce = false) {
        if (!body.mixer || !clip || body.current === clip)
            return;
        const action = body.mixer.clipAction(clip);
        action.reset();
        action.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = loopOnce;
        action.fadeIn(0.18).play();
        if (body.current)
            body.mixer.clipAction(body.current).fadeOut(0.18);
        body.current = clip;
    }
    function loadModel(body) {
        const definition = findArcadeAvatar(body.avatarId) ?? findArcadeAvatar(DEFAULT_ARCADE_AVATAR_ID);
        if (!definition)
            return;
        const token = ++body.loadToken;
        loader.load(definition.assetUrl, (gltf) => {
            if (token !== body.loadToken || !bodies.has(body.member.clientId))
                return;
            if (body.model) {
                body.group.remove(body.model);
                body.mixer?.stopAllAction?.();
            }
            body.model = gltf.scene;
            fitModel(body.model);
            body.model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.frustumCulled = false;
                }
            });
            body.group.add(body.model);
            body.placeholder.visible = false;
            const clips = gltf.animations ?? [];
            const find = (pattern) => clips.find((clip) => pattern.test(clip.name)) ?? null;
            body.clips = {
                idle: find(/^idle_a$/i) ?? find(/idle/i) ?? clips[0] ?? null,
                walk: find(/^walk_a$/i) ?? find(/walk/i),
                run: find(/^run_a$/i) ?? find(/run/i),
                emote: find(/^cheer_idle_a$/i) ?? find(/cheer/i),
            };
            body.mixer = clips.length ? new THREE.AnimationMixer(body.model) : null;
            body.current = null;
            play(body, body.clips.idle);
        }, undefined, () => {
            // The capsule stays; a guest whose model will not load is still a guest.
        });
    }
    function createBody(member) {
        const group = new THREE.Group();
        group.position.set(member.pose.x, 0, member.pose.z);
        group.rotation.y = member.pose.yaw + Math.PI;
        const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
        placeholder.position.y = VISITOR_HEIGHT / 2;
        group.add(placeholder);
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
        tag.position.y = VISITOR_HEIGHT + 0.32;
        tag.renderOrder = 10;
        group.add(tag);
        root.add(group);
        const body = {
            member,
            group,
            model: null,
            placeholder,
            tag,
            tagText: "",
            mixer: null,
            clips: { idle: null, walk: null, run: null, emote: null },
            current: null,
            emoteUntil: 0,
            emoteSeenAt: member.emoteAt,
            loadToken: 0,
            avatarId: member.avatarId,
            motion: createRemoteMotion(),
        };
        body.motion.observe(member.pose, member.poseAt);
        paintTag(body);
        loadModel(body);
        return body;
    }
    function removeBody(body) {
        body.loadToken += 1;
        root.remove(body.group);
        body.tag.material.map?.dispose?.();
        body.tag.material.dispose?.();
    }
    function sync(members) {
        const seen = new Set();
        for (const member of members) {
            seen.add(member.clientId);
            const body = bodies.get(member.clientId);
            if (!body) {
                bodies.set(member.clientId, createBody(member));
                continue;
            }
            body.member = member;
            if (member.avatarId !== body.avatarId) {
                // The old body keeps standing until the new one is in; only a body that never had one shows the capsule.
                body.avatarId = member.avatarId;
                body.placeholder.visible = !body.model;
                loadModel(body);
            }
            paintTag(body);
        }
        for (const [clientId, body] of bodies) {
            if (seen.has(clientId))
                continue;
            removeBody(body);
            bodies.delete(clientId);
        }
    }
    function update(dt, now, members) {
        sync(members);
        const ease = 1 - Math.exp(-POSITION_EASE * dt);
        const yawEase = 1 - Math.exp(-YAW_EASE * dt);
        for (const body of bodies.values()) {
            const { pose } = body.member;
            const group = body.group;
            body.motion.observe(pose, body.member.poseAt);
            if (body.motion.shouldSnap(group.position)) {
                // Too far to have walked: a rejoin or a respawn. Appear there rather than glide through the cabinets.
                group.position.x = pose.x;
                group.position.z = pose.z;
                group.rotation.y = pose.yaw + Math.PI;
            }
            const target = body.motion.target(now);
            group.position.x += (target.x - group.position.x) * ease;
            group.position.z += (target.z - group.position.z) * ease;
            const targetYaw = pose.yaw + Math.PI;
            let delta = targetYaw - group.rotation.y;
            delta = Math.atan2(Math.sin(delta), Math.cos(delta));
            group.rotation.y += delta * yawEase;
            if (body.member.emote && body.member.emoteAt > body.emoteSeenAt) {
                body.emoteSeenAt = body.member.emoteAt;
                body.emoteUntil = now + EMOTE_SECONDS * 1000;
                if (body.clips.emote)
                    play(body, body.clips.emote, true);
            }
            if (body.mixer) {
                const gait = body.motion.gait();
                if (body.emoteUntil > now && body.clips.emote) {
                    // Let the emote finish.
                }
                else if (gait === "run") {
                    play(body, body.clips.run ?? body.clips.walk ?? body.clips.idle);
                }
                else if (gait === "walk") {
                    play(body, body.clips.walk ?? body.clips.idle);
                }
                else {
                    play(body, body.clips.idle);
                }
                body.mixer.update(dt);
            }
        }
    }
    return Object.freeze({
        sync,
        update,
        nearest: (viewer) => findVisitorInReach(viewer, [...bodies.values()].map((body) => body.member)),
        setVisible: (visible) => { root.visible = visible; },
        count: () => bodies.size,
        dispose: () => {
            for (const body of bodies.values())
                removeBody(body);
            bodies.clear();
            scene.remove(root);
        },
    });
}
