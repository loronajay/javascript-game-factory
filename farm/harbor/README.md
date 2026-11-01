# Mainland Harbor boat trial

First boating slice, 2026-11-01. Enter through **Harbor** on the main Cove toolbar
or open `/farm/harbor/`. This is a local trial with a borrowed boat; it does not
modify farm saves, tickets, ownership, inventory, or fishing records.

- E / Board: launch from the current dock; approach a marked mooring slowly
  and use E again to moor. Mainland Harbor and Gull Landing are usable.
- W/S or arrows: row forward / reverse; A/D: steer; Space: brake.
- R: drop or raise the anchor. Anchoring stops propulsion and movement.
- Drag the view to look around. Touch devices have steering buttons.
- Return to harbor resets safely to the mainland. Reloads also start moored.

The pure `js/farm-boating.mts` owns hull clearance, shallow water, piers, bounded
trial waters, docking, anchoring, speed limits and swept movement. The scene
uses the existing Quaternius `boat.glb`, fitted to a 4.4 m hull. The two nearby
islets are trial scenery, not the planned Orchard Isle region.

`js/farm-regions.mts` and the API's `services/farm-region-catalog.mts` establish
stable mainland and planned Orchard Isle identities. All existing properties
remain on the mainland. A crop may declare `regions`; planting checks the
property's region in the browser and the API refuses new crop rows outside the
declared regions. Existing stored plants are preserved. Existing crops retain
their current availability; no new crop species are released in this slice.

Next: build the first real island harbor/settlement and property template, add
its crops and seed stock, then connect validated inter-region travel and boat
ownership. Passenger boats, fish rewards from boats, open-sea sailing,
regional player listings and cargo remain outside this trial.

Validation covers frame-rate-independent handling, full hull collision,
anchoring, safe moorings, property/crop catalog parity, default-home entry,
browser rowing/recovery, loading the real GLB, and phone viewport layout.
