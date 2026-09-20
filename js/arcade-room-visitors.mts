// The other players in the arcade, as bodies.
//
// `arcade-room-presence.mts` owns who is here; this owns what they look like.
// Every roster member gets one group in the scene: the avatar GLB they chose
// (the same twelve the build-mode picker offers), scaled to a standing height,
// a name tag floating over its head, and a mixer playing idle / walk / run off
// the clips the pack ships with. Poses arrive ten times a second and a body
// drawn straight onto each one would stutter, so a body eases toward a target
// that `arcade-room-visitor-motion.mts` runs forward from the latest pose, and
// the gait follows the sender's measured speed. A gesture emote (the wave)
// plays its clip once and returns to idle; a picture emote (the four cards
// from `arcade-room-emotes.mts`) floats over the head for a few seconds
// instead. A chat line is a speech bubble over the name tag for a few seconds
// (`say`); the log at the bottom of the screen is the record, the bubble is
// who is talking.
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
import { createRemoteMotion, type RemoteMotion } from "./arcade-room-visitor-motion.mjs";
import { wrapChatBubble } from "./arcade-room-chat.mjs";
import { EMOTE_DISPLAY_MS, emoteById } from "./arcade-room-emotes.mjs";
import type { RemoteMember } from "./arcade-room-presence.mjs";

type ThreeNamespace = Record<string, any>;

/** How tall a body stands, whatever the GLB's native units. */
export const VISITOR_HEIGHT = 1.78;
/** How long an emote clip is allowed to run before the body returns to idle. */
export const EMOTE_SECONDS = 2.2;
/** A speech bubble stays up this long, the last part of it fading. */
export const BUBBLE_SECONDS = 6;
/** A picture emote hangs over the head this long, the last part of it fading. */
export const EMOTE_CARD_SECONDS = EMOTE_DISPLAY_MS / 1000;
const EMOTE_CARD_FADE_SECONDS = 0.6;
/** World size of the picture over a head. */
const EMOTE_CARD_SIZE = 0.62;
const BUBBLE_FADE_SECONDS = 0.8;
const BUBBLE_MAX_LINES = 3;
/** The target is caught up at this rate per second: quick enough to track a sprint, smooth enough not to snap. */
const POSITION_EASE = 11;
const YAW_EASE = 12;

type VisitorBody = {
  member: RemoteMember;
  group: any;
  model: any | null;
  placeholder: any;
  tag: any;
  tagText: string;
  bubble: any;
  bubbleUntil: number;
  /** The picture emote over the head; `card.userData.emoteId` names the picture it wears. */
  card: any;
  cardUntil: number;
  mixer: any | null;
  clips: { idle: any | null; walk: any | null; run: any | null; emote: any | null };
  current: any | null;
  emoteUntil: number;
  emoteSeenAt: number;
  loadToken: number;
  avatarId: string;
  motion: RemoteMotion;
};

export type RoomVisitors = Readonly<{
  /** Reconcile bodies with the roster: new members get bodies, departed ones lose them. */
  sync: (members: readonly RemoteMember[]) => void;
  /** Every frame: take the roster's latest poses, ease every body toward them and advance its animation. */
  update: (dt: number, now: number, members: readonly RemoteMember[]) => void;
  /** Put a speech bubble over a member's head for a few seconds; `now` is the frame clock. */
  say: (clientId: string, text: string, now: number) => void;
  /** The member the local player could wave at: in reach and roughly in front. */
  nearest: (viewer: Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }>) => RemoteMember | null;
  setVisible: (visible: boolean) => void;
  count: () => number;
  dispose: () => void;
}>;

function tagLabel(member: RemoteMember): string {
  return member.pose.activity ? `${member.displayName}\n▶ ${member.pose.activity}` : member.displayName;
}

export function createRoomVisitors(THREE: ThreeNamespace, scene: any): RoomVisitors {
  const root = new THREE.Group();
  root.name = "visitors";
  scene.add(root);
  const loader = new GLTFLoader();
  const bodies = new Map<string, VisitorBody>();
  const textureLoader = new THREE.TextureLoader();
  const cardTextures = new Map<string, any>();
  const placeholderGeometry = new THREE.CapsuleGeometry(0.28, VISITOR_HEIGHT - 0.56, 6, 12);
  const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0x3b7dd8, emissive: 0x11284a, roughness: 0.6, transparent: true, opacity: 0.55 });

  function paintTag(body: VisitorBody): void {
    const label = tagLabel(body.member);
    if (label === body.tagText) return;
    body.tagText = label;
    const lines = label.split("\n");
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = lines.length > 1 ? 176 : 112;
    const context = canvas.getContext("2d");
    if (!context) return;
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

  function paintBubble(body: VisitorBody, text: string): void {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    const font = "600 40px system-ui, sans-serif";
    context.font = font;
    const padding = 28;
    const lineHeight = 50;
    const maxTextWidth = 560;
    const lines = wrapChatBubble(text, (part) => context.measureText(part).width, maxTextWidth, BUBBLE_MAX_LINES);
    if (!lines.length) return;
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
    // Power-of-two-free sizes are fine for a sprite; keep the canvas snug so the texture stays sharp.
    canvas.width = Math.ceil(textWidth + padding * 2) + 12;
    canvas.height = lines.length * lineHeight + padding * 2 - 8 + 26;
    const bodyHeight = canvas.height - 26;
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.beginPath();
    context.roundRect(6, 6, canvas.width - 12, bodyHeight - 12, 26);
    context.fill();
    // The tail points down at the speaker.
    context.beginPath();
    context.moveTo(canvas.width / 2 - 18, bodyHeight - 8);
    context.lineTo(canvas.width / 2, canvas.height - 4);
    context.lineTo(canvas.width / 2 + 18, bodyHeight - 8);
    context.closePath();
    context.fill();
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#0b1a2a";
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, padding + lineHeight / 2 - 4 + index * lineHeight);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const previous = body.bubble.material.map;
    body.bubble.material.map = texture;
    body.bubble.material.opacity = 1;
    body.bubble.material.needsUpdate = true;
    // 1.1 world units is the tag's width at 512 px; keep the same pixel density.
    const width = (canvas.width / 512) * 1.1;
    body.bubble.scale.set(width, width * (canvas.height / canvas.width), 1);
    // Sit on the tag: the sprite is centred, so lift it by half its own height.
    body.bubble.position.y = VISITOR_HEIGHT + 0.32 + body.tag.scale.y / 2 + body.bubble.scale.y / 2 + 0.04;
    body.bubble.visible = true;
    previous?.dispose?.();
  }

  function fitModel(model: any): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? VISITOR_HEIGHT / size.y : 1;
    model.scale.setScalar(scale);
    const fitted = new THREE.Box3().setFromObject(model);
    const centre = fitted.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -fitted.min.y, -centre.z);
  }

  function play(body: VisitorBody, clip: any, loopOnce = false): void {
    if (!body.mixer || !clip || body.current === clip) return;
    const action = body.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = loopOnce;
    action.fadeIn(0.18).play();
    if (body.current) body.mixer.clipAction(body.current).fadeOut(0.18);
    body.current = clip;
  }

  function loadModel(body: VisitorBody): void {
    const definition = findArcadeAvatar(body.avatarId) ?? findArcadeAvatar(DEFAULT_ARCADE_AVATAR_ID);
    if (!definition) return;
    const token = ++body.loadToken;
    loader.load(definition.assetUrl, (gltf: any) => {
      if (token !== body.loadToken || !bodies.has(body.member.clientId)) return;
      if (body.model) {
        body.group.remove(body.model);
        body.mixer?.stopAllAction?.();
      }
      body.model = gltf.scene;
      fitModel(body.model);
      body.model.traverse((node: any) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.frustumCulled = false;
        }
      });
      body.group.add(body.model);
      body.placeholder.visible = false;
      const clips: any[] = gltf.animations ?? [];
      const find = (pattern: RegExp) => clips.find((clip) => pattern.test(clip.name)) ?? null;
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

  function createBody(member: RemoteMember): VisitorBody {
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
    // Unlit and untone-mapped: the bubble is paper, not a surface in the room.
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }));
    bubble.renderOrder = 11;
    bubble.visible = false;
    group.add(bubble);
    const card = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }));
    card.renderOrder = 12;
    card.visible = false;
    card.scale.set(EMOTE_CARD_SIZE, EMOTE_CARD_SIZE, 1);
    group.add(card);
    root.add(group);
    const body: VisitorBody = {
      member,
      group,
      model: null,
      placeholder,
      tag,
      tagText: "",
      bubble,
      bubbleUntil: 0,
      card,
      cardUntil: 0,
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

  function removeBody(body: VisitorBody): void {
    body.loadToken += 1;
    root.remove(body.group);
    body.tag.material.map?.dispose?.();
    body.tag.material.dispose?.();
    body.bubble.material.map?.dispose?.();
    body.bubble.material.dispose?.();
    // The card's texture is shared from the cache; only its material is this body's.
    body.card.material.dispose?.();
  }

  /** Show a picture emote over a body's head; the texture is loaded once per id and shared. */
  function showCard(body: VisitorBody, emoteId: string, now: number): void {
    const emote = emoteById(emoteId);
    if (!emote) return;
    let texture = cardTextures.get(emote.id);
    if (!texture) {
      texture = textureLoader.load(emote.image);
      texture.colorSpace = THREE.SRGBColorSpace;
      // Pixel art stays pixel art.
      texture.magFilter = THREE.NearestFilter;
      cardTextures.set(emote.id, texture);
    }
    body.card.material.map = texture;
    body.card.material.opacity = 1;
    body.card.material.needsUpdate = true;
    body.card.userData.emoteId = emote.id;
    body.card.visible = true;
    body.cardUntil = now + EMOTE_CARD_SECONDS * 1000;
    placeCard(body, 0);
  }

  /** The card rides above whatever is over the head — the tag, or the bubble when one is up — and lifts as it fades. */
  function placeCard(body: VisitorBody, lift: number): void {
    const top = body.bubble.visible
      ? body.bubble.position.y + body.bubble.scale.y / 2
      : body.tag.position.y + body.tag.scale.y / 2;
    body.card.position.y = top + EMOTE_CARD_SIZE / 2 + 0.06 + lift;
  }

  function say(clientId: string, text: string, now: number): void {
    const body = bodies.get(clientId);
    if (!body) return;
    paintBubble(body, text);
    body.bubbleUntil = now + BUBBLE_SECONDS * 1000;
  }

  function sync(members: readonly RemoteMember[]): void {
    const seen = new Set<string>();
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
      if (seen.has(clientId)) continue;
      removeBody(body);
      bodies.delete(clientId);
    }
  }

  function update(dt: number, now: number, members: readonly RemoteMember[]): void {
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

      if (body.bubble.visible) {
        const left = (body.bubbleUntil - now) / 1000;
        if (left <= 0) body.bubble.visible = false;
        else body.bubble.material.opacity = Math.min(1, left / BUBBLE_FADE_SECONDS);
      }
      if (body.card.visible) {
        const left = (body.cardUntil - now) / 1000;
        if (left <= 0) body.card.visible = false;
        else {
          body.card.material.opacity = Math.min(1, left / EMOTE_CARD_FADE_SECONDS);
          // A bubble arriving or fading under it moves the card with it; a little lift as it goes.
          placeCard(body, (1 - Math.min(1, left / EMOTE_CARD_SECONDS)) * 0.18);
        }
      }
      if (body.member.emote && body.member.emoteAt > body.emoteSeenAt) {
        body.emoteSeenAt = body.member.emoteAt;
        if (emoteById(body.member.emote)) {
          showCard(body, body.member.emote, now);
        } else {
          body.emoteUntil = now + EMOTE_SECONDS * 1000;
          if (body.clips.emote) play(body, body.clips.emote, true);
        }
      }
      if (body.mixer) {
        const gait = body.motion.gait();
        if (body.emoteUntil > now && body.clips.emote) {
          // Let the emote finish.
        } else if (gait === "run") {
          play(body, body.clips.run ?? body.clips.walk ?? body.clips.idle);
        } else if (gait === "walk") {
          play(body, body.clips.walk ?? body.clips.idle);
        } else {
          play(body, body.clips.idle);
        }
        body.mixer.update(dt);
      }
    }
  }

  return Object.freeze({
    sync,
    update,
    say,
    nearest: (viewer) => findVisitorInReach(viewer, [...bodies.values()].map((body) => body.member)),
    setVisible: (visible: boolean) => { root.visible = visible; },
    count: () => bodies.size,
    dispose: () => {
      for (const body of bodies.values()) removeBody(body);
      bodies.clear();
      for (const texture of cardTextures.values()) texture.dispose?.();
      cardTextures.clear();
      scene.remove(root);
    },
  });
}
