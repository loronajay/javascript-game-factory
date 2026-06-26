(function () {
  const app = document.getElementById("app");

  const players = [
    { id: "jay", name: "Jay", score: 300, ready: true, color: "#2ee6d6", streak: 1 },
    { id: "leo", name: "Leo", score: 100, ready: true, color: "#f7c548", streak: 0 },
    { id: "rose", name: "Rosanna", score: 200, ready: false, color: "#e845b5", streak: 0 },
    { id: "mike", name: "Mike", score: 0, ready: true, color: "#ff9f1c", streak: 0 }
  ];

  const themes = [
    { id: "internet", name: "Internet Brain", desc: "Memes, bad takes, viral lore, and cursed timelines.", votes: 2 },
    { id: "games", name: "Video Games", desc: "Console wars, boss fights, launch disasters, and deep cuts.", votes: 1 },
    { id: "weird", name: "Weird Science", desc: "Space, animals, lab accidents, and facts that sound fake.", votes: 1 },
    { id: "food", name: "Food Court", desc: "Snacks, chain restaurants, kitchen crimes, and flavor debates.", votes: 0 },
    { id: "movies", name: "Movies & TV", desc: "Quotes, actors, finales, and things everyone misremembers.", votes: 0 },
    { id: "nostalgia", name: "2000s Panic", desc: "Old internet, toys, music videos, and mall-era damage.", votes: 0 }
  ];

  const categories = ["Bad Ideas", "Screen Time", "Fake Facts", "Snack Court"];
  const questions = [
    {
      id: "q1",
      category: "Screen Time",
      points: 200,
      prompt: "Which streaming service released Stranger Things?",
      choices: ["Hulu", "Netflix", "Prime Video", "Peacock"],
      answer: "Netflix"
    },
    {
      id: "q2",
      category: "Bad Ideas",
      points: 300,
      prompt: "What app popularized short looping six-second videos?",
      choices: ["Vine", "Tumblr", "Periscope", "Meerkat"],
      answer: "Vine"
    }
  ];

  const penalties = [
    { id: "cabinet", name: "Cabinet Says", icon: "CS", desc: "Read the command. Obey only when the cabinet says." },
    { id: "pattern", name: "Pattern Panic", icon: "PP", desc: "Repeat the flashing sequence before your brain leaks out." },
    { id: "bomb", name: "Bomb Diffuser", icon: "BD", desc: "Decode shifting controls before the timer gets dramatic." },
    { id: "stack", name: "Stack Overflow", icon: "SO", desc: "Sort falling junk into the right bins as the stage floods." }
  ];

  const reactions = ["Cooked", "Skill Issue", "No Pressure", "Respect", "Folded", "Brain Offline"];

  const state = {
    screen: "lobby",
    activePlayerId: "jay",
    selectedThemeId: "internet",
    selectedQuestion: questions[0],
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

  function activePlayer() {
    return players.find((player) => player.id === state.activePlayerId) || players[0];
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function button(label, action, className) {
    return `<button class="btn ${className || ""}" data-action="${action}">${escapeHtml(label)}</button>`;
  }

  function render() {
    const player = activePlayer();
    const danger = ["wrong", "penalty-select", "penalty-active", "penalty-results"].includes(state.screen);
    app.innerHTML = `
      <section class="show-shell">
        ${renderMarquee(player)}
        <section class="stage-grid">
          ${renderPlayerRail()}
          <section class="main-stage screen-${state.screen} ${danger ? "is-danger" : ""}" data-transition="${state.transitionKey}">
            ${renderStageLights()}
            ${renderStage()}
          </section>
          ${renderReactionRail()}
        </section>
        ${renderTicker()}
      </section>
    `;
  }

  function renderStageLights() {
    return `
      <div class="stage-light-rig" aria-hidden="true">
        ${Array.from({ length: 18 }, (_, index) => `<span style="--stagger: ${index}"></span>`).join("")}
      </div>
    `;
  }

  function renderMarquee(player) {
    return `
      <header class="top-marquee">
        <div class="brand-lockup">
          <p class="brand-subtitle">Live penalty trivia</p>
          <h1 class="brand-title">Questionable Decisions</h1>
        </div>
        <div class="turn-display">
          <span class="turn-kicker">${escapeHtml(screenKicker())}</span>
          <p class="turn-headline">${escapeHtml(player.name)} ${escapeHtml(turnHeadline())}</p>
        </div>
        <div class="room-display">
          <span class="label">Room</span>
          <strong class="room-code">${state.roomCode}</strong>
          <span class="micro">Turn ${state.turn} / ${state.maxTurns}</span>
        </div>
      </header>
    `;
  }

  function screenKicker() {
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
    return labels[state.screen] || "Live";
  }

  function turnHeadline() {
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
    return labels[state.screen] || "is live";
  }

  function renderPlayerRail() {
    return `
      <aside class="player-rail">
        <h2 class="rail-title">Podiums</h2>
        <div class="podium-list">
          ${players.map(renderPodium).join("")}
        </div>
      </aside>
    `;
  }

  function renderPodium(player) {
    const active = player.id === state.activePlayerId;
    const hit = state.lastResult && state.lastResult.playerId === player.id ? "is-hit" : "";
    return `
      <article class="podium ${active ? "is-active" : ""} ${hit}" style="--player-color: ${player.color}">
        <div class="podium-row">
          <strong class="podium-name">${escapeHtml(player.name)}</strong>
          <span class="ready-light ${player.ready ? "is-ready" : ""}" aria-label="${player.ready ? "Ready" : "Not ready"}"></span>
        </div>
        <div class="podium-row">
          <span class="label">${active ? "In control" : "Watching"}</span>
          <strong class="podium-score">${player.score}</strong>
        </div>
        <div class="podium-meta">
          <span>Streak ${player.streak}</span>
          ${state.lastResult && state.lastResult.playerId === player.id ? `<span class="floating-delta">-${state.lastResult.loss}</span>` : "<span>Ready</span>"}
        </div>
      </article>
    `;
  }

  function renderReactionRail() {
    return `
      <aside class="reaction-rail">
        <h2 class="rail-title">Audience</h2>
        <div class="reaction-buttons">
          ${reactions.map((reaction) => `<button class="btn reaction" data-reaction="${escapeHtml(reaction)}">${escapeHtml(reaction)}</button>`).join("")}
        </div>
        <div class="reaction-feed" aria-label="Reaction feed">
          ${renderReactionBubbles()}
        </div>
      </aside>
    `;
  }

  function renderReactionBubbles() {
    return state.reactions.slice(-5).reverse().map((reaction) => `<div class="reaction-bubble">${escapeHtml(reaction)}</div>`).join("");
  }

  function addReaction(reaction) {
    state.reactions.push(reaction);
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

  function renderTicker() {
    return `
      <footer class="host-ticker">
        <span class="ticker-light"></span>
        <p class="ticker-text">${escapeHtml(state.ticker)}</p>
        <div class="screen-actions">
          ${button("Reset Show", "reset", "ghost")}
        </div>
      </footer>
    `;
  }

  function updateTickerText() {
    const tickerText = app.querySelector(".ticker-text");
    if (!tickerText) {
      render();
      return;
    }
    tickerText.textContent = state.ticker;
  }

  function renderStage() {
    const screens = {
      lobby: renderLobby,
      themes: renderThemes,
      board: renderBoard,
      question: renderQuestion,
      correct: renderCorrect,
      wrong: renderWrong,
      "penalty-select": renderPenaltySelect,
      "penalty-active": renderPenaltyActive,
      "penalty-results": renderPenaltyResults,
      results: renderResults
    };
    return (screens[state.screen] || renderLobby)();
  }

  function renderLobby() {
    return `
      <div class="stage-content">
        <section class="hero-lock">
          <span class="eyebrow">Private room ${state.roomCode}</span>
          <h2 class="stage-title lobby-title">Greenroom ready.</h2>
          <p class="stage-copy">Four contestants are seated. Vote the episode, light the board, then let the scoreboard start making things personal.</p>
          <div class="lobby-podium-stage">
            ${players.map((player, index) => `
              <span class="contestant-marker ${player.ready ? "is-ready" : ""}" style="--player-color: ${player.color}; --stagger: ${index}">
                <span>${escapeHtml(player.name)}</span>
              </span>
            `).join("")}
          </div>
          <div class="screen-actions">
            ${button("Theme Vote", "themes", "primary")}
            ${button("Jump to Board", "board", "")}
          </div>
        </section>
      </div>
    `;
  }

  function renderThemes() {
    const maxVotes = Math.max(...themes.map((theme) => theme.votes), 1);
    return `
      <div class="stage-content align-top">
        <span class="eyebrow">Episode Vote</span>
        <h2 class="stage-title">Pick the category of regret.</h2>
        <section class="theme-grid">
          ${themes.map((theme) => {
            const selected = theme.id === state.selectedThemeId;
            const leading = theme.votes === maxVotes;
            return `
              <button class="theme-card ${selected ? "is-selected" : ""} ${leading ? "is-leading" : ""}" data-theme="${theme.id}" style="--stagger: ${themes.indexOf(theme)}">
                <span class="theme-episode">Episode ${String(themes.indexOf(theme) + 1).padStart(2, "0")}</span>
                <span class="label">${theme.votes} votes</span>
                <span>
                  <h3 class="theme-name">${escapeHtml(theme.name)}</h3>
                  <p class="theme-desc">${escapeHtml(theme.desc)}</p>
                </span>
                <span class="vote-meter"><span class="vote-fill" style="--vote-width: ${(theme.votes / maxVotes) * 100}%"></span></span>
              </button>
            `;
          }).join("")}
        </section>
        <div class="screen-actions">
          ${button("Light the Board", "board", "primary")}
          ${button("Backstage", "lobby", "ghost")}
        </div>
      </div>
    `;
  }

  function renderBoard() {
    return `
      <div class="stage-content align-top">
        <span class="eyebrow">Internet Brain - Board Live</span>
        <div class="question-meta">
          <h2 class="stage-title">Choose damage.</h2>
          <span class="timer-badge">Control: ${escapeHtml(activePlayer().name)}</span>
        </div>
        <section class="board-grid" aria-label="Trivia board">
          ${categories.map((category) => `<div class="category">${escapeHtml(category)}</div>`).join("")}
          ${[100, 200, 300, 400].map((points) => categories.map((category) => renderTile(category, points)).join("")).join("")}
        </section>
      </div>
    `;
  }

  function renderTile(category, points) {
    const id = `${category}-${points}`;
    const used = state.usedTiles.has(id);
    const tileIndex = categories.indexOf(category) + ([100, 200, 300, 400].indexOf(points) * categories.length);
    return `<button class="tile ${used ? "is-used" : ""}" ${used ? "disabled" : ""} data-tile="${escapeHtml(id)}" data-category="${escapeHtml(category)}" data-points="${points}" style="--stagger: ${tileIndex}" aria-label="${escapeHtml(category)} for ${points}"><span>${points}</span></button>`;
  }

  function renderQuestion() {
    const question = state.selectedQuestion;
    return `
      <div class="stage-content">
        <section class="question-card">
          <div class="question-meta">
            <span class="point-badge">${question.category} / ${question.points}</span>
            <span class="timer-badge">14 seconds</span>
          </div>
          <h2 class="prompt">${escapeHtml(question.prompt)}</h2>
          <div class="choice-grid">
            ${question.choices.map((choice, index) => `<button class="btn choice" data-choice="${escapeHtml(choice)}" style="--stagger: ${index}">${escapeHtml(choice)}</button>`).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderCorrect() {
    return `
      <div class="stage-content">
        <section class="reveal-panel">
          <p class="reveal-word correct">Correct</p>
          <div class="score-swing">+${state.selectedQuestion.points}</div>
          <p class="stage-copy">${escapeHtml(activePlayer().name)} keeps control. Everyone else gets to keep pretending they knew that.</p>
          <div class="screen-actions">
            ${button("Back to Board", "board-after-correct", "primary")}
            ${button("Show Results", "results", "")}
          </div>
        </section>
      </div>
    `;
  }

  function renderWrong() {
    return `
      <div class="stage-content">
        <section class="reveal-panel">
          <p class="reveal-word wrong">Wrong</p>
          <p class="stage-copy">The answer was ${escapeHtml(state.selectedQuestion.answer)}. The scoreboard is holding its breath.</p>
          <div class="screen-actions">
            ${button("Spin Penalty", "penalty-spin", "danger")}
            ${button("Try Correct Beat", "correct-demo", "ghost")}
          </div>
        </section>
      </div>
    `;
  }

  function renderPenaltySelect() {
    return `
      <div class="stage-content">
        <section class="penalty-panel">
          <span class="eyebrow">Maximum loss: ${Math.round(state.selectedQuestion.points * 1.5)}</span>
          <h2 class="stage-title">${state.penaltyRolling ? "Drawing penalty..." : "Penalty locked."}</h2>
          <div class="selector-track ${state.penaltyRolling ? "is-rolling" : ""}">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="mini-game-grid">
            ${penalties.map((penalty, index) => `
              <article class="mini-card ${penalty.id === state.selectedPenaltyId ? "is-selected" : ""}" data-penalty-id="${escapeHtml(penalty.id)}" style="--stagger: ${index}">
                <div class="mini-icon">${escapeHtml(penalty.icon)}</div>
                <h3 class="mini-name">${escapeHtml(penalty.name)}</h3>
                <p class="mini-desc">${escapeHtml(penalty.desc)}</p>
              </article>
            `).join("")}
          </div>
          <div class="screen-actions">
            ${state.penaltyRolling ? '<button class="btn danger" disabled>Drawing...</button>' : button("Begin Penalty", "penalty-active", "danger")}
            ${state.penaltyRolling ? "" : button("Re-spin", "respin", "ghost")}
          </div>
        </section>
      </div>
    `;
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
      title.textContent = state.penaltyRolling ? "Drawing penalty..." : "Penalty locked.";
    }
    if (track) {
      track.classList.toggle("is-rolling", state.penaltyRolling);
    }
    panel.querySelectorAll(".mini-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.penaltyId === state.selectedPenaltyId);
    });
    if (actions) {
      actions.innerHTML = state.penaltyRolling ? '<button class="btn danger" disabled>Drawing...</button>' : `${button("Begin Penalty", "penalty-active", "danger")}${button("Re-spin", "respin", "ghost")}`;
    }
    updateTickerText();
  }

  function renderPenaltyActive() {
    return `
      <div class="stage-content align-top">
        <section class="penalty-selector">
          <div class="penalty-meta">
            <span class="loss-badge">Live loss: 180</span>
            <span class="timer-badge">Bomb 7 / 10</span>
            <span class="point-badge">Max loss ${Math.round(state.selectedQuestion.points * 1.5)}</span>
          </div>
          <div class="penalty-arena">
            <div class="bomb-face">
              <span class="bomb-code">A7-K2</span>
            </div>
            <div class="wire-row">
              <button class="wire" style="--wire-color:#ff335f; --stagger: 0" data-action="penalty-results" aria-label="Red wire"></button>
              <button class="wire" style="--wire-color:#2ee6d6; --stagger: 1" data-action="penalty-results" aria-label="Cyan wire"></button>
              <button class="wire" style="--wire-color:#f7c548; --stagger: 2" data-action="penalty-results" aria-label="Gold wire"></button>
              <button class="wire" style="--wire-color:#30d158; --stagger: 3" data-action="penalty-results" aria-label="Green wire"></button>
              <button class="wire" style="--wire-color:#e845b5; --stagger: 4" data-action="penalty-results" aria-label="Magenta wire"></button>
            </div>
          </div>
          <div class="screen-actions">
            ${button("Resolve Damage", "penalty-results", "danger")}
            ${button("Back to Selector", "penalty-select", "ghost")}
          </div>
        </section>
      </div>
    `;
  }

  function renderPenaltyResults() {
    return `
      <div class="stage-content">
        <section class="results-panel">
          <span class="eyebrow">Bomb Diffuser complete</span>
          <h2 class="stage-title">Damage applied.</h2>
          <div class="result-grid">
            <article class="result-stat" style="--stagger: 0"><span class="label">Raw loss</span><strong>180</strong></article>
            <article class="result-stat" style="--stagger: 1"><span class="label">Applied loss</span><strong>180</strong></article>
            <article class="result-stat" style="--stagger: 2"><span class="label">Bombs exploded</span><strong>3</strong></article>
          </div>
          <p class="stage-copy">Control passes to Leo. Jay lost points, dignity, and approximately three seconds of emotional stability.</p>
          <div class="screen-actions">
            ${button("Pass Control", "pass-control", "primary")}
            ${button("Final Recap", "results", "")}
          </div>
        </section>
      </div>
    `;
  }

  function renderResults() {
    const ranked = [...players].sort((a, b) => b.score - a.score);
    return `
      <div class="stage-content">
        <section class="results-panel">
          <span class="eyebrow">Broadcast recap</span>
          <h2 class="stage-title">${escapeHtml(ranked[0].name)} owns the room.</h2>
          <div class="result-grid">
            <article class="result-stat" style="--stagger: 0"><span class="label">Winner</span><strong>${escapeHtml(ranked[0].name)}</strong></article>
            <article class="result-stat" style="--stagger: 1"><span class="label">Biggest point loss</span><strong>180</strong></article>
            <article class="result-stat" style="--stagger: 2"><span class="label">Roughest penalty</span><strong>${escapeHtml(selectedPenalty().name)}</strong></article>
          </div>
          <div class="screen-actions">
            ${button("Run It Back", "reset", "primary")}
            ${button("Board", "board", "")}
          </div>
        </section>
      </div>
    `;
  }

  function setScreen(screen, ticker) {
    state.screen = screen;
    state.transitionKey += 1;
    if (ticker) {
      state.ticker = ticker;
    }
    render();
  }

  function selectedPenalty() {
    return penalties.find((penalty) => penalty.id === state.selectedPenaltyId) || penalties[0];
  }

  function startPenaltyDraw() {
    if (state.penaltyRollTimer) {
      window.clearInterval(state.penaltyRollTimer);
    }
    state.screen = "penalty-select";
    state.transitionKey += 1;
    state.penaltyRolling = true;
    state.ticker = `The missed ${state.selectedQuestion.points}-point question starts the penalty draw.`;
    render();

    let step = 0;
    const finalPenaltyId = "bomb";
    state.penaltyRollTimer = window.setInterval(() => {
      step += 1;
      state.selectedPenaltyId = penalties[step % penalties.length].id;
      state.ticker = `${penalties[step % penalties.length].name} flashes on the board...`;
      updatePenaltyDrawUi();

      if (step >= 13) {
        window.clearInterval(state.penaltyRollTimer);
        state.penaltyRollTimer = 0;
        state.selectedPenaltyId = finalPenaltyId;
        state.penaltyRolling = false;
        state.ticker = `${selectedPenalty().name} locks in. ${activePlayer().name} is up.`;
        updatePenaltyDrawUi();
      }
    }, 115);
  }

  function selectChoice(choice) {
    state.selectedChoice = choice;
    const correct = choice === state.selectedQuestion.answer;
    const player = activePlayer();
    const tileId = `${state.selectedQuestion.category}-${state.selectedQuestion.points}`;
    state.usedTiles.add(tileId);
    state.lastResult = null;

    if (correct) {
      player.score += state.selectedQuestion.points;
      player.streak += 1;
      setScreen("correct", `${player.name} banks ${state.selectedQuestion.points} and keeps control.`);
    } else {
      player.streak = 0;
      setScreen("wrong", `${player.name} missed. The penalty selector has started smiling.`);
    }
  }

  function applyPenaltyResult() {
    const player = activePlayer();
    player.score -= 180;
    state.lastResult = { playerId: player.id, loss: 180 };
    setScreen("penalty-results", `${player.name} loses 180 points. The audience is being deeply normal about it.`);
  }

  function resetPrototype() {
    if (state.penaltyRollTimer) {
      window.clearInterval(state.penaltyRollTimer);
      state.penaltyRollTimer = 0;
    }
    players[0].score = 300;
    players[0].streak = 1;
    players[1].score = 100;
    players[1].streak = 0;
    players[2].score = 200;
    players[3].score = 0;
    state.activePlayerId = "jay";
    state.selectedThemeId = "internet";
    state.selectedQuestion = questions[0];
    state.usedTiles = new Set(["Bad Ideas-100", "Snack Court-300"]);
    state.selectedChoice = "";
    state.lastResult = null;
    state.selectedPenaltyId = "bomb";
    state.penaltyRolling = false;
    state.reactions = ["Skill Issue", "No Pressure"];
    state.turn = 4;
    setScreen("lobby", "The room is live. Somebody is about to make this everyone else's problem.");
  }

  function handleAction(action) {
    const player = activePlayer();
    const actions = {
      lobby: () => setScreen("lobby", "Contestants return backstage. Confidence remains medically unverified."),
      themes: () => setScreen("themes", "The room is choosing tonight's category of regret."),
      board: () => setScreen("board", `${activePlayer().name} has the board. The tiles are pretending to be harmless.`),
      "board-after-correct": () => {
        state.lastResult = null;
        setScreen("board", `${player.name} keeps control after a correct answer.`);
      },
      "penalty-spin": startPenaltyDraw,
      "penalty-select": () => setScreen("penalty-select", `The missed ${state.selectedQuestion.points}-point question starts the penalty draw.`),
      "penalty-active": () => setScreen("penalty-active", `${player.name} is now negotiating with Bomb Diffuser.`),
      "penalty-results": applyPenaltyResult,
      "pass-control": () => {
        state.activePlayerId = "leo";
        state.lastResult = null;
        state.turn += 1;
        setScreen("board", "Control passes to Leo. The board has reset its standards.");
      },
      results: () => setScreen("results", "Final recap is on the big board."),
      "correct-demo": () => selectChoice(state.selectedQuestion.answer),
      reset: resetPrototype,
      respin: () => {
        const currentIndex = penalties.findIndex((penalty) => penalty.id === state.selectedPenaltyId);
        state.selectedPenaltyId = penalties[(currentIndex + 1) % penalties.length].id;
        setScreen("penalty-select", `${selectedPenalty().name} is now selected.`);
      }
    };
    if (actions[action]) {
      actions[action]();
    }
  }

  app.addEventListener("click", (event) => {
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
      state.selectedThemeId = themeButton.dataset.theme;
      themes.forEach((theme) => {
        theme.votes = theme.id === state.selectedThemeId ? 2 : Math.min(theme.votes, 1);
      });
      setScreen("themes", `${themes.find((theme) => theme.id === state.selectedThemeId).name} takes the lead.`);
      return;
    }

    if (tileButton && !tileButton.disabled) {
      const category = tileButton.dataset.category;
      const points = Number(tileButton.dataset.points);
      state.selectedQuestion = points >= 300 ? questions[1] : questions[0];
      state.selectedQuestion.category = category;
      state.selectedQuestion.points = points;
      state.lastResult = null;
      setScreen("question", `${activePlayer().name} selected ${category} for ${points}.`);
      return;
    }

    if (choiceButton) {
      selectChoice(choiceButton.dataset.choice);
      return;
    }

    if (reactionButton) {
      addReaction(reactionButton.dataset.reaction);
    }
  });

  render();
}());
