const DECKS = [
  { id: "meat_deck", name: "Meat Deck" },
  { id: "useless_deck", name: "Useless Deck" },
];

export function mountDeckSelect(root, navigate, { p1Name = "Player 1", p2Name = "Player 2" } = {}) {
  root.innerHTML = "";

  let mode = "blind"; // "blind" | "draft"
  renderDeckSelect();

  function renderDeckSelect() {
    root.innerHTML = "";

    const screen = el("div", "deck-select-screen");
    const heading = el("p", "deck-select-heading");
    heading.textContent = "Select Decks";

    const tabBar = buildModeTabs(mode, (nextMode) => {
      mode = nextMode;
      renderDeckSelect();
    });

    let content;
    if (mode === "blind") {
      content = buildBlindPick(p1Name, p2Name, (playerConfigs) => {
        navigate("game-board", { playerConfigs });
      });
    } else {
      content = buildDraftPick(p1Name, p2Name, (playerConfigs) => {
        navigate("game-board", { playerConfigs });
      });
    }

    const backBtn = el("button", "menu-button scene-button");
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", () => navigate("main-menu"));
    backBtn.style.maxWidth = "300px";

    screen.append(heading, tabBar, content, backBtn);
    root.append(screen);
  }
}

function buildModeTabs(activeMode, onChange) {
  const bar = el("div", "deck-select-mode-tabs");

  for (const { id, label } of [
    { id: "blind", label: "Blind Pick" },
    { id: "draft", label: "Draft Pick" },
  ]) {
    const btn = el("button", id === activeMode ? "deck-tab deck-tab--active" : "deck-tab");
    btn.textContent = label;
    if (id !== activeMode) {
      btn.addEventListener("click", () => onChange(id));
    }
    bar.append(btn);
  }

  return bar;
}

function buildBlindPick(p1Name, p2Name, onConfirm) {
  const container = el("div");
  container.style.display = "contents";

  let phase = "p1"; // "p1" | "cover" | "p2" | "reveal"
  let p1Pick = null;
  let p2Pick = null;

  renderBlind();

  function renderBlind() {
    container.innerHTML = "";

    if (phase === "cover") {
      const cover = el("div", "deck-select-cover");
      const msg = el("p", "deck-cover-message");
      msg.textContent = `${p1Name} has picked.\nPass the screen to ${p2Name}.`;
      msg.style.whiteSpace = "pre-line";
      const hint = el("p", "deck-cover-hint");
      hint.textContent = "Don't peek!";
      const readyBtn = el("button", "menu-button scene-button");
      readyBtn.textContent = `${p2Name} is ready →`;
      readyBtn.style.maxWidth = "260px";
      readyBtn.addEventListener("click", () => {
        phase = "p2";
        renderBlind();
      });
      cover.append(msg, hint, readyBtn);
      container.append(cover);
      return;
    }

    if (phase === "reveal") {
      const reveal = el("div");
      reveal.style.display = "contents";

      const prompt = el("p", "deck-select-prompt");
      prompt.textContent = "Both players have picked!";

      const summary = el("div", "deck-grid");
      const p1Card = buildDeckCard(DECKS.find(d => d.id === p1Pick), true);
      const p1Label = el("p", "deck-select-prompt");
      p1Label.textContent = p1Name;
      p1Label.style.fontSize = "11px";
      const p2Card = buildDeckCard(DECKS.find(d => d.id === p2Pick), true);
      const p2Label = el("p", "deck-select-prompt");
      p2Label.textContent = p2Name;
      p2Label.style.fontSize = "11px";

      const p1Wrap = el("div");
      p1Wrap.style.display = "flex";
      p1Wrap.style.flexDirection = "column";
      p1Wrap.style.alignItems = "center";
      p1Wrap.style.gap = "6px";
      p1Wrap.append(p1Label, p1Card);

      const p2Wrap = el("div");
      p2Wrap.style.display = "flex";
      p2Wrap.style.flexDirection = "column";
      p2Wrap.style.alignItems = "center";
      p2Wrap.style.gap = "6px";
      p2Wrap.append(p2Label, p2Card);

      summary.append(p1Wrap, p2Wrap);

      const startBtn = el("button", "menu-button scene-button");
      startBtn.textContent = "Start Match →";
      startBtn.style.maxWidth = "260px";
      startBtn.addEventListener("click", () => {
        onConfirm([
          { id: "p1", name: p1Name, deckId: p1Pick },
          { id: "p2", name: p2Name, deckId: p2Pick },
        ]);
      });

      reveal.append(prompt, summary, startBtn);
      container.append(reveal);
      return;
    }

    const currentPlayer = phase === "p1" ? p1Name : p2Name;
    const prompt = el("p", "deck-select-prompt");
    prompt.textContent = `${currentPlayer} — pick your deck`;

    const grid = el("div", "deck-grid");
    for (const deck of DECKS) {
      const card = buildDeckCard(deck, false);
      card.addEventListener("click", () => {
        if (phase === "p1") {
          p1Pick = deck.id;
          phase = "cover";
        } else {
          p2Pick = deck.id;
          phase = "reveal";
        }
        renderBlind();
      });
      grid.append(card);
    }

    container.append(prompt, grid);
  }

  return container;
}

function buildDraftPick(p1Name, p2Name, onConfirm) {
  const container = el("div");
  container.style.display = "contents";

  let phase = "coin"; // "coin" | "p1-pick" | "p2-pick" | "reveal"
  let firstPickerId = null;
  let p1Pick = null;
  let p2Pick = null;

  renderDraft();

  function renderDraft() {
    container.innerHTML = "";

    if (phase === "coin") {
      const coinResult = Math.random() < 0.5 ? "p1" : "p2";
      firstPickerId = coinResult;
      const firstName = coinResult === "p1" ? p1Name : p2Name;

      const coinBox = el("div", "coin-toss-result");
      coinBox.textContent = `Coin toss: ${firstName} picks first!`;

      const continueBtn = el("button", "menu-button scene-button");
      continueBtn.textContent = "Continue →";
      continueBtn.style.maxWidth = "260px";
      continueBtn.addEventListener("click", () => {
        phase = firstPickerId === "p1" ? "p1-pick" : "p2-pick";
        renderDraft();
      });

      container.append(coinBox, continueBtn);
      return;
    }

    if (phase === "p1-pick" || phase === "p2-pick") {
      const currentId = phase === "p1-pick" ? "p1" : "p2";
      const currentName = currentId === "p1" ? p1Name : p2Name;

      const prompt = el("p", "deck-select-prompt");
      prompt.textContent = `${currentName} — pick your deck`;

      const grid = el("div", "deck-grid");
      for (const deck of DECKS) {
        const card = buildDeckCard(deck, false);
        card.addEventListener("click", () => {
          if (currentId === "p1") {
            p1Pick = deck.id;
          } else {
            p2Pick = deck.id;
          }

          if (currentId === firstPickerId) {
            const secondId = firstPickerId === "p1" ? "p2" : "p1";
            if (DECKS.length === 2) {
              const remaining = DECKS.find(d => d.id !== deck.id);
              if (secondId === "p1") {
                p1Pick = remaining.id;
              } else {
                p2Pick = remaining.id;
              }
              phase = "reveal";
            } else {
              phase = secondId === "p1" ? "p1-pick" : "p2-pick";
            }
          } else {
            phase = "reveal";
          }
          renderDraft();
        });
        grid.append(card);
      }

      container.append(prompt, grid);
      return;
    }

    if (phase === "reveal") {
      const prompt = el("p", "deck-select-prompt");
      prompt.textContent = "Decks assigned!";

      const summary = el("div", "deck-grid");

      const p1Card = buildDeckCard(DECKS.find(d => d.id === p1Pick), true);
      const p1Label = el("p", "deck-select-prompt");
      p1Label.textContent = p1Name;
      p1Label.style.fontSize = "11px";
      const p1Wrap = el("div");
      p1Wrap.style.display = "flex";
      p1Wrap.style.flexDirection = "column";
      p1Wrap.style.alignItems = "center";
      p1Wrap.style.gap = "6px";
      p1Wrap.append(p1Label, p1Card);

      const p2Card = buildDeckCard(DECKS.find(d => d.id === p2Pick), true);
      const p2Label = el("p", "deck-select-prompt");
      p2Label.textContent = p2Name;
      p2Label.style.fontSize = "11px";
      const p2Wrap = el("div");
      p2Wrap.style.display = "flex";
      p2Wrap.style.flexDirection = "column";
      p2Wrap.style.alignItems = "center";
      p2Wrap.style.gap = "6px";
      p2Wrap.append(p2Label, p2Card);

      summary.append(p1Wrap, p2Wrap);

      const startBtn = el("button", "menu-button scene-button");
      startBtn.textContent = "Start Match →";
      startBtn.style.maxWidth = "260px";
      startBtn.addEventListener("click", () => {
        onConfirm([
          { id: "p1", name: p1Name, deckId: p1Pick },
          { id: "p2", name: p2Name, deckId: p2Pick },
        ]);
      });

      container.append(prompt, summary, startBtn);
    }
  }

  return container;
}

function buildDeckCard(deck, selected) {
  const card = el("div", selected ? "deck-card deck-card--selected" : "deck-card");
  const name = el("p", "deck-card__name");
  name.textContent = deck.name;
  const label = el("span", "deck-card__label");
  label.textContent = "60 Cards";
  card.append(name, label);
  return card;
}

function el(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
