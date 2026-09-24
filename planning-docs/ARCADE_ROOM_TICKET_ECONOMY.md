# Arcade Room Ticket Economy v1

## Product rules

- A new wallet starts with 5,000 tickets.
- Purchases are permanent catalog unlocks, never per-placement consumables.
- Tint, text, image, scale, and length changes are free after an item is owned.
- Ordinary room dressing stays affordable; four-figure prices are reserved for attractions and statement pieces.
- The normal catalog is stable and visible. It does not rotate randomly.
- Achievement and event decor use durable entitlements but are not sold through the ticket shop.

## Starter collection

Every account owns the default floor, walls, ceiling, and trim plus:

- Neon Strip
- Your Words (Block)
- Your Picture
- Round Rug
- Ceiling Spot and Fluorescent Tube
- Bench, Bar Stool, Café Table, and Beanbag
- Jukebox, Potted Plant, and Trash Can
- Wall Clock, Shelf, and Exit Sign
- Ceiling Fan

The Jukebox remains starter-owned because music selection is room infrastructure, not a luxury prop.

## Price authority

The authoritative item roster and exact prices live in
`platform-api/src/services/arcade-room-ticket-catalog.mts`. The browser receives
prices from the authenticated ticket-shop endpoint and never submits a price.

The implemented tiers follow the approved economy:

| Tier | Typical content |
| --- | --- |
| 25–75 | architectural clutter and small utility props |
| 100–250 | common decor, posters, rugs, lights, and furniture |
| 300–600 | meaningful room upgrades and visual centerpieces |
| 650–1,200 | attractions and room-defining props |
| 1,500+ | reserved for future interactive or prestige content |

All game posters cost 50 tickets. Claw Machine costs 1,200 and Pinball Table
costs 1,100 because the current versions are room props, not playable cabinets.

## Platform architecture

Ticket spending is a shared platform capability, not an Arcade-only wallet path:

1. A surface registers a `TicketShopCatalog` by shop slug.
2. The client reads `GET /tickets/shops/:shopSlug` for balance, ownership, and authoritative prices.
3. The client buys with `POST /tickets/shops/:shopSlug/purchases` and sends only `itemId`.
4. One generic database transaction locks the wallet, checks ownership, debits the server price, grants the entitlement, and writes the ledger row.
5. The shop catalog selects the `game_entitlements.game_slug` used for durable ownership.

Arcade Room is the first registered shop. Farm should add its own catalog to the
same registry and reuse the wallet transaction and client API rather than adding
a Farm-specific spending route.

Room saves use the existing generic loadout ownership context. Starter ids are
always accepted; purchased ids require an `arcade-room` entitlement; unknown ids
are removed at the server boundary. Migration 052 grants entitlements for
non-starter content already present in saved rooms so enabling the economy does
not take away layouts built while the catalog was free.
