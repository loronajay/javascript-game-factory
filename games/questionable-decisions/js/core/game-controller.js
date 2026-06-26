import { applyChoice, applyPenaltyResult, passControl, selectBoardTile, selectTheme } from "./game-rules.js";
import { activePlayer, selectedPenalty } from "./selectors.js";
import { createPrototypeModel, resetPrototypeModel } from "./state.js";
import { button, escapeHtml } from "../render/html.js";
import { renderApp } from "../render/layout.js";

export function createGameController({ app, model = createPrototypeModel(), windowRef = globalThis.window } = {}) {
  if (!app) {
    throw new Error("Questionable Decisions needs an app element to mount.");
  }

  function render() {
    app.innerHTML = renderApp(model);
  }

  function setScreen(screen, ticker) {
    model.state.screen = screen;
    model.state.transitionKey += 1;
    if (ticker) {
      model.state.ticker = ticker;
    }
    render();
  }

  function navigate(result) {
    setScreen(result.screen, result.ticker);
  }

  function updateTickerText() {
    const tickerText = app.querySelector(".ticker-text");
    if (!tickerText) {
      render();
      return;
    }
    tickerText.textContent = model.state.ticker;
  }

  function addReaction(reaction) {
    model.state.reactions.push(reaction);
    const feed = app.querySelector(".reaction-feed");
    if (!feed) {
      render();
      return;
    }
    feed.insertAdjacentHTML("afterbegin", `<div class="reaction-bubble">${escapeHtml(reaction)}</div>`);
    while (feed.children.length > 5) {
      feed.removeChild(feed.lastElementChild);
    }
  }

  function updatePenaltyDrawUi() {
    const panel = app.querySelector(".penalty-panel");
    if (!panel) {
      render();
      return;
    }

    const title = panel.querySelector(".stage-title");
    const track = panel.querySelector(".selector-track");
    const actions = panel.querySelector(".screen-actions");

    if (title) {
      title.textContent = model.state.penaltyRolling ? "Drawing penalty..." : "Penalty locked.";
    }
    if (track) {
      track.classList.toggle("is-rolling", model.state.penaltyRolling);
    }
    panel.querySelectorAll(".mini-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.penaltyId === model.state.selectedPenaltyId);
    });
    if (actions) {
      actions.innerHTML = model.state.penaltyRolling ? '<button class="btn danger" disabled>Drawing...</button>' : `${button("Begin Penalty", "penalty-active", "danger")}${button("Re-spin", "respin", "ghost")}`;
    }
    updateTickerText();
  }

  function startPenaltyDraw() {
    if (model.state.penaltyRollTimer) {
      windowRef.clearInterval(model.state.penaltyRollTimer);
    }
    model.state.screen = "penalty-select";
    model.state.transitionKey += 1;
    model.state.penaltyRolling = true;
    model.state.ticker = `The missed ${model.state.selectedQuestion.points}-point question starts the penalty draw.`;
    render();

    let step = 0;
    const finalPenaltyId = "bomb";
    model.state.penaltyRollTimer = windowRef.setInterval(() => {
      step += 1;
      const penalty = model.penalties[step % model.penalties.length];
      model.state.selectedPenaltyId = penalty.id;
      model.state.ticker = `${penalty.name} flashes on the board...`;
      updatePenaltyDrawUi();

      if (step >= 13) {
        windowRef.clearInterval(model.state.penaltyRollTimer);
        model.state.penaltyRollTimer = 0;
        model.state.selectedPenaltyId = finalPenaltyId;
        model.state.penaltyRolling = false;
        model.state.ticker = `${selectedPenalty(model).name} locks in. ${activePlayer(model).name} is up.`;
        updatePenaltyDrawUi();
      }
    }, 115);
  }

  function resetPrototype() {
    if (model.state.penaltyRollTimer) {
      windowRef.clearInterval(model.state.penaltyRollTimer);
      model.state.penaltyRollTimer = 0;
    }
    resetPrototypeModel(model);
    setScreen("lobby", "The room is live. Somebody is about to make this everyone else's problem.");
  }

  function handleAction(action) {
    const player = activePlayer(model);
    const actions = {
      lobby: () => setScreen("lobby", "Contestants return backstage. Confidence remains medically unverified."),
      themes: () => setScreen("themes", "The room is choosing tonight's category of regret."),
      board: () => setScreen("board", `${activePlayer(model).name} has the board. The tiles are pretending to be harmless.`),
      "board-after-correct": () => {
        model.state.lastResult = null;
        setScreen("board", `${player.name} keeps control after a correct answer.`);
      },
      "penalty-spin": startPenaltyDraw,
      "penalty-select": () => setScreen("penalty-select", `The missed ${model.state.selectedQuestion.points}-point question starts the penalty draw.`),
      "penalty-active": () => setScreen("penalty-active", `${player.name} is now negotiating with Bomb Diffuser.`),
      "penalty-results": () => navigate(applyPenaltyResult(model)),
      "pass-control": () => navigate(passControl(model)),
      results: () => setScreen("results", "Final recap is on the big board."),
      "correct-demo": () => navigate(applyChoice(model, model.state.selectedQuestion.answer)),
      reset: resetPrototype,
      respin: () => {
        const currentIndex = model.penalties.findIndex((penalty) => penalty.id === model.state.selectedPenaltyId);
        model.state.selectedPenaltyId = model.penalties[(currentIndex + 1) % model.penalties.length].id;
        setScreen("penalty-select", `${selectedPenalty(model).name} is now selected.`);
      }
    };
    if (actions[action]) {
      actions[action]();
    }
  }

  function handleClick(event) {
    const actionButton = event.target.closest("[data-action]");
    const themeButton = event.target.closest("[data-theme]");
    const tileButton = event.target.closest("[data-tile]");
    const choiceButton = event.target.closest("[data-choice]");
    const reactionButton = event.target.closest("[data-reaction]");

    if (actionButton) {
      handleAction(actionButton.dataset.action);
      return;
    }

    if (themeButton) {
      navigate(selectTheme(model, themeButton.dataset.theme));
      return;
    }

    if (tileButton && !tileButton.disabled) {
      navigate(selectBoardTile(model, {
        category: tileButton.dataset.category,
        points: Number(tileButton.dataset.points)
      }));
      return;
    }

    if (choiceButton) {
      navigate(applyChoice(model, choiceButton.dataset.choice));
      return;
    }

    if (reactionButton) {
      addReaction(reactionButton.dataset.reaction);
    }
  }

  function mount() {
    app.addEventListener("click", handleClick);
    render();
    return api;
  }

  function destroy() {
    if (model.state.penaltyRollTimer) {
      windowRef.clearInterval(model.state.penaltyRollTimer);
      model.state.penaltyRollTimer = 0;
    }
    app.removeEventListener("click", handleClick);
  }

  const api = {
    model,
    render,
    mount,
    destroy,
    handleAction,
    setScreen
  };

  return api;
}
