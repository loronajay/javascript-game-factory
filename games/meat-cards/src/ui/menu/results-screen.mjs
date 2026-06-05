export function mountResultsScreen(root, navigate, { result, playerConfigs }) {
  root.innerHTML = "";

  const { winnerId, winnerName, stats } = result;

  const screen = el("div", "results-screen");

  const winnerEl = el("h1", "results-winner");
  winnerEl.textContent = `${winnerName} wins!`;

  const subtitle = el("p", "results-subtitle");
  subtitle.textContent = `Match complete — ${stats.turnsPlayed} turn${stats.turnsPlayed === 1 ? "" : "s"} played`;

  const statsTable = buildStatsTable(playerConfigs, stats.byPlayer);

  const actions = el("div", "results-actions");

  const rematchBtn = el("button", "menu-button scene-button");
  rematchBtn.textContent = "Rematch";
  rematchBtn.addEventListener("click", () => navigate("game-board", { playerConfigs }));

  const menuBtn = el("button", "menu-button scene-button");
  menuBtn.textContent = "Main Menu";
  menuBtn.addEventListener("click", () => navigate("main-menu"));

  actions.append(rematchBtn, menuBtn);
  screen.append(winnerEl, subtitle, statsTable, actions);
  root.append(screen);
}

function buildStatsTable(playerConfigs, byPlayer) {
  const table = el("div", "results-stats");

  const header = el("div", "results-stats__header");
  const statLabel = el("div", "results-stats__col-label");
  statLabel.textContent = "Stat";
  header.append(statLabel);

  for (const config of playerConfigs) {
    const col = el("div", "results-stats__col-label");
    col.textContent = config.name;
    header.append(col);
  }

  table.append(header);

  const rows = [
    { label: "Damage Dealt", key: "damageDealt" },
    { label: "Monsters Killed", key: "monstersKilled" },
    { label: "Cards Played", key: "cardsPlayed" },
    { label: "Stars Spent", key: "starsSpent" },
  ];

  for (const row of rows) {
    const rowEl = el("div", "results-stats__row");

    const label = el("div", "results-stats__label");
    label.textContent = row.label;
    rowEl.append(label);

    for (const config of playerConfigs) {
      const val = el("div", "results-stats__value");
      val.textContent = byPlayer[config.id]?.[row.key] ?? 0;
      rowEl.append(val);
    }

    table.append(rowEl);
  }

  return table;
}

function el(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
