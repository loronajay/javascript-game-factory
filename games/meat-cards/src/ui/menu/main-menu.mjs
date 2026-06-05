export function mountMainMenu(root, navigate) {
  root.innerHTML = "";

  const screen = el("div", "menu-screen");

  const title = el("h1", "menu-title");
  title.textContent = "Meat Cards";

  const subtitle = el("p", "menu-subtitle");
  subtitle.textContent = "A card game about meat";

  const list = el("ul", "menu-button-list");
  list.append(
    lockedItem("VS CPU"),
    lockedItem("Online Multiplayer"),
    activeItem("Debug", () => navigate("debug")),
    activeItem("How to Play", () => navigate("how-to-play")),
    lockedItem("Settings"),
  );

  screen.append(title, subtitle, list);
  root.append(screen);
}

function activeItem(label, onClick) {
  const li = el("li");
  const btn = el("button", "menu-button scene-button");
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  li.append(btn);
  return li;
}

function lockedItem(label) {
  const li = el("li");
  const btn = el("button", "menu-button menu-button--locked scene-button");
  btn.disabled = true;

  const text = document.createTextNode(label + " ");
  const badge = el("span", "menu-lock-badge");
  badge.textContent = "Soon";
  btn.append(text, badge);
  li.append(btn);
  return li;
}

function el(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
