// Ticket shops share one wallet and one atomic purchase path. Each platform
// surface registers only its authoritative item catalog here; Arcade Room is
// first, and Farm can join without adding another debit implementation.
import { ARCADE_ROOM_GAME_SLUG, ARCADE_ROOM_TICKET_ITEMS, findArcadeRoomTicketItem } from "./arcade-room-ticket-catalog.mjs";
import { FARM_GAME_SLUG, FARM_TICKET_ITEMS, findFarmTicketItem } from "./farm-ticket-catalog.mjs";
const shops = Object.freeze({
    [ARCADE_ROOM_GAME_SLUG]: Object.freeze({
        slug: ARCADE_ROOM_GAME_SLUG,
        entitlementGameSlug: ARCADE_ROOM_GAME_SLUG,
        items: ARCADE_ROOM_TICKET_ITEMS,
        findItem: findArcadeRoomTicketItem,
    }),
    [FARM_GAME_SLUG]: Object.freeze({
        slug: FARM_GAME_SLUG,
        entitlementGameSlug: FARM_GAME_SLUG,
        items: FARM_TICKET_ITEMS,
        findItem: findFarmTicketItem,
    }),
});
export function findTicketShop(rawSlug) {
    const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
    return shops[slug] ?? null;
}
