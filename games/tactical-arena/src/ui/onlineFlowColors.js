// Shared seat/team colors for the online lobby. Lives on its own so both the lobby
// controller (onlineFlow.js) and the lobby view renderer (onlineLobbyView.js) draw from
// one source instead of duplicating the palette.

export const PLAYER_COLOR = Object.freeze({ 1: "#5288c6", 2: "#c4463f", 3: "#d8a33f", 4: "#48a86f" });
export const TEAM_COLOR = Object.freeze({ 1: "#5288c6", 2: "#c4463f" });
