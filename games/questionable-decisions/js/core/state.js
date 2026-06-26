import { createPrototypeContent } from "../data/prototype-content.js";

export function createGameState(content) {
  return {
    screen: "lobby",
    activePlayerId: "jay",
    selectedThemeId: "internet",
    selectedQuestion: content.questions[0],
    usedTiles: new Set(["Bad Ideas-100", "Snack Court-300"]),
    selectedChoice: "",
    lastResult: null,
    selectedPenaltyId: "bomb",
    penaltyRolling: false,
    penaltyRollTimer: 0,
    transitionKey: 0,
    reactions: ["Skill Issue", "No Pressure"],
    turn: 4,
    maxTurns: 16,
    roomCode: "8392",
    ticker: "The room is live. Somebody is about to make this everyone else's problem."
  };
}

export function createPrototypeModel() {
  const content = createPrototypeContent();
  return {
    ...content,
    state: createGameState(content)
  };
}

export function resetPrototypeModel(model) {
  const fresh = createPrototypeModel();
  model.players.splice(0, model.players.length, ...fresh.players);
  model.themes.splice(0, model.themes.length, ...fresh.themes);
  model.categories.splice(0, model.categories.length, ...fresh.categories);
  model.questions.splice(0, model.questions.length, ...fresh.questions);
  model.penalties.splice(0, model.penalties.length, ...fresh.penalties);
  model.reactions.splice(0, model.reactions.length, ...fresh.reactions);
  model.state = fresh.state;
  return model;
}
