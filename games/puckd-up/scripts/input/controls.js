// Browser events collect intent only. sample() hands it to the fixed simulation tick.
// All listeners and pointer ownership belong to this cabinet instance.
export function createControls({ THREE, canvas, camera, match, unlock = () => {
} }) {
    const controller = new AbortController(), options = { signal: controller.signal };
    const doc = canvas.ownerDocument, win = doc.defaultView;
    const keys = new Set(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.25), hit = new THREE.Vector3();
    let pointerId = null, target = null, dx = 0, dz = 0;
    const live = () => match.state.screen === 'playing';
    const movementKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);
    function clear() {
        keys.clear();
        target = null;
        dx = dz = 0;
        if (pointerId !== null && canvas.hasPointerCapture?.(pointerId))
            canvas.releasePointerCapture(pointerId);
        pointerId = null;
    }
    function point(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(plane, hit))
            target = { x: hit.x, z: hit.z };
    }
    function requestLock() {
        if (!live() || !doc.fullscreenElement || doc.pointerLockElement === canvas)
            return;
        try {
            canvas.requestPointerLock?.()?.catch?.(() => {
            });
        }
        catch { /* Pointer/touch fallback remains usable. */
        }
    }
    function releaseLock() {
        clear();
        if (doc.pointerLockElement === canvas)
            doc.exitPointerLock?.();
    }
    canvas.addEventListener('pointerdown', event => {
        if (!live())
            return;
        unlock();
        canvas.focus();
        if (doc.fullscreenElement && event.pointerType !== 'touch') {
            requestLock();
            return;
        }
        pointerId = event.pointerId;
        canvas.setPointerCapture?.(pointerId);
        point(event);
    }, options);
    canvas.addEventListener('pointermove', event => {
        if (!live() || doc.pointerLockElement === canvas)
            return;
        if (event.pointerType === 'mouse' || event.pointerId === pointerId)
            point(event);
    }, options);
    canvas.addEventListener('pointerup', event => {
        if (event.pointerId !== pointerId)
            return;
        if (canvas.hasPointerCapture?.(pointerId))
            canvas.releasePointerCapture(pointerId);
        pointerId = null;
    }, options);
    canvas.addEventListener('pointercancel', clear, options);
    doc.addEventListener('mousemove', event => {
        if (doc.pointerLockElement === canvas && live()) {
            dx += event.movementX * .020;
            dz += event.movementY * .020;
        }
    }, options);
    doc.addEventListener('pointerlockchange', () => {
        if (doc.pointerLockElement !== canvas && live())
            match.pause();
    }, options);
    canvas.addEventListener('keydown', event => {
        if (!live())
            return;
        if (event.key === 'Escape') {
            event.preventDefault();
            match.pause();
            return;
        }
        const key = event.key.toLowerCase();
        if (movementKeys.has(key)) {
            event.preventDefault();
            unlock();
            keys.add(key);
        }
    }, options);
    // Key release may happen after focus moves to a menu or outside the canvas.
    win.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()), options);
    win.addEventListener('blur', () => {
        clear();
        match.pause();
    }, options);
    canvas.addEventListener('blur', () => keys.clear(), options);
    return {
        clear, requestLock, releaseLock,
        sample() {
            const input = { target, dx, dz, keys };
            target = null;
            dx = dz = 0;
            return input;
        },
        handle(event) {
            if (event.type === 'screen') {
                clear();
                if (event.screen !== 'playing')
                    releaseLock();
            }
            if (event.type === 'round-reset')
                clear();
        },
        dispose() {
            controller.abort();
            releaseLock();
        },
    };
}
