// Trading in the Market Square, on the page: the session that follows the
// table (farm-trade-session.mts) and the panel that draws it
// (farm-trade-panel.mts), assembled against the square's markup. Kept out of
// the market's composition root (farm-market.mts) like the Sawmill is, so the
// square only asks: is a table up, what does E/T/Y/N/Esc do, and what is the
// player doing for the presence line.
//
// Only an account farm can trade — the goods are the server's — so a
// signed-out visitor never polls and T on a person says why.

import { createTradeSession, type TradeApi } from "./farm-trade-session.mjs";
import { createTradePanel } from "./farm-trade-panel.mjs";
import { isLive, normalizeTradeAnimal, type TradeAnimal, type TradeFish } from "./farm-trade.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

type Thumbnail = (key: string, onReady: (url: string) => void) => string | null;

export type MarketTradingDeps = Readonly<{
  api: TradeApi;
  /** Whether this player's farm is an account farm the server can trade from. */
  canTrade: boolean;
  farm: () => FarmLayout;
  takeStock: (layout: unknown) => unknown;
  thumbnail?: Thumbnail;
  onClose: () => void;
  /** The Cove's reads, so fish can go on the table: the player's creel and any fish by id. */
  fishApi?: Readonly<{ fetchFarmFishing: () => Promise<any>; fetchFarmFishDetails: (ids: readonly string[]) => Promise<any> }> | null;
  /** The player's own herd as cards (the square already reads it for the Dealer and the Butcher), and any animal's card by id. */
  herd?: () => readonly TradeAnimal[];
  fetchAnimalCards?: (ids: readonly string[]) => Promise<any>;
  /** A trade that landed moved animals: the square reads the herd again. */
  onHerdChanged?: () => void;
}>;

export type MarketTrading = Readonly<{
  start: () => void;
  stop: () => void;
  /** Ask a person in the square to trade. Returns a line for the prompt when it cannot. */
  invite: (member: Readonly<{ playerId: string; displayName: string }>) => string;
  /** A table (live or just ended) is on screen and has the keyboard. */
  isOpen: () => boolean;
  escape: () => void;
  /** Y / N on a waiting invitation; false when there is none. */
  answer: (yes: boolean) => boolean;
  /** What the player is doing, for the presence line. */
  activity: () => string;
  /** The player's creel as last read (the Exchange Board lists from it too), with each fish's worth. */
  creel: () => readonly TradeFish[];
  /** Read the creel again (a fish went onto or came off the Exchange Board). */
  reloadCreel: () => Promise<void>;
}>;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Market Square is missing ${selector}`);
  return element;
}

export function createMarketTrading(deps: MarketTradingDeps): MarketTrading {
  let panel: ReturnType<typeof createTradePanel> | null = null;
  // Fish on the table: the player's own creel, and a cache of every fish seen by id (theirs and the partner's).
  let creel: readonly TradeFish[] = [];
  const known = new Map<string, TradeFish>();
  const asking = new Set<string>();
  const remember = (fish: any): TradeFish | null => {
    if (!fish || typeof fish.id !== "string") return null;
    const entry = Object.freeze({ id: fish.id, speciesId: String(fish.speciesId), weightG: Number(fish.weightG) || 0, sizeClass: String(fish.sizeClass ?? "average"), variant: String(fish.variant ?? "normal"), locked: fish.locked === true, value: Number(fish.value) || 0 });
    known.set(entry.id, entry);
    return entry;
  };
  async function loadCreel(): Promise<void> {
    const answer = await deps.fishApi?.fetchFarmFishing().catch(() => null);
    if (!Array.isArray(answer?.creel)) return;
    creel = answer.creel.map(remember).filter((fish: TradeFish | null): fish is TradeFish => Boolean(fish));
    panel?.render();
  }
  // Animals on the partner's side: their public cards, read once each.
  const animals = new Map<string, TradeAnimal>();
  const askingAnimals = new Set<string>();
  const animalDetail = (id: string): TradeAnimal | null => deps.herd?.().find((animal) => animal.id === id) ?? animals.get(id) ?? null;
  function lookUpTheirAnimals(): void {
    const view = session.snapshot().view;
    const unknown = Object.keys(view?.them.offer.livestock ?? {}).filter((id) => !animalDetail(id) && !askingAnimals.has(id));
    if (!unknown.length || !deps.fetchAnimalCards) return;
    for (const id of unknown) askingAnimals.add(id);
    void deps.fetchAnimalCards(unknown).then((answer: any) => {
      for (const raw of Array.isArray(answer?.animals) ? answer.animals : []) {
        const animal = normalizeTradeAnimal(raw);
        if (animal) animals.set(animal.id, animal);
      }
      panel?.render();
    }).catch(() => undefined);
  }
  /** Fish on the partner's side the page has not seen yet: read them once, then draw them. */
  function lookUpTheirs(): void {
    lookUpTheirAnimals();
    const view = session.snapshot().view;
    const unknown = Object.keys(view?.them.offer.fish ?? {}).filter((id) => !known.has(id) && !asking.has(id));
    if (!unknown.length || !deps.fishApi) return;
    for (const id of unknown) asking.add(id);
    void deps.fishApi.fetchFarmFishDetails(unknown).then((answer: any) => {
      for (const fish of Array.isArray(answer?.fish) ? answer.fish : []) remember(fish);
      panel?.render();
    }).catch(() => undefined);
  }
  const session = createTradeSession({
    api: deps.api,
    timers: { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
    farm: deps.farm,
    // A trade that landed moved fish too: read the creel again.
    onLayout: (layout) => { deps.takeStock(layout); void loadCreel(); deps.onHerdChanged?.(); },
    onChange: () => { lookUpTheirs(); panel?.render(); },
    creel: () => creel,
    herd: () => deps.herd?.() ?? [],
  });
  panel = createTradePanel({
    invite: required<HTMLElement>("#tradeInvite"),
    inviteText: required<HTMLElement>("#tradeInviteText"),
    acceptButton: required<HTMLButtonElement>("#acceptTrade"),
    declineButton: required<HTMLButtonElement>("#declineTrade"),
    root: required<HTMLElement>("#tradePanel"),
    title: required<HTMLElement>("#tradeTitle"),
    closeButton: required<HTMLButtonElement>("#closeTrade"),
    yourState: required<HTMLElement>("#tradeYourState"),
    theirState: required<HTMLElement>("#tradeTheirState"),
    yourTitle: required<HTMLElement>("#tradeYourTitle"),
    theirTitle: required<HTMLElement>("#tradeTheirTitle"),
    stock: required<HTMLElement>("#tradeStock"),
    theirs: required<HTMLElement>("#tradeTheirs"),
    status: required<HTMLElement>("#tradeStatus"),
    lockButton: required<HTMLButtonElement>("#lockTrade"),
    confirmButton: required<HTMLButtonElement>("#confirmTrade"),
  }, { session, farm: deps.farm, thumbnail: deps.thumbnail, onClose: deps.onClose, creel: () => creel, fishDetail: (id) => known.get(id) ?? null, herd: () => deps.herd?.() ?? [], animalDetail });

  return Object.freeze({
    start: () => {
      if (!deps.canTrade) return;
      session.start();
      void loadCreel();
    },
    stop: () => session.stop(),
    invite(member): string {
      if (!deps.canTrade) return "Sign in to trade — only an account farm's goods can change hands.";
      if (!member.playerId) return `${member.displayName} can't trade — they aren't signed in.`;
      void session.invite(member.playerId, member.displayName);
      return "";
    },
    isOpen: () => panel!.isOpen(),
    escape: () => panel!.escape(),
    answer: (yes) => panel!.answer(yes),
    activity(): string {
      const view = session.snapshot().view;
      return view && isLive(view) ? "trading" : "";
    },
    creel: () => creel,
    reloadCreel: () => loadCreel(),
  });
}
