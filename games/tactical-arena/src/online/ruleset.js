// Bump this whenever online lockstep state construction, command semantics, or the
// wire contract changes in a way that mixed client builds cannot safely replay.
// 3: fire tiles carry `ownerId` for kill attribution. `tileObjects` is part of the
//    authoritative state hash, so a v2 client and a v3 client would desync the moment
//    either lit a fire — this bump makes them refuse to pair in the lobby instead.
export const ONLINE_RULESET_VERSION = 3;
