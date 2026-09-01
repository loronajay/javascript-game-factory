import { createScene } from './scene.js';
import { createTable } from './table.js';
import { createVenues } from './venues/index.js';
import { createGoalBurst } from './goal-burst.js';
const CPU_COLOR = '#3f7194';

export function visiblePlayerColors(config, state) {
    return state.mode === 'online' && Array.isArray(state.playerColors) ? state.playerColors : [config.playerColor, CPU_COLOR];
}
// Rendering reads bodies. Animation ages advance in tick(), never in render().
export function createView(THREE, canvas, container) {
    const stage = createScene(THREE, canvas, container);
    try {
        const table = createTable(THREE, stage.scene);
        const venues = createVenues(THREE, stage, table);
        const goalBurst = createGoalBurst(THREE, stage.scene);
        let elapsed = 0, arena = null, config = null, colors = [];
        function applyColors(next) {
            if (colors[0] === next[0] && colors[1] === next[1]) return;
            colors = [...next];
            table.applyColors(...colors);
            stage.warm.color.set(colors[0]);
            stage.cool.color.set(colors[1]);
        }
        return {
            camera: stage.camera, resize: stage.resize,
            dispose() {
                goalBurst.dispose();
                stage.dispose();
            },
            configure(nextConfig) {
                config = nextConfig;
                if (arena !== nextConfig.arenaId) {
                    arena = nextConfig.arenaId;
                    venues.applyArenaTheme(arena);
                }
                applyColors([nextConfig.playerColor, CPU_COLOR]);
            },
            handle(event) {
                goalBurst.handle(event, colors);
            },
            tick(dt, simulation, match) {
                if (match.state.screen === 'paused')
                    return;
                applyColors(visiblePlayerColors(config, match.state));
                elapsed += dt;
                venues.updateArenaVisuals(elapsed);
                goalBurst.tick(dt);
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
