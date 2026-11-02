# Independent farms on owned properties

Implemented locally on 2026-11-01. Requires matching frontend/API deployment;
API startup applies migration `060-farm-properties.sql` before serving requests.

## Player behavior

The Property Office in the Market switches between Meadow Farm (28 × 28 m),
Cedar Hollow (40 × 40 m), Sunwater Estate (56 × 56 m), and Orchard Isle Homestead (40 × 40 m).
The island Property Office sells island homes; the mainland office sells
mainland homes. See [FARM_ISLANDS.md](FARM_ISLANDS.md). Buying a property
unlocks a separate farm and selects it. Returning to an owned property is free,
including switching from a larger property to a smaller one.

Each property also has a **Set as default farm** button. This account preference
controls fresh entries from the platform Farm link; switching properties does
not change it. Returns marked `from=market`, `from=downs`, or a fishing area
retain the current farm. Visits and mounted travel also retain their explicit
context. Existing players initially default to their current farm.

Each farm retains its buildings, decor, pets/horses, livestock, crops, trees,
inventory, settings, memorials, and farm/offline clocks. Tickets, permanent shop
unlocks, skills and fishing records/equipment/creel remain account-wide.
New farms start with the standard buildings and expanded boundary, empty paid
inventory, and no additional starter dog. They are ready to use without repeating
onboarding. Goods and animals are not automatically transported between farms.

An old upgraded farm stays on its existing property with its contents intact.
Selecting another previously uninitialized property creates a fresh farm. The
old replacement system did not archive earlier farms, so there is no previous
meadow arrangement to reconstruct for players who already relocated.

Visitors can choose between initialized farms from the property picker. A
specific visit uses `/farm/?id=<playerId>&property=<propertyId>`; choosing it
does not change the owner's active farm. Legacy links show the active farm.

## Storage and trust boundary

The existing `game_loadouts` farm row remains the canonical document. Its top
level is the active farm, keeping existing economy services on their established
interface. `properties` contains bounded, non-nested inactive farm snapshots,
keyed by `meadow`, `lot.smallholding`, `lot.estate`, or `lot.orchard`. These are one-per-template
properties; multiple instances of the same template are not supported yet.

An authenticated `PUT /games/farm/garage` with
`{ "garage": { "selectProperty": "lot.estate", "propertyRevision": 0 } }`
selects under the same row lock as saves. The server checks ownership, archives
the current farm, restores or initializes the destination, carries forward the
current shared skills, and increments `propertyRevision`. Ordinary layout saves
cannot edit inactive farms, change properties, or forge shared progression.
The browser keeps only the active layout. Stale generations are refused even
after switching away and back, including submitted harvest/care layouts.

Switching refuses while a live player trade is pending, serialized with trade
invitations so an existing offer cannot silently use another farm's inventory.
The market reloads after selection to refresh all stock, herd and travel state.

Livestock rows carry `property_id`; migration assigns existing animals to their
owner's existing farm. Reads, capacity checks, breeding, purchases, renames and
exchange transfers use that property. Acquired/traded animals land on the
receiver's active farm. Independent property clocks preserve their previous
verification window for bounded offline catch-up when revisited.

## Next

Add island region metadata and property templates before enforcing regional crop
rules. Unique island crops are planned, not shipped here. Crop availability and
planting restrictions must be validated by the API as well as the inventory UI.
Boating scope lives in `FARM_BOATING_AND_REGIONS_SCOPE.md`.

Validation: shared browser/API TypeScript builds; API test suite; farm frontend
tests; browser Property Office retry/switch behavior and livestock housing.
Database migration still needs deployment verification against PostgreSQL.
