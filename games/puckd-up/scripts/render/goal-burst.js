import { L } from '../config.js';

const DURATION = .95;
function rgb(hex) {
    const value = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex.slice(1) : 'ffffff';
    return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}
function mix(a, b, amount) {
    return a.map((value, index) => value + (b[index] - value) * amount);
}
function palette(hex) {
    const base = rgb(hex);
    return [base, mix(base, [1, 1, 1], .32), mix(base, [1, 1, 1], .62), mix(base, [0, 0, 0], .22)];
}

// One reusable point cloud keeps goal celebrations bounded and allocation-free.
export function createGoalBurst(THREE, scene, { count = 144, random = Math.random } = {}) {
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3), lives = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
        size: .18, transparent: true, opacity: 0, vertexColors: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    const light = new THREE.PointLight(0xffffff, 0, 8, 2);
    points.visible = false;
    points.renderOrder = 20;
    scene.add(points);
    scene.add(light);
    let age = DURATION;

    function trigger(playerScored, playerColors) {
        const scorerColor = playerColors[playerScored ? 0 : 1] || '#ffffff';
        const shades = palette(scorerColor), z = playerScored ? -L / 2 - .2 : L / 2 + .2;
        const towardCenter = playerScored ? 1 : -1;
        age = 0;
        points.visible = true;
        material.opacity = 1;
        light.color.set(scorerColor);
        light.position.set(0, .45, z);
        light.intensity = 24;
        for (let i = 0; i < count; i++) {
            const p = i * 3, angle = random() * Math.PI * 2, radial = 2.5 + random() * 5.5;
            positions[p] = (random() - .5) * .35;
            positions[p + 1] = .34 + random() * .28;
            positions[p + 2] = z + (random() - .5) * .35;
            velocities[p] = Math.cos(angle) * radial;
            velocities[p + 1] = 2.4 + random() * 6.8;
            velocities[p + 2] = Math.sin(angle) * radial + towardCenter * (1.5 + random() * 4);
            lives[i] = .55 + random() * .4;
            const shade = shades[Math.floor(random() * shades.length)];
            colors[p] = shade[0]; colors[p + 1] = shade[1]; colors[p + 2] = shade[2];
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
    }
    function tick(dt) {
        if (!points.visible) return;
        age += dt;
        if (age >= DURATION) {
            points.visible = false;
            material.opacity = light.intensity = 0;
            return;
        }
        const drag = Math.exp(-2.2 * dt);
        for (let i = 0; i < count; i++) {
            if (age >= lives[i]) continue;
            const p = i * 3;
            positions[p] += velocities[p] * dt;
            positions[p + 1] += velocities[p + 1] * dt;
            positions[p + 2] += velocities[p + 2] * dt;
            velocities[p] *= drag;
            velocities[p + 1] = velocities[p + 1] * drag - 8.5 * dt;
            velocities[p + 2] *= drag;
        }
        const fade = Math.max(0, 1 - age / DURATION);
        material.opacity = Math.min(1, fade * 1.7);
        light.intensity = 24 * fade * fade;
        geometry.attributes.position.needsUpdate = true;
    }
    return {
        handle(event, playerColors) {
            if (event.type === 'goal') trigger(Boolean(event.playerScored), playerColors);
        },
        tick,
        dispose() {
            scene.remove(points);
            scene.remove(light);
            geometry.dispose();
            material.dispose();
        },
    };
}
