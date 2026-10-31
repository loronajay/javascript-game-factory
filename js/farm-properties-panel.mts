import { FARM_LOTS, farmLotBounds } from "./farm-catalog/lots.mjs";
import { type FarmLayout } from "./farm-layout.mjs";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}

export function createPropertiesPanel(deps: Readonly<{
  canBuy: boolean; farm: () => FarmLayout; balance: () => number | null;
  shop: () => Promise<any>; purchase: (id: string) => Promise<any>;
  move: (id: string) => Promise<{ ok: boolean; error?: string }>;
  takeBalance: (balance: number) => void; onClose: () => void;
}>) {
  const root = element("aside", "inventory-panel properties-panel"); root.hidden = true;
  root.id = "propertiesPanel"; root.setAttribute("aria-label", "Country properties");
  const header = element("header", "pets-panel__head");
  const heading = element("div"); heading.append(element("span", "eyebrow", "THE PROPERTY OFFICE"), element("strong", "", "A new place to call home"));
  const closeButton = element("button", "farm-button", "Done"); closeButton.type = "button";
  header.append(heading, closeButton);
  const body = element("div", "properties-panel__body");
  const status = element("p", "properties-panel__status"); status.setAttribute("aria-live", "polite");
  root.append(header, body, status); document.querySelector(".farm-shell")!.append(root);
  const owned = new Set<string>(); const prices = new Map<string, number>();
  let busy = false; let ready = false;
  const close = () => { root.hidden = true; deps.onClose(); };
  closeButton.addEventListener("click", close);
  function draw(): void {
    body.replaceChildren();
    const current = FARM_LOTS.find((property) => property.id === deps.farm().lot);
    body.append(element("p", "properties-panel__intro", `Home now: ${current?.title ?? "Meadow Farm"}. A property purchase moves your existing farm into a new landscape. Your animals, buildings, crops, furniture and progress come with you.`));
    body.append(element("p", "properties-panel__balance", deps.balance() === null ? "Sign in to purchase property with tickets." : `${deps.balance()!.toLocaleString()} tickets available`));
    for (const property of FARM_LOTS) {
      const card = element("article", `property-card property-card--${property.theme}`);
      const image = element("img", "property-card__preview"); image.src = new URL(`../farm/assets/properties/${property.preview}`, import.meta.url).toString(); image.alt = `${property.title}: ${property.setting}`;
      image.loading = "lazy";
      const copy = element("div", "property-card__copy");
      copy.append(element("span", "eyebrow", property.setting), element("h2", "", property.title), element("p", "", property.description));
      const features = element("ul"); for (const feature of property.features) features.append(element("li", "", feature)); copy.append(features);
      const price = prices.get(property.id) ?? property.price;
      const home = property.id === deps.farm().lot;
      const smaller = property.size < farmLotBounds(deps.farm()).width;
      const button = element("button", "farm-button property-card__buy", home ? "Your current home" : smaller ? "Your farm has outgrown this property" : owned.has(property.id) ? "Move your farm here" : `Buy & move here - ${price.toLocaleString()} tickets`);
      button.type = "button"; button.disabled = busy || !ready || !deps.canBuy || home || smaller;
      button.addEventListener("click", () => { void buy(property.id); });
      copy.append(button); card.append(image, copy); body.append(card);
    }
  }
  async function buy(id: string): Promise<void> {
    if (busy || !deps.canBuy) return;
    busy = true; status.textContent = "Preparing your new home..."; draw();
    try {
      if (!owned.has(id)) {
        const result = await deps.purchase(id);
        if (!result?.ok) { status.textContent = result?.error === "insufficient_tickets" ? "You need more tickets for this property." : "The purchase did not go through. Try again."; return; }
        owned.add(id);
        if (Number.isSafeInteger(result.balance)) deps.takeBalance(result.balance);
      }
      const moved = await deps.move(id);
      status.textContent = moved.ok ? "Your new home is ready. Take the farm road home to see it." : "You own this property. The move could not be saved; choose Move your farm here to retry without paying again.";
    } catch { status.textContent = "The property office could not be reached. Please try again."; }
    finally { busy = false; draw(); }
  }
  return {
    root, close, isOpen: () => !root.hidden,
    async open() {
      root.hidden = false; draw(); status.textContent = "Loading the property register...";
      try {
        const shop = await deps.shop();
        if (!shop && deps.canBuy) { status.textContent = "The property register could not be reached. Close this window and try again."; return; }
        for (const id of shop?.ownedIds ?? []) owned.add(id);
        for (const item of shop?.items ?? []) if (Number.isSafeInteger(item.price)) prices.set(item.id, item.price);
        ready = true; status.textContent = deps.canBuy ? "Permanent ownership. No rent and no loss of your existing farm." : "Sign in to purchase a new home.";
      } catch { status.textContent = "The property register could not be reached. Try again."; }
      finally { draw(); }
    },
  };
}
