import { createCabinet } from './scripts/cabinet.js';
// Keep external library loading at the boundary; the cabinet modules are ordinary ESM.
try {
    const [THREE, CANNON, account] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/three@0.166.1/+esm'),
        import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/+esm'),
        // Standalone CPU play must survive missing shared-platform modules.
        import('./scripts/platform/account-access.js')
            .then(module => module.createAccountAccess())
            .catch(error => { console.warn('Online platform integration unavailable:', error); return undefined; }),
    ]);
    createCabinet({ THREE, CANNON, account });
}
catch (error) {
    console.error('PUCK\'D UP failed to start:', error);
    document.getElementById('gameState').textContent = 'LOAD ERROR';
    const message = document.createElement('div');
    message.className = 'loadError';
    message.textContent = 'Could not start the 3D cabinet. Serve this folder over HTTP and check your connection: Three.js and cannon-es currently load from a CDN. Reload to try again.';
    document.getElementById('gamewrap').replaceChildren(message);
}
