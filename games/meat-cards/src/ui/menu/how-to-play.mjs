export function mountHowToPlay(root, navigate) {
  root.innerHTML = "";

  const screen = el("div", "htp-screen");

  const backBtn = el("button", "menu-button scene-button htp-back");
  backBtn.textContent = "← Back";
  backBtn.addEventListener("click", () => navigate("main-menu"));

  const content = el("div", "htp-content");

  const title = el("h1", "menu-title");
  title.textContent = "How to Play";
  title.style.fontSize = "clamp(20px, 5vw, 40px)";
  title.style.marginBottom = "12px";

  content.append(
    title,
    section("Objective", [
      "Reduce your opponent's HP from 20 to 0 to win.",
    ]),
    section("Your Turn", [
      "You start each turn with 5 Stars to spend.",
      "Summon monsters, attack, equip accessories, or play Later cards.",
      "When you end your turn, unspent Stars deal damage to you — 1 damage per leftover Star.",
      "You can also discard a hand card to cover 1 unspent Star before ending.",
    ]),
    section("Monsters", [
      "Summon monsters from your hand to one of your 4 monster slots.",
      "Summoning costs Stars (shown on the card).",
      "Monsters attack once per turn. Attacking costs 2 Stars.",
      "When a monster is attacked, a D6 is rolled. Hit on 4, 5, or 6.",
      "If a monster's HP reaches 0 it is sent to the graveyard.",
      "Monsters cannot take offensive actions on their first turn.",
    ]),
    section("Accessories", [
      "Accessories equip to one of your monsters.",
      "Equipped accessories grant passive bonuses or new actions to the monster they're attached to.",
    ]),
    section("Later Cards", [
      "Later cards have immediate special effects.",
      "Some require an enemy or friendly monster target.",
      "Played Later cards go to the graveyard.",
    ]),
    section("Hand Limit", [
      "Your hand limit is 7 cards.",
      "If you end a turn with more than 7 cards you must discard down to 7.",
    ]),
    section("Deck-Out", [
      "If you must draw and your deck is empty you take 2 damage per card you failed to draw.",
    ]),
    section("Setup Turn", [
      "Neither player may take any offensive action on their very first turn.",
      "Use it to summon a monster and set up your board.",
    ]),
  );

  screen.append(backBtn, content);
  root.append(screen);
}

function section(heading, lines) {
  const div = el("div", "htp-section");
  const h2 = el("h2");
  h2.textContent = heading;
  div.append(h2);
  const ul = el("ul");
  for (const line of lines) {
    const li = el("li");
    li.textContent = line;
    ul.append(li);
  }
  div.append(ul);
  return div;
}

function el(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
