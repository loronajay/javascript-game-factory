export const CROUCH_HURTBUBBLE_Y_SCALE = 0.70;
export const CROUCH_HURTBUBBLE_RADIUS_SCALE = 0.74;

export function getHurtbubbles(fighter) {
  const hurtbubbles = fighter.archetype.hurtbubbles ?? [
    { id: 'body', offsetX: 0, offsetY: -fighter.archetype.height / 2, radius: fighter.archetype.width / 2 },
  ];

  return hurtbubbles.map(bubble => {
    const posed = poseHurtbubble(fighter, bubble);
    return {
      ...posed,
      ownerId: fighter.id,
      x: fighter.position.x + fighter.facing * posed.offsetX,
      y: fighter.position.y + posed.offsetY,
    };
  });
}

export function getActiveHitbubbles(fighter) {
  if (!fighter.attack) return [];

  const { definition, frame } = fighter.attack;
  const activeStart = definition.startup;
  const activeEnd = definition.startup + definition.active;
  if (frame < activeStart || frame >= activeEnd) return [];

  return definition.hitbubbles.map(hitbubble => {
    return {
      ...hitbubble,
      ownerId: fighter.id,
      attackId: definition.id,
      x: fighter.position.x + fighter.facing * hitbubble.offsetX,
      y: fighter.position.y + hitbubble.offsetY,
    };
  });
}

export function bubblesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = a.radius + b.radius;
  return dx * dx + dy * dy <= radius * radius;
}

export function resolveCombat(fighters) {
  const hits = [];

  for (const attacker of fighters) {
    if (!attacker.attack) continue;
    for (const hitbubble of getActiveHitbubbles(attacker)) {
      for (const defender of fighters) {
        if (defender === attacker || attacker.attack.hitVictims.has(defender.id)) continue;
        const hurtbubbles = getHurtbubbles(defender);
        if (!hurtbubbles.some(hurtbubble => bubblesOverlap(hitbubble, hurtbubble))) continue;

        applyHit(attacker, defender, hitbubble);
        attacker.attack.hitVictims.add(defender.id);
        hits.push({ attackerId: attacker.id, defenderId: defender.id, hitbubbleId: hitbubble.id });
      }
    }
  }

  return hits;
}

function applyHit(attacker, defender, hitbubble) {
  defender.damage += hitbubble.damage;
  defender.grounded = false;
  defender.hitstunFrames = Math.max(defender.hitstunFrames, hitbubble.hitstun);

  const knockback = hitbubble.baseKnockback + defender.damage * hitbubble.knockbackGrowth;
  const radians = hitbubble.angle * Math.PI / 180;
  defender.velocity.x = Math.cos(radians) * knockback * attacker.facing;
  defender.velocity.y = Math.sin(radians) * knockback;
}

function poseHurtbubble(fighter, bubble) {
  if (fighter.state.name !== 'crouch') return bubble;

  const verticalScale = fighter.archetype.crouchHurtbubbleScaleY ?? CROUCH_HURTBUBBLE_Y_SCALE;
  const radiusScale = fighter.archetype.crouchHurtbubbleRadiusScale ?? CROUCH_HURTBUBBLE_RADIUS_SCALE;
  const offsetY = bubble.offsetY < 0
    ? bubble.offsetY * verticalScale
    : bubble.offsetY;

  return {
    ...bubble,
    offsetY,
    radius: bubble.radius * radiusScale,
    rx: Number.isFinite(bubble.rx) ? bubble.rx : bubble.radius * radiusScale,
    ry: Number.isFinite(bubble.ry) ? bubble.ry * verticalScale : bubble.radius * verticalScale,
  };
}
