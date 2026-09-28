// The Market Square's Sawmill stall, on the page: Bram saws logs into planks
// for a ticket a log (the same counter a farm's own Sawmill has, with its fee
// shown), and buys furniture off the player's shelf. Kept out of the market's
// composition root (farm-market.mts) so the square only asks it to open, and
// whether a panel of it is up.
//
// Money is never decided here. A mill names a species and a count and the
// server takes the logs, the fee and pays the planks and the Carpentry XP
// (`POST /games/farm/workshop/mills`, `at: "market"`); a sale names pieces and
// counts and the server checks them against the shelf — owned minus placed —
// prices them and pays (`POST /games/farm/market/sales`). The square reads
// the farm as STORED: the farm saved itself before the gate let the player out.

import { MARKET_MILL_FEE_PER_LOG } from "./farm-catalog/carpentry.mjs";
import { createMillPanel } from "./farm-mill-panel.mjs";
import { createMarketSalePanel, type SaleOutcome } from "./farm-market-panel.mjs";
import { SELLABLE_FURNITURE } from "./farm-market-prices.mjs";
import { furnitureShelf } from "./farm-workshop.mjs";
import { millOutcome } from "./farm-workshop-controller.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

type Thumbnail = (key: string, onReady: (url: string) => void) => string | null;

export type MarketSawmillDeps = Readonly<{
  ticketClient: Readonly<{
    millFarmLogs: (layout: unknown, speciesId: string, logs: number, at: "market" | "farm", millId: string) => Promise<any>;
    sellFarmProduce: (items: Record<string, number>, saleId: string) => Promise<any>;
  }>;
  /** The player's farm as the page last had it from the server. */
  farm: () => FarmLayout;
  /** Adopt a farm the server answered with. */
  takeStock: (layout: unknown) => unknown;
  takeBalance: (balance: unknown) => void;
  keeperSays: (text: string) => void;
  onAchievements: (achievements: readonly unknown[]) => void;
  thumbnail?: Thumbnail;
  onClose: () => void;
}>;

export type MarketSawmill = Readonly<{
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  /** What the player is doing here, for the presence line. */
  activity: () => string;
}>;

function actionId(kind: string): string {
  return `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Market Square is missing ${selector}`);
  return element;
}

export function createMarketSawmill(deps: MarketSawmillDeps): MarketSawmill {
  const shelf = () => furnitureShelf(deps.farm().agriculture.inventory.furniture, deps.farm().decor);

  const millPanel = createMillPanel({
    root: required<HTMLElement>("#millPanel"),
    closeButton: required<HTMLButtonElement>("#closeMill"),
    list: required<HTMLElement>("#millList"),
    status: required<HTMLElement>("#millStatus"),
  }, {
    feePerLog: MARKET_MILL_FEE_PER_LOG,
    thumbnail: deps.thumbnail,
    emptyNote: "You have no logs. Fell a grown timber tree on your farm and bring the logs here.",
    mill: async (speciesId, logs) => {
      const result = await deps.ticketClient.millFarmLogs(undefined, speciesId, logs, "market", actionId("mill"));
      deps.takeStock(result?.layout);
      if (result?.ok) {
        deps.takeBalance(result.balance);
        deps.keeperSays("Straight and true. There's your planks.");
      }
      if (Array.isArray(result?.achievements) && result.achievements.length) deps.onAchievements(result.achievements);
      return millOutcome(result, deps.farm);
    },
    onClose: deps.onClose,
  });

  const saleMessages: Readonly<Record<string, string>> = Object.freeze({
    not_enough_furniture: "Some of that is standing on your farm, not on your shelf. Nothing was sold.",
    farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
    invalid_sale: "That sale did not add up. Nothing was sold.",
  });

  async function sell(items: Record<string, number>): Promise<SaleOutcome> {
    const result = await deps.ticketClient.sellFarmProduce(items, actionId("sale"));
    deps.takeStock(result?.layout);
    if (!result?.ok) {
      return { ok: false, message: saleMessages[result?.error] ?? "The sale did not go through. Nothing was sold — try again in a moment.", produce: shelf() };
    }
    deps.takeBalance(result.balance);
    deps.keeperSays("Fine work. That'll sell in town.");
    return { ok: true, message: `Sold for ${(Number(result.earned) || 0).toLocaleString()} tickets.`, produce: shelf() };
  }

  const furniturePanel = createMarketSalePanel({
    root: required<HTMLElement>("#furniturePanel"),
    closeButton: required<HTMLButtonElement>("#closeFurniture"),
    list: required<HTMLElement>("#furnitureList"),
    total: required<HTMLElement>("#furnitureTotal"),
    sellButton: required<HTMLButtonElement>("#sellFurniture"),
    pickAllButton: required<HTMLButtonElement>("#pickAllFurniture"),
    status: required<HTMLElement>("#furnitureStatus"),
  }, {
    sell,
    thumbnail: deps.thumbnail,
    sellable: SELLABLE_FURNITURE,
    emptyNote: "Nothing on your shelf. Make furniture at your farm's Carpenter's Workbench — pieces standing on the farm stay there.",
    onClose: deps.onClose,
  });

  // The mill's footer walks over to the furniture side of the counter.
  required<HTMLButtonElement>("#openFurnitureSale").addEventListener("click", () => {
    millPanel.close();
    furniturePanel.open(shelf());
  });

  return Object.freeze({
    open: () => millPanel.open(deps.farm().agriculture.inventory),
    close: () => { millPanel.close(); furniturePanel.close(); },
    isOpen: () => millPanel.isOpen() || furniturePanel.isOpen(),
    activity: () => (millPanel.isOpen() ? "at the Sawmill" : furniturePanel.isOpen() ? "selling furniture" : ""),
  });
}
