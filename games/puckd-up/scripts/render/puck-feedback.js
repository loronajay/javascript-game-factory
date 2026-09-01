export const PUCK_FEEDBACK_TIERS = Object.freeze([
    { id: 'normal', min: 0, trail: 0, glow: 0, impact: .55, pitch: .88, color: 0xe5e9ed },
    { id: 'charged', min: 10, trail: .22, glow: .18, impact: .72, pitch: .97, color: 0xa8eaff },
    { id: 'fast', min: 18, trail: .48, glow: .48, impact: .94, pitch: 1.08, color: 0x61d7ff },
    { id: 'hot', min: 23, trail: .72, glow: .86, impact: 1.18, pitch: 1.20, color: 0xffa24d },
    { id: 'extreme', min: 27, trail: 1, glow: 1.35, impact: 1.48, pitch: 1.34, color: 0xfff0b0 },
]);

export function getPuckFeedback(speed) {
    const value = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    for (let i = PUCK_FEEDBACK_TIERS.length - 1; i >= 0; i--)
        if (value >= PUCK_FEEDBACK_TIERS[i].min) return PUCK_FEEDBACK_TIERS[i];
    return PUCK_FEEDBACK_TIERS[0];
}

export function createPuckFeedback(THREE, scene, puckMesh, { trailPoints = 16, sparkCount = 14 } = {}) {
    const trailPositions = new Float32Array(trailPoints * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x61d7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trail.frustumCulled = false;
    scene.add(trail);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(.48, .58, 40), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);

    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: .075, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
    sparks.visible = false;
    scene.add(sparks);
    const sparkVelocity = Array.from({ length: sparkCount }, () => ({ x: 0, y: 0, z: 0 }));
    let impactAge = 1, historyReady = false;

    function clearTrail(position) {
        for (let i = 0; i < trailPoints; i++) {
            trailPositions[i * 3] = position.x;
            trailPositions[i * 3 + 1] = .13;
            trailPositions[i * 3 + 2] = position.z;
        }
        trailGeometry.attributes.position.needsUpdate = true;
        historyReady = true;
    }
    function handle(event) {
        if (!['puck-hit', 'wall-hit'].includes(event.type) || !event.position) return;
        const tier = getPuckFeedback(event.speed);
        impactAge = 0;
        ring.visible = true;
        ring.position.set(event.position.x, .07, event.position.z);
        ring.scale.setScalar(tier.impact);
        ringMaterial.color.setHex(tier.color);
        sparks.visible = tier.id !== 'normal';
        sparkMaterial.color.setHex(tier.color);
        for (let i = 0; i < sparkCount; i++) {
            const angle = i / sparkCount * Math.PI * 2 + (event.type === 'wall-hit' ? .24 : 0);
            const force = tier.impact * (.7 + (i % 3) * .16);
            sparkPositions[i * 3] = event.position.x;
            sparkPositions[i * 3 + 1] = .16;
            sparkPositions[i * 3 + 2] = event.position.z;
            sparkVelocity[i].x = Math.cos(angle) * force;
            sparkVelocity[i].y = .22 + (i % 4) * .07;
            sparkVelocity[i].z = Math.sin(angle) * force;
        }
        sparkGeometry.attributes.position.needsUpdate = true;
    }
    function tick(dt, bodies, active = true) {
        const puck = bodies.puckBody;
        const speed = active ? Math.hypot(puck.velocity.x, puck.velocity.z) : 0;
        const tier = getPuckFeedback(speed);
        if (!historyReady || !active) clearTrail(puck.position);
        else {
            trailPositions.copyWithin(3, 0, trailPositions.length - 3);
            trailPositions[0] = puck.position.x;
            trailPositions[1] = .14;
            trailPositions[2] = puck.position.z;
            trailGeometry.attributes.position.needsUpdate = true;
        }
        const visiblePoints = Math.max(2, Math.round(2 + tier.trail * (trailPoints - 2)));
        trailGeometry.setDrawRange(0, visiblePoints);
        trailMaterial.opacity = active ? tier.trail * .72 : 0;
        trailMaterial.color.setHex(tier.color);
        if (puckMesh.material.emissive) puckMesh.material.emissive.setHex(tier.color);
        puckMesh.material.emissiveIntensity = active ? tier.glow : 0;
        impactAge += dt;
        if (impactAge < .24) {
            const life = 1 - impactAge / .24;
            ringMaterial.opacity = life * .9;
            ring.scale.multiplyScalar(1 + dt * 5.5);
            sparkMaterial.opacity = life * .86;
            const positions = sparkGeometry.attributes.position.array;
            for (let i = 0; i < sparkCount; i++) {
                positions[i * 3] += sparkVelocity[i].x * dt;
                positions[i * 3 + 1] += sparkVelocity[i].y * dt;
                positions[i * 3 + 2] += sparkVelocity[i].z * dt;
            }
            sparkGeometry.attributes.position.needsUpdate = true;
        }
        else {
            ring.visible = false;
            sparks.visible = false;
        }
    }
    return { handle, tick };
}
