import { activePlayer } from "./selectors.js";

export function applyChoice(model, choice) {
  const { state } = model;
  const question = state.selectedQuestion;
  const player = activePlayer(model);
  const tileId = `${question.category}-${question.points}`;
  const correct = choice === question.answer;

  state.selectedChoice = choice;
  state.usedTiles.add(tileId);
  state.lastResult = null;

  if (correct) {
    player.score += question.points;
    player.streak += 1;
    return {
      screen: "correct",
      ticker: `${player.name} banks ${question.points} and keeps control.`
    };
  }

  player.streak = 0;
  return {
    screen: "wrong",
    ticker: `${player.name} missed. The penalty selector has started smiling.`
  };
}

export function applyPenaltyResult(model, loss = 180) {
  const player = activePlayer(model);
  player.score -= loss;
  model.state.lastResult = { playerId: player.id, loss };
  return {
    screen: "penalty-results",
    ticker: `${player.name} loses ${loss} points. The audience is being deeply normal about it.`
  };
}

export function passControl(model, nextPlayerId = "leo") {
  model.state.activePlayerId = nextPlayerId;
  model.state.lastResult = null;
  model.state.turn += 1;
  return {
    screen: "board",
    ticker: "Control passes to Leo. The board has reset its standards."
  };
}

export function selectTheme(model, themeId) {
  model.state.selectedThemeId = themeId;
  model.themes.forEach((theme) => {
    theme.votes = theme.id === themeId ? 2 : Math.min(theme.votes, 1);
  });
  const theme = model.themes.find((item) => item.id === themeId);
  return {
    screen: "themes",
    ticker: `${theme.name} takes the lead.`
  };
}

export function selectBoardTile(model, { category, points }) {
  const question = points >= 300 ? model.questions[1] : model.questions[0];
  question.category = category;
  question.points = points;
  model.state.selectedQuestion = question;
  model.state.lastResult = null;
  return {
    screen: "question",
    ticker: `${activePlayer(model).name} selected ${category} for ${points}.`
  };
}
