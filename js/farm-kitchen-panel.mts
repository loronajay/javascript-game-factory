// The cookbook, on screen: opened with E at a Kitchen Range. Every recipe is a
// card showing the dish itself (its model, farm-dish-models.mts) and whether
// it can be cooked now; the chosen one opens into its ingredients (each shown
// as the real produce, with what the basket holds against what it takes), its
// steps, its Cooking XP and what the Market's Kitchen pays for it at one, two
// and three stars. Cook starts the cooking games — the panel never cooks
// anything itself; it hands the recipe to the `cook` the page injects.

import { COOK_STEP_TITLES, RECIPE_CATALOG, findRecipe } from "./farm-catalog/recipes.mjs";
import { cookbook, pantryCount, recipeAvailability, type RecipeAvailability } from "./farm-kitchen.mjs";
import { dishPrice } from "./farm-market-prices.mjs";
import type { FarmInventory } from "./farm-crops.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  level: HTMLElement;
  list: HTMLElement;
  detail: HTMLElement;
  status: HTMLElement;
}>;

type Options = Readonly<{
  thumbnail?: (itemKey: string, onReady: (url: string) => void) => string | null;
  /** Start cooking a recipe; the panel closes as the games begin. */
  cook: (recipeId: string) => void;
  /** Whether this farm earns Cooking XP (account farms do; a signed-out farm does not). */
  earnsXp: () => boolean;
  onClose?: () => void;
}>;

export type KitchenPanel = Readonly<{
  open: (inventory: FarmInventory, level: number, note?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  render: (inventory: FarmInventory, level: number) => void;
  selectedRecipeId: () => string;
}>;

function node(tag: string, className = "", text = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createKitchenPanel(elements: Elements, options: Options): KitchenPanel {
  let inventory: FarmInventory | null = null;
  let level = 1;
  let selected = RECIPE_CATALOG[0]!.id;

  const isOpen = (): boolean => !elements.root.hidden;

  function portrait(itemKey: string, className: string): HTMLElement {
    const frame = node("span", className);
    frame.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; frame.replaceChildren(image); };
    const ready = options.thumbnail?.(itemKey, show);
    if (ready) show(ready);
    return frame;
  }

  function stateLine(entry: RecipeAvailability, held: number): string {
    if (entry.state === "locked") return `Learn at Cooking ${entry.recipe.minLevel}`;
    if (entry.state === "short") {
      const missing = entry.lines.filter((line) => line.short > 0);
      return missing.length === 1 ? `Need ${missing[0]!.short} more ${missing[0]!.title}` : `Need ${missing.length} more ingredients`;
    }
    return held ? `Ready · ${held} in the pantry` : "Ready to cook";
  }

  function card(entry: RecipeAvailability): HTMLElement {
    const held = pantryCount(inventory!.dishes, entry.recipe.id);
    const button = node("button", "recipe-card") as HTMLButtonElement;
    button.type = "button";
    button.dataset.recipeId = entry.recipe.id;
    button.dataset.state = entry.state;
    button.setAttribute("aria-pressed", String(entry.recipe.id === selected));
    const text = node("span", "recipe-card__text");
    text.append(node("strong", "", entry.recipe.title), node("small", "", stateLine(entry, held)));
    button.append(portrait(`dish:${entry.recipe.id}@3`, "recipe-card__dish"), text);
    button.addEventListener("click", () => {
      selected = entry.recipe.id;
      render(inventory!, level);
    });
    return button;
  }

  function detail(entry: RecipeAvailability): HTMLElement {
    const recipe = entry.recipe;
    const pane = node("div", "recipe-detail");
    const head = node("div", "recipe-detail__head");
    const words = node("div", "recipe-detail__words");
    words.append(
      node("span", "eyebrow", recipe.minLevel > 1 ? `COOKING ${recipe.minLevel}` : "FIRST RECIPES"),
      node("strong", "recipe-detail__title", recipe.title),
      node("p", "recipe-detail__blurb", recipe.blurb),
    );
    head.append(portrait(`dish:${recipe.id}@3`, "recipe-detail__dish"), words);
    const needs = node("ul", "recipe-ingredients");
    for (const line of entry.lines) {
      const item = node("li", line.short > 0 ? "is-short" : "");
      item.append(portrait(`produce:${line.id}`, "seed-card__image"), node("span", "", `${line.need} × ${line.title}`), node("small", "", `you have ${line.held}`));
      needs.append(item);
    }
    const method = node("ol", "recipe-steps");
    recipe.steps.forEach((kind) => method.append(node("li", `recipe-step recipe-step--${kind}`, COOK_STEP_TITLES[kind])));
    const facts = node("dl", "recipe-facts");
    const fact = (term: string, value: string) => facts.append(node("dt", "", term), node("dd", "", value));
    fact("Cooking XP", options.earnsXp() ? `+${recipe.xp}` : "Sign in to earn");
    fact("The Kitchen pays", `★ ${dishPrice(recipe.id, 1)} · ★★ ${dishPrice(recipe.id, 2)} · ★★★ ${dishPrice(recipe.id, 3)}`);
    fact("In your pantry", String(pantryCount(inventory!.dishes, recipe.id)));
    const cook = node("button", "farm-button farm-button--accent recipe-detail__cook") as HTMLButtonElement;
    cook.type = "button";
    cook.disabled = entry.state !== "ready";
    cook.textContent = entry.state === "ready" ? `Cook ${recipe.title}` : stateLine(entry, 0);
    cook.addEventListener("click", () => {
      if (entry.state !== "ready") return;
      close();
      options.cook(recipe.id);
    });
    pane.append(head, node("h4", "pets-section__title", "Ingredients"), needs, node("h4", "pets-section__title", "Method"), method, facts, cook);
    return pane;
  }

  function render(nextInventory: FarmInventory, nextLevel: number): void {
    inventory = nextInventory;
    level = nextLevel;
    elements.level.textContent = `Cooking ${level}`;
    const book = cookbook(inventory.produce, level);
    elements.list.replaceChildren(...book.map(card));
    const recipe = findRecipe(selected) ?? RECIPE_CATALOG[0]!;
    elements.detail.replaceChildren(detail(recipeAvailability(recipe, inventory.produce, level)));
  }

  function open(nextInventory: FarmInventory, nextLevel: number, note = ""): void {
    // Open on the first recipe that can be cooked right now, if the last one cannot.
    const book = cookbook(nextInventory.produce, nextLevel);
    if (book.find((entry) => entry.recipe.id === selected)?.state !== "ready") selected = book.find((entry) => entry.state === "ready")?.recipe.id ?? selected;
    elements.status.textContent = note;
    elements.root.hidden = false;
    document.exitPointerLock?.();
    render(nextInventory, nextLevel);
    elements.detail.querySelector<HTMLButtonElement>(".recipe-detail__cook")?.focus();
  }

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  elements.closeButton.addEventListener("click", close);
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen, render, selectedRecipeId: () => selected });
}
