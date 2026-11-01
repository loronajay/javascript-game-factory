# Mainland Harbor

The harbor uses the same walking, fishing, tackle, creel and social page stack as
the Cove. Walk through the signed opening in the Cove's southeast wall, beyond
the shops, to take the coast path. The return path is behind the mainland pier.

- Arrive on foot. Walk down the pier, approach the boat, and press E to board.
- W/S row forward/reverse; A/D steer; hold Shift to brake.
- At a slow approach to Mainland Harbor or Gull Landing, press E to disembark.
  You stand on the actual pier and can walk onto land. The boat stays moored.
- F drops or raises the anchor. While anchored, look toward water and use Space
  to cast, strike, reel and net through the normal fishing minigame.
- Signed-in catches use the existing server cast/landing endpoints and land in
  the account creel, with the usual tackle, bait, level and capacity checks.
  Signed-out fishing remains practice. R changes rods; Q changes bait; C opens
  the creel. F opens Fishdex while on foot; its toolbar button is always available.
- The recovery button returns you to the mainland pier on foot. Reloads start
  on the mainland. Boat ownership and persistent voyage positions are not yet
  implemented; each session currently uses a local loan boat.

The GLB's pointed bow faces +z. Rendering rotates it by PI so the bow matches
movement's -z forward convention. A regression checks the actual asset geometry.

Harbor geometry is shared between walking, full-hull boat clearance and casting.
The API validates harbor water, piers, island shorelines, and reef/deep zones
against its matching catalog. This uses existing fish species and progression.
Harbor fishing does not introduce another reward or inventory system.

Regional crop foundations remain in js/farm-regions.mts and the API region
catalog. Existing properties and crops remain on the mainland; new island homes,
regional crop species, routes, boat ownership, passengers and synchronized boat
presence are separate follow-up work.

Validation includes an actual browser walk from the Cove to the harbor, boarding,
disembarking and walking away, rowing bow-first, anchoring and casting, recovery,
and walking back to the Cove with property context preserved. Pure tests cover
walkable approaches at both landings, the real bow orientation, hull collision,
and matching browser/API fishing geometry.
