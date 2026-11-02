# Orchard Isle

Implemented 2026-11-02. Deploy the frontend and API together. Migration
`061-farm-regional-markets.sql` is registered in the API startup roster; it adds
a region to exchange listings, leaving all existing listings on the mainland.
No existing farms, animals, escrow or balances are reset.

## The connected world

Walk from the Cove's southeast opening to Mainland Harbor. At the ferry sign
beside the pier, E crosses to Orchard Isle for free. Alternatively board the
loan boat, row to the marked northern sea route and press E to cross. Crossings
arrive on the destination pier, on foot, beside a moored boat. There is always
a free return ferry and a recovery action to the current harbor.

Orchard Harbor is a public settlement with whitewashed houses, terracotta
roofs, orchard trees, coastal paths, a fishing pier and open boat-fishing water.
Walk straight inland to Orchard Market; the east lane leads to homesteads.
E at the homestead entrance opens your island farm if you own one, selecting
it through the existing server command. Unowned access directs you to the
Property Office. Visitors returning from a resident farm retain that farm's
public visit address. A crossing between regions ends a private farm visit.

The resident board beside the village road lists island property owners,
including offline owners. Its paginated public API returns only owner identity,
profile name and property ID. Visits use the existing read-only farm route,
with `property=lot.orchard`. Property co-presence and chat use the farm's
existing owner/property room; selection does not change the owner's active farm.

## Working homesteads and markets

Orchard Isle Homestead costs 35,000 tickets and provides a separate 40 × 40 m
working farm. This is the normal farm game: buildings, crops, livestock, pets,
trees, crafting and independent saves. Orchard scenery and an offshore coastal
backdrop locate it on the island. Original farms stay intact. The homestead
can also be selected as the default platform entry.

Orchard Market uses the normal market game, with local keepers, warm paving,
orchard planting, lavender gardens, a local Property Office and separate public
presence/chat. Seed stock shows crops suitable for the region. Pepper and
lavender have their own four-stage generated GLBs, seeds, growth rules, yields,
graded produce, harvest rewards and sale values. Only Orchard Isle soil admits
these crops, checked by both the planting controller and server save rules.
Mainland starter seed draws exclude island specialties.

The island exchange is region-scoped. Listing region comes from the seller's
server-held active property; buyers and withdrawals must use a farm in that
region. Browsing accepts a validated region ID. Existing daily account caps,
price bands, escrow and ticket transactions are retained across regions.
NPC price formulas and order boards remain shared; this release does not add
profitable regional NPC arbitrage. Market goods are taken from the active
property's local inventory, which the market names. Select a local farm at the
Property Office before transacting. The mainland road selects a mainland home
when the currently active farm belongs to the island.

## Current boundaries

This release opens one additional inhabited region. The former cosmetic trial
islands are removed. Harbor waters use the existing reef/deep fish and normal
account tackle and creel; the island does not yet have exclusive fish species,
riding downs, resident quests or regional recipes. Local keepers use existing
avatar models. Boats are still loan boats without purchases, persistent poses,
passengers or synchronized boat movement. Travel is a destination scene load;
there is no long empty ocean crossing or cargo simulation.

Region URLs choose a public place, not server-verified geographic presence.
Ownership, planting, inventories and exchange region restrictions are checked
on the server. Presence messages do not grant ownership or fishing rewards.

## Validation

Both TypeScript builds and emitted-module checks; farm/API regression suites;
finite GLB geometry checks; ownership and independent-save round trips; server
rejection of wrong-region seeds and crops; exchange SQL scoping; public resident
pagination. Browser coverage walks from a ferry arrival to the actual market,
buys a separate homestead against an intercepted test account, walks to its
entrance and loads the real farm, then reads the resident board. Existing harbor
coverage verifies boarding, bow-first movement, disembarking, anchoring and fishing.
