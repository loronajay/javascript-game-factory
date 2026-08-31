import { loadSettings } from './settings.js';
import { createMatch } from './core/match.js';
import { createFixedStep } from './core/fixed-step.js';
import { createSimulation } from './physics/simulation.js';
import { createView } from './render/view.js';
import { createControls } from './input/controls.js';
import { createUI } from './ui/controller.js';
import { createAudio } from './audio/audio.js';
import { createOnlineController } from './online/controller.js';
import { createOnlineClient } from './online/client.js';
import { createOnlineSync } from './online/sync.js';
// Composition/lifecycle boundary for a future platform adapter. No singleton state.
export function createCabinet({ THREE, CANNON, account, onlineClient, doc = document }) {
    const win = doc.defaultView, disposers = [], handlers = [];
    let frameId = 0, lastTime = null, disposed = false;
    const abort = new AbortController();
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        win.cancelAnimationFrame(frameId);
        abort.abort();
        for (const cleanup of disposers.reverse())
            cleanup();
        handlers.length = 0;
    }
    function own(value) {
        disposers.push(() => value.dispose());
        return value;
    }
    try {
        let storage;
        try {
            storage = win.localStorage;
        }
        catch { /* Restricted embedding is supported. */
        }
        const config = loadSettings(storage);
        const emit = event => {
            for (const handle of handlers)
                handle(event);
        };
        const match = createMatch({ config, emit });
        const simulation = own(createSimulation(CANNON, match, { emit }));
        const client = onlineClient || createOnlineClient({ resolveIdentity: () => account.resolve() });
        const sync = own(createOnlineSync({ client, match, emit }));
        const activeSimulation = () => match.state.mode === 'online' ? sync : simulation;
        const metrics = Object.fromEntries(['speed', 'power', 'lastShot'].map(key => [key, 0]));
        const view = own(createView(THREE, doc.getElementById('game'), doc.getElementById('gamewrap')));
        const audio = own(createAudio({ muted: config.muted }));
        const controls = own(createControls({ THREE, canvas: doc.getElementById('game'), camera: view.camera, match, unlock: audio.unlock }));
        const ui = own(createUI({ doc, match, metrics, audio, controls, view, storage, onlineClient: client }));
        const online = own(createOnlineController({ doc, match, account, client }));
        const clock = createFixedStep(dt => {
            const input = controls.sample();
            if (match.state.mode === 'online') sync.tick(dt, input);
            else { match.tick(dt); simulation.tick(dt, input); }
            Object.assign(metrics, activeSimulation().metrics);
            view.tick(dt, activeSimulation(), match);
        });
        handlers.push(event => { if (match.state.mode !== 'online') simulation.handle(event); }, controls.handle, view.handle, audio.handle, ui.handle, online.handle, event => {
            if (event.type === 'screen') {
                clock.reset();
                lastTime = null;
            }
        });
        const options = { signal: abort.signal };
        doc.addEventListener('visibilitychange', () => {
            audio.setHidden(doc.hidden);
            clock.reset();
            lastTime = null;
            if (doc.hidden) {
                controls.clear();
                match.pause();
            }
        }, options);
        // A bfcache restore keeps this instance; ordinary navigation tears it down.
        win.addEventListener('pagehide', event => {
            if (event.persisted) {
                audio.setHidden(true);
                match.pause();
            }
            else
                dispose();
        }, options);
        win.addEventListener('pageshow', () => {
            audio.setHidden(doc.hidden);
            lastTime = null;
        }, options);
        function frame(timestamp) {
            if (disposed)
                return;
            if (lastTime !== null && !doc.hidden)
                clock.advance((timestamp - lastTime) / 1000);
            lastTime = timestamp;
            ui.render();
            view.render(activeSimulation().bodies);
            frameId = win.requestAnimationFrame(frame);
        }
        frameId = win.requestAnimationFrame(frame);
        return { pause: () => match.pause(), dispose };
    }
    catch (error) {
        dispose();
        throw error;
    }
}
