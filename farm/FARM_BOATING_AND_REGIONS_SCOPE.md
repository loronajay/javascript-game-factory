# Boating, islands, and regional homesteads

Original proposal: 2026-11-01. Orchard Isle implementation: 2026-11-02.
See [FARM_ISLANDS.md](FARM_ISLANDS.md) for shipped travel, homesteads,
regional crops, market and resident-directory behavior. The remaining sections
retain the broader plan, including work beyond this first inhabited island.

Follow-up: independent properties were implemented locally first at the user's
request. See `FARM_PROPERTIES.md` for actual behavior and deployment requirements.
Its local inventories differ from this proposal's account-wide carried goods;
transport between properties remains a future design decision. Orchard Isle travel, a regional market and two island crop species are implemented. Mainland Harbor is
implemented at `/farm/harbor/`, reached by walking the
southeast coast path from the Cove. It now uses the Cove walking/fishing stack:
board at a pier, row, anchor to fish into the existing creel, disembark to walk
on land, and walk back to the Cove. See `harbor/README.md` for current controls
and limits. Boat ownership and inter-region travel are still pending.

## Product direction

Grow the farm into a world people live in: sail to a distinct region, discover its
activities and community, buy a home there, and invite other players to visit.
Boats connect that world and provide fishing and exploration along the way.

The core loop is:

**Home → harbor → voyage → regional settlement → activities / market / friends → home.**

Build an archipelago of connected, separately loaded places. A continuous ocean
and seamless continent are not prerequisites for a world that feels connected.
Preserve physical departures, consistent arrival points, visible destinations,
and regional identity across those transitions.

All names, prices, boat specifications, and unlocks below are proposals.

## Baseline when scoped (before implementation)

- `js/farm-catalog/lots.mts`: Cedar Hollow and Sunwater Estate are farm upgrades.
  Their descriptions explicitly move existing buildings, animals, and crops.
- `js/farm-layout.mts`: a farm layout has one optional `lot`; this is not an
  ownership collection of independently saved properties.
- `js/farm.mts`: visits use `?id=<playerId>`; travel carries farm and horse
  context between pages. Property routes demonstrate save-before-departure,
  including staying in place when that save fails.
- `js/farm-market.mts`: the market already uses shared presence and chat.
- `js/farm-fishing-regions.mts`: named fishing regions, level requirements,
  property-specific access, spawn points, and exits already exist.
- `planning-docs/FARM_FISHING_PLAN.md`: boating is a deferred fishing expansion;
  `farm/assets/fishing/boat.glb` is available as an art starting point. Its
  suitability for boarding, seats, and animation still needs inspection.

These are useful seams, not evidence that multi-property persistence, regional
economies, or synchronized boats already exist.

## World structure

Each region has a stable ID and a small set of linked places:

| Place | Purpose |
| --- | --- |
| Harbor / settlement | Shared arrival, boat access, local services and social meeting point |
| Market | Regional goods, orders and player listings; can share the settlement scene |
| Commons | Public activity area: downs, woods, coast, trail or another local specialty |
| Fishing waters | Distinct species, conditions and discovery |
| Player properties | Separate persistent homes reached through a resident directory and entrances |

Use individually owned property instances first. Multiple people can buy the
same property template; nobody loses access because someone else bought the
last waterfront lot. A shared neighborhood with physically assigned parcels is
a later product with substantially different land and concurrency requirements.

Properties should feel located: regional surroundings, an entrance back to the
local settlement, a home-region badge, and a resident directory. A directory
should make both online neighbors and visitable offline homes discoverable,
subject to visit permissions. Avoid scattering early players across many empty
markets: launch one additional region and keep a central social destination.

## First complete release

One starter harbor, one nearby island, one personal boat class, one island
property template, one local market, one distinctive public activity, and a
small set of regional fish and goods. The island must be worth visiting before
buying property or a boat.

Suggested identity: an orchard island with sheltered fishing waters and a
coastal riding trail. Reuse farming and riding mechanics with a new setting;
do not make an entirely new profession a dependency of boating.

### Boat experience

- At a dock, summon or select your owned boat, board with an interaction, and
  switch to a readable third-person steering camera.
- Simple acceleration, turning, braking/reversing and gentle bobbing. Favor
  comfortable handling over realistic sailing or buoyancy simulation.
- Drive within a bounded coastal water scene with collision against banks,
  piers and shallows. Mark valid moorings; disembark only at safe landings.
- Stop and anchor to fish at boat-accessible locations. Leaving the helm must
  stop propulsion; fishing and steering cannot run simultaneously.
- At a marked sea route, choose a destination and confirm departure. A short
  voyage transition loads the destination harbor; do not require long empty
  crossings on every visit.
- Personal boats first: one driver, no multiplayer passengers. Publish remote
  boat appearance and pose only after transport protocol support is verified.
- A public ferry provides travel before boat ownership and a dependable return
  route. Boat ownership adds freedom and fishing access rather than being the
  only way to reach friends.
- No fuel, sinking, cargo loss, repairs, wind simulation, or mandatory upkeep
  in the first release. Upgrades can later improve handling, appearance, seats
  and access to farther routes.

Provide a return-to-harbor recovery action. Reloads and disconnects must yield a
safe dock or a validated boat position, with no stranded character. Departure
must preserve pending progress and retain the source scene on save failure.

### Property experience

- Purchase the island property without replacing the original farm.
- Keep independent buildings, crops, animals, decor and local production state.
- Choose a primary home and visit any owned property; retain existing farm
  links by resolving them to the migrated original property.
- Other players can visit a specific property, including while its owner is
  offline, according to existing and future visit policy.
- Start with read-only visits and shared social presence. Cooperative farming,
  guest building permissions, rentals and property sales are separate features.
- Do not permit an animal, placed object, or productive plot to exist at two
  properties. Defer arbitrary transfers until a server-validated move exists.

### Regional market experience

Share account identity, wallet and skill progression. For the first release,
keep carried goods account-wide as well; boats do not have cargo inventories.
Property production and placed contents stay local.

Regional markets have local NPC offers, requests and specialty stock. Player
listings belong to a region and are collected there. Permit browsing other
regions with their location clearly shown; require local presence to transact
if this restriction is supported by server-validated travel state.

Regional identity should come primarily from different supply and activities.
With account-wide goods and quick travel, unlimited fixed-price regional NPC
buy/sell differences would create an easy currency loop. Use limited demand,
bounded orders and checked price relationships before introducing arbitrage.
Physical cargo and hauling contracts can become a later economy expansion.

## Technical foundations

The exact schema and endpoints require an implementation pass. Establish these
boundaries before producing several island scenes:

1. **Region catalog:** stable region, place, harbor, route and spawn IDs. Route
   permissions are checked by the server wherever they gate rewards or access.
2. **Property ownership:** property ID, owner, region, template and independent
   layout/version. `lot` continues to describe a property template or upgrade;
   it must not double as the instance ID.
3. **Account versus property state:** wallet, skills and carried inventory are
   account-owned; placed entities and production belong to one property. Audit
   current layout-owned skills, clocks, care, inventory and harvest assumptions
   before migrating. Visiting and switching properties must not grant duplicate
   progression or apply offline growth twice.
4. **Migration:** preserve every existing farm as an original property with its
   current lot and contents. Make migration idempotent; preserve legacy links,
   device-only behavior, and existing account saves. New permanent purchases
   require an account. Rehearse migration and recovery against saved fixtures.
5. **Travel context:** distinguish the acting player, viewed property owner,
   origin property, destination region/place, and chosen boat. Visiting a
   friend's farm must never make their wallet, boats or private access yours.
   URLs identify destinations; they do not authorize ownership or rewards.
6. **Boat ownership and movement:** persistent owner/boat identity, server-side
   purchase validation, exclusive driver, safe dock persistence, movement
   bounds, and explicit boarding/anchoring/docking states. Cosmetic presence
   messages do not establish ownership, arrival, or fishing eligibility.
7. **Presence:** public region/place rooms and private property-instance rooms.
   Audit the network service's actual room validation, payload limits and
   capacity before adopting any proposed key format or boat pose extension.
8. **Economy:** region-scoped listings/orders, transactional purchases, and
   server validation of property, region and fishing location wherever needed.
   Prevent replayed arrival/purchase requests from creating duplicate assets.

Shared-world visibility is a separate requirement from owner-only editing:
verify property co-presence explicitly rather than assuming a read-only visit
already supplies a multiplayer neighborhood.

## Delivery sequence and acceptance gates

| Slice | Deliverable | Proof before moving on |
| --- | --- | --- |
| 1. Coastal boat prototype | One local boat, steering, docking, anchoring and fishing | Comfortable controls; no shore clipping or unsafe dismounts; recovery works |
| 2. World and property foundation | Region catalog, independent properties, migration, travel identity | Existing saves survive; two homes retain distinct contents; legacy visits work |
| 3. First island by ferry | Harbor, local market, one activity, property purchase, residents and visits | Two accounts meet and visit; original home remains intact; offline progress applies once |
| 4. Owned boats connect the world | Boat purchase, coastal exploration and harbor-to-harbor travel | Boat/ferry round trip preserves goods and progress; failed saves/disconnects recover safely |
| 5. Expand from evidence | Another region, boat variants and optional passengers | First region has enough activity; add only the systems actual play demonstrates a need for |

The prototype is an isolated mechanical proof; do not ship it as the complete
world expansion. The first complete release combines slices 1–4.

Passenger boats require their own scope: invitations, seat assignment, captain
authority, synchronized departure/arrival, passenger disconnects and captain
loss. They are a natural next social feature after solo travel is dependable.

## Decisions to revisit before implementation

- Is the first extra property a full second productive farm or a smaller island
  homestead? Recommendation: a modest productive homestead, using existing rules.
- Should residence provide mechanical bonuses? Recommendation: regional access
  and identity first; avoid making one home objectively best.
- How much sailing should be repeatable? Recommendation: freely driven coastal
  exploration plus short route transitions; tune from the prototype.
- Can horses travel? Recommendation: ferry/boat travel on foot first, with clear
  handling of a mounted departure; horse transport follows as a scoped addition.
- Are neighborhoods physically shared? Recommendation: regional public spaces
  and instanced homes first; revisit shared parcels only if players want them.

Do not commit to a world-size or calendar estimate until the save/economy and
presence audits establish the migration and networking work involved.
