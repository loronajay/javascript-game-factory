# Mainland and Orchard Harbors

The harbor uses the same walking, fishing, tackle, creel and social page stack as
the Cove. Walk through the signed opening in the Cove's southeast wall, beyond
the shops, to take the coast path. The return path is behind the mainland pier.

- Arrive on foot. Walk down the pier, approach the boat, and press E to board.
- W/S row forward/reverse; A/D steer; hold Shift to brake.
- At a slow approach to either region's harbor, press E to disembark.
  You stand on the actual pier and can walk onto land. The boat stays moored.
- F drops or raises the anchor. While anchored, look toward water and use Space
  to cast, strike, reel and net through the normal fishing minigame.
- Signed-in catches use the existing server cast/landing endpoints and land in
  the account creel, with the usual tackle, bait, level and capacity checks.
  Signed-out fishing remains practice. R changes rods; Q changes bait; C opens
  the creel. F opens Fishdex while on foot; its toolbar button is always available.
- The recovery button returns you to the mainland pier on foot. Reloads start
  safely in the current harbor. Boat ownership and persistent voyage positions are not yet
  implemented; each session currently uses a local loan boat.

The GLB's pointed bow faces +z. Rendering rotates it by PI so the bow matches
movement's -z forward convention. A regression checks the actual asset geometry.

Harbor geometry is shared between walking, full-hull boat clearance and casting.
The API validates harbor water, piers, island shorelines, and reef/deep zones
against its matching catalog. This uses existing fish species and progression.
Harbor fishing does not introduce another reward or inventory system.

Orchard Isle is now a real connected destination. Take the free ferry beside the
pier or sail north to the marked sea route and press E. Arrive at Orchard Harbor,
walk to its market or homestead entrance, and use the resident board to visit
island farms. The cosmetic trial islands have been removed. See
[FARM_ISLANDS.md](../FARM_ISLANDS.md) for property, crop, market and travel details.

Validation covers the actual walking, boarding, disembarking and fishing loop,
and a browser journey from the ferry through the island market, property
purchase, homestead entrance and resident board. Geometry and API rules agree.
