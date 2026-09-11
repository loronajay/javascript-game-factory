import { createScene } from './scene.js';
import { createTable } from './table.js';
import { createVenues } from './venues/index.js';
import { createGoalBurst } from './goal-burst.js';
import { getRival } from '../physics/rivals.js';
import { rivalLoadout } from '../cosmetics/rival-appearance.js';
import { defaultLoadout } from '../cosmetics/loadout.js';

export function visiblePlayerColors(config, state) {
    return state.mode === 'online' && Array.isArray(state.playerColors) ? state.playerColors : [config.playerColor, getRival(config.rivalId).color];
}
// Rendering reads bodies. Animation ages advance in tick(), never in render().
//
// EQUIPMENT COMES FROM OUTSIDE, AND IT IS ONE LOADOUT. The view owns no
// cosmetic state of its own and never sees the player's list of saved designs:
// the near half is whichever loadout the garage store has EQUIPPED, and the far
// half is either an online opponent's public loadout or the current rival's
// kit. Three sources, one shape, drawn by the same code.
export function createView(THREE, canvas, container) {
    const stage = createScene(THREE, canvas, container);
    try {
        const table = createTable(THREE, stage.scene);
        const venues = createVenues(THREE, stage, table);
        const goalBurst = createGoalBurst(THREE, stage.scene);
        let elapsed = 0, arena = null, config = null, colors = [];
        let playerLoadout = defaultLoadout();
        // Set only when a real opponent's loadout has been fetched. Null means
        // "the rival on the other side of the table", which is the CPU case.
        let opponentLoadout = null;

        function applyColors(next) {
            if (colors[0] === next[0] && colors[1] === next[1]) return;
            colors = [...next];
            table.applyColors(...colors);
            stage.warm.color.set(colors[0]);
            stage.cool.color.set(colors[1]);
        }
        function dressPlayer() {
            table.applyHalfAppearance('player', playerLoadout.tableHalf);
            table.applyMalletAppearance('player', playerLoadout.mallet);
        }
        function dressOpponent() {
            const loadout = opponentLoadout ?? rivalLoadout(getRival(config?.rivalId));
            table.applyHalfAppearance('cpu', loadout.tableHalf);
            table.applyMalletAppearance('cpu', loadout.mallet);
        }
        return {
            camera: stage.camera, resize: stage.resize,
            setCameraMode: stage.setCameraMode, setViewportBand: stage.setViewportBand,
            orbitBy: stage.orbitBy, zoomBy: stage.zoomBy,
            dispose() {
                goalBurst.dispose();
                table.dispose();
                stage.dispose();
            },
            /** The player's EQUIPPED loadout, never their garage. Near half only. */
            equipPlayer(loadout) {
                playerLoadout = loadout;
                dressPlayer();
            },
            /** An online opponent's public loadout, or null to fall back to the rival. */
            equipOpponent(loadout) {
                opponentLoadout = loadout;
                dressOpponent();
            },
            showCollisionOverlay(visible) {
                table.showCollisionOverlay(visible);
            },
            configure(nextConfig) {
                config = nextConfig;
                if (arena !== nextConfig.arenaId) {
                    arena = nextConfig.arenaId;
                    venues.applyArenaTheme(arena);
                    // The venue themes the whole cabinet, so equipped halves are
                    // re-asserted on top of it rather than being painted over.
                    table.refreshHalves();
                }
                applyColors([nextConfig.playerColor, getRival(nextConfig.rivalId).color]);
                dressPlayer();
                dressOpponent();
            },
            handle(event) {
                goalBurst.handle(event, colors);
                table.handleFeedback(event);
            },
            tick(dt, simulation, match) {
                if (match.state.screen === 'paused')
                    return;
                applyColors(visiblePlayerColors(config, match.state));
                elapsed += dt;
                venues.updateArenaVisuals(elapsed);
                goalBurst.tick(dt);
                table.tickFeedback(dt, simulation.bodies, match.state.phase === 'live');
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
