# Crown Pointe Cinema 6 — V3 full 3D review demo

V3 discards the broken V2 floor/stair architecture while retaining the actual Hide & Seek runtime.

## Run

Extract the ZIP and double-click:

    PLAY CROWN POINTE CINEMA V3.cmd

The launcher starts a localhost server on a free port and opens the map.

## Structural changes from V2

- No visible or usable elevator. Crown Pointe is stairs-only.
- Floor 1 is one continuous base slab. Auditorium tiers sit above it; they no longer replace missing pieces of the floor.
- Floor 2 is one continuous rectangular projection mezzanine slab. There are no cutouts or patchwork floor islands.
- Two independent straight projection stairs sit south of the mezzanine and end directly at openings in its south wall.
- The stairs do not require holes in Floor 2.
- Both stair runs have ceiling clearance and open top exits.
- Projection booths now extend to the actual mezzanine edge, so their viewing windows overlook the auditoriums instead of opening onto a useless exterior strip.
- Solid wall segments close the mezzanine edge between booths so the player cannot walk into a void.
- Six large cinema screens remain, with increased screen size.
- Theater sound-locks, tiered seating, center aisles, service exits, and projection rooms remain part of the playable layout.

## Automated V3 QA

The test verifies:
- one and only one base slab on Floor 1
- one and only one base slab on Floor 2
- no representative floor holes across either level
- zero elevator hall doors
- zero elevator call buttons
- both physical stair runs bottom-to-top
- both stair entrances and top exits
- all six theater entrances
- every sound-lock route
- all six emergency/service exits
- all six center aisles
- all six screens
- projection corridor and all six booth centers
- no coplanar floor-slab overlaps
- no cross-floor navigation edges
- same-floor navigation connectivity

The browser/WebGL smoke test could not run in this container because its Chromium installation cannot initialize EGL/ANGLE. The plan-level collision, floor, stair, door, room, and navigation tests pass locally under Node.
