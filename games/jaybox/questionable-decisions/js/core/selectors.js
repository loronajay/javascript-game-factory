export function activePlayer(model) {
  return model.players.find((player) => player.id === model.state.activePlayerId) || model.players[0];
}

export function selectedPenalty(model) {
  return model.penalties.find((penalty) => penalty.id === model.state.selectedPenaltyId) || model.penalties[0];
}

export function rankedPlayers(model) {
  return [...model.players].sort((a, b) => b.score - a.score);
}

export function isDangerScreen(screen) {
  return ["wrong", "penalty-select", "penalty-active", "penalty-results"].includes(screen);
}

export function screenKicker(screen) {
  const labels = {
    lobby: "Backstage",
    themes: "Episode Vote",
    board: "Board Control",
    question: "Question Live",
    correct: "Answer Reveal",
    wrong: "Answer Reveal",
    "penalty-select": "Penalty Draw",
    "penalty-active": "Damage Control",
    "penalty-results": "Penalty Result",
    results: "Final Recap"
  };
  return labels[screen] || "Live";
}

export function turnHeadline(screen) {
  const labels = {
    lobby: "is waiting",
    themes: "votes first",
    board: "has control",
    question: "is answering",
    correct: "keeps control",
    wrong: "is in trouble",
    "penalty-select": "faces the wheel",
    "penalty-active": "is defusing",
    "penalty-results": "takes damage",
    results: "survived"
  };
  return labels[screen] || "is live";
}
