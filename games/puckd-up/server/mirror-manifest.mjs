// Explicit allowlist: no generic server files or other games are overwritten.
export const mirrorFiles = [
    ['package.json', 'package.json'],
    ['server/authority.js', 'server/authority.js'],
    ['server/lobby-game.js', 'server/lobby-game.js'],
    ['server/puckd-up.game.mjs', 'server/puckd-up.game.mjs'],
    ['server/server-contract.test.mjs', 'puckd-up.test.mjs'],
    ...['config.js', 'settings.js', 'core/match.js', 'core/fixed-step.js', 'input/player-motion.js',
        'online/protocol.js', 'physics/simulation.js', 'physics/world.js', 'physics/collisions.js',
        'physics/table-layout.js', 'physics/cpu.js'].map(path => [`scripts/${path}`, `scripts/${path}`]),
];
export const cannonSha256 = 'f0700cbd3a482954949b9d58c1b0f76dcc74767750297647a39d8c40dd63d37c';
