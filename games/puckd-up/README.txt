HISTORICAL VISUAL BASELINE — current run instructions and modular architecture
are documented in README.md. The notes below describe the pre-refactor v9 build.

PUCK'D UP // CABINET v9

BASELINE
- Visual-only iteration of v8/v7 approved gameplay.
- Critical gameplay/physics functions are unchanged from v7.
- 240 Hz fixed timestep, swept paddle collision, containment, scoring, 29 m/s puck cap,
  pointer lock, responsive v7 paddle tuning, menu flow, arena selection, color choice and trail retained.

VENUE REBUILD

HYPER ARCADE
- Added an actual neon light-tunnel composition instead of mostly dark box geometry.
- Bright cyan/magenta/purple/amber emissive floor frames.
- Arcade cabinet rows now have separate glowing screens and marquees.
- Added prize towers, rear neon light wall, ceiling strips, colored local lights and denser ambient particles.
- Fixed an emissive-animation bug that previously flattened bright authored materials down to a dim common value.

COMPETITION CIRCUIT
- Removed the intrusive overhead table-crossing truss composition.
- Rebuilt as an open stadium bowl with low side seating.
- Truss is now limited to vertical pylons and a rear gantry well behind the far goal.
- Broadcast/jumbotron wall is behind the opponent goal instead of above the playfield.
- Added perimeter LEDs, larger crowd field and high rear spotlights without putting fixtures in the gameplay sightline.

PARK JAM
- Retains the approved overall direction but adds stronger venue dressing.
- Gradient daylight sky dome and sun.
- Additional trees, murals, skatepark forms, benches and lamp posts.
- Expanded skyline and elevated transit structure for depth.

SKYLINE ROOFTOP
- Completely replaced the flat dark/grey backdrop.
- Added a deep-blue/purple gradient sky dome, visible moon, stars and atmospheric haze.
- Two-depth-layer city skyline instead of a single dark building wall.
- Instanced warm city windows add recognizable night-city detail in one draw call.
- Added low glass rooftop perimeter, architectural cyan/violet lighting, lounge structure, vents and antenna beacon.

PERFORMANCE / ARCHITECTURE
- Venue shells still contain zero Cannon physics bodies.
- Repeated venue props remain instanced where practical.
- Only the selected arena group is rendered.
- Venue animation now pulses relative to each material's authored emissive brightness.
- No gameplay simulation constants were changed.

VALIDATION
- JavaScript syntax: passed Node syntax check.
- Duplicate DOM IDs: none.
- Missing queried DOM IDs: none.
- Critical gameplay functions compared against v7: exact matches.
- Automated WebGL visual screenshots were not possible in the build container because external CDN module resolution is unavailable there.

RUN
Open index.html in Chrome or Edge.
The build loads Three.js and cannon-es from jsDelivr and therefore requires internet access at launch.
If file:// module loading is blocked:

    py -m http.server 8080

then open http://localhost:8080
