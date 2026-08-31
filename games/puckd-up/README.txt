TABLE HOCKEY // CABINET v7

BASELINE
- Direct iteration of approved v6.
- v6 pointer-lock lifecycle and corrected directional trail retained.
- v4-v6 physics, swept collision protection, table containment, goal capture,
  240 Hz fixed stepping, and 29 m/s puck ceiling retained.

INPUT TUNING
- Fullscreen pointer-lock sensitivity increased from 0.014 to 0.020 world units per mouse delta.
- Player mallet maximum tracking speed increased from 25.5 m/s to 38.0 m/s.
- Target-follow response now uses a fixed 22 ms response time instead of render-frame dt.
  This prevents paddle responsiveness from changing with 30/60/120+ Hz rendering.
- Keyboard movement increased from 10 to 12 world units/sec.
- Shot-power display now scales against the new mallet speed ceiling.

IMPORTANT
- Puck maximum speed remains 29 m/s.
- Collision, containment, scoring, CPU, trail, menu, and color systems were not retuned.

RUN
Open index.html in Chrome or Edge.

The build loads Three.js and cannon-es from jsDelivr, so internet access is required at launch.
If file:// module loading is blocked:

    py -m http.server 8080

Then open:

    http://localhost:8080
