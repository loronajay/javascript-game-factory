import { createScene } from './scene.js';
import { createTable } from './table.js';
import { createVenues } from './venues/index.js';
import { createTrail } from './trail.js';
// Rendering reads bodies. Animation ages advance in tick(), never in render().
export function createView(THREE, canvas, container) {
    const stage = createScene(THREE, canvas, container);
    try {
        const table = createTable(THREE, stage.scene);
        const venues = createVenues(THREE, stage, table);
        const trail = createTrail(THREE, stage.scene);
        let elapsed = 0, arena = null, color = null;
        return {
            camera: stage.camera, resize: stage.resize, dispose: stage.dispose,
            configure(config) {
                if (arena !== config.arenaId) {
                    arena = config.arenaId;
                    venues.applyArenaTheme(arena);
                }
                if (color !== config.playerColor) {
                    color = config.playerColor;
                    table.applyPlayerColor(color);
                    stage.warm.color.set(color);
                }
            },
            handle(event) {
                if (['round-reset', 'goal', 'match-reset'].includes(event.type))
                    trail.clear();
            },
            tick(dt, simulation, match) {
                if (match.state.screen === 'paused')
                    return;
                elapsed += dt;
                venues.updateArenaVisuals(elapsed);
                trail.update(dt, simulation.metrics.speed, simulation.bodies.puckBody, match.state.screen === 'playing' && match.state.phase === 'live');
            },
            render(bodies) {
                table.sync(bodies);
                stage.renderer.render(stage.scene, stage.camera);
            },
        };
    }
    catch (error) {
        stage.dispose();
        throw error;
    }
}
