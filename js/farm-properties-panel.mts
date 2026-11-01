import { FARM_LOTS } from "./farm-catalog/lots.mjs";
import { type FarmLayout } from "./farm-layout.mjs";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}

export function createPropertiesPanel(deps: Readonly<{
  canBuy: boolean; farm: () => FarmLayout; balance: () => number | null;
  shop: () => Promise<any>; purchase: (id: string) => Promise<any>;
  selectProperty: (id: string) => Promise<{ ok: boolean; error?: string }>;
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
    body.append(element("p", "properties-panel__intro", `Home now: ${current?.title ?? "Meadow Farm"}. Each property has its own farm, animals, buildings, crops and inventory. Your tickets and skills are shared. Switching leaves your other farms intact.`));
    body.append(element("p", "properties-panel__balance", deps.balance() === null ? "Sign in to purchase property with tickets." : `${deps.balance()!.toLocaleString()} tickets available`));
    const meadow = element("button", "farm-button", deps.farm().lot ? "Return to Meadow Farm · 28 × 28 m" : "Meadow Farm · Current farm");
    meadow.type = "button"; meadow.disabled = busy || !ready || !deps.canBuy || !deps.farm().lot;
    meadow.addEventListener("click", () => { void buy("meadow"); }); body.append(meadow);
    for (const property of FARM_LOTS) {
      const card = element("article", `property-card property-card--${property.theme}`);
      const image = element("img", "property-card__preview"); image.src = new URL(`../farm/assets/properties/${property.preview}`, import.meta.url).toString(); image.alt = `${property.title}: ${property.setting}`;
      image.loading = "lazy";
      const copy = element("div", "property-card__copy");
      copy.append(element("span", "eyebrow", property.setting), element("h2", "", property.title), element("p", "", property.description));
      const features = element("ul"); for (const feature of property.features) features.append(element("li", "", feature)); copy.append(features);
      const price = prices.get(property.id) ?? property.price;
      const home = property.id === deps.farm().lot;
      const button = element("button", "farm-button property-card__buy", home ? "Your current farm" : owned.has(property.id) ? "Switch to this farm" : `Buy a separate farm - ${price.toLocaleString()} tickets`);
      button.type = "button"; button.disabled = busy || !ready || !deps.canBuy || home;
      button.addEventListener("click", () => { void buy(property.id); });
      const tour = element("a", "farm-button", "Free walkthrough");
      tour.href = new URL(`../farm/tour.html?property=${encodeURIComponent(property.id)}`, import.meta.url).toString();
      copy.append(tour, button); card.append(image, copy); body.append(card);
    }
  }
  async function buy(id: string): Promise<void> {
    if (busy || !deps.canBuy) return;
    busy = true; status.textContent = "Preparing your new home..."; draw();
    try {
      if (id !== "meadow" && !owned.has(id)) {
        const result = await deps.purchase(id);
        if (!result?.ok) { status.textContent = result?.error === "insufficient_tickets" ? "You need more tickets for this property." : "The purchase did not go through. Try again."; return; }
        owned.add(id);
        if (Number.isSafeInteger(result.balance)) deps.takeBalance(result.balance);
      }
      const moved = await deps.selectProperty(id);
      if (moved.error === "trade_in_progress") { status.textContent = "Finish or cancel your current trade before switching farms."; return; }
      if (moved.error === "farm_property_changed") { status.textContent = "Your active farm changed in another tab. Reload the market before switching."; return; }
      status.textContent = moved.ok ? "This farm is ready. Take the farm road home to see it. Your other farms are saved." : "The farm could not be selected. Reopen the Property Office and retry; owned properties never charge twice.";
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
