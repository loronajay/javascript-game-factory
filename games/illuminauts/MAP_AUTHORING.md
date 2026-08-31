# Authoring Illuminauts in 3D

## One layout, one shared facility builder

The runtime imports `MAPS` from `scripts/maps.js`. Each entry supplies `id`, `raw`, `hazards`, and `soloConfig`. Do not copy the Map 1 prototype or write another scene per map. The ASCII grid drives walls, floor panels, ceilings, collision, spawns, pickups, doors, and the beacon.

The reference in `3d-maps/map-01-reference/` is retained unchanged for comparison. Its bundled fallback and relative `.txt` fetch are not used in production. The runtime catalog has later layout changes and Sweep Data Cores that the old `.txt` files/reference may lack; do not bulk-import the old text files over the catalog.

| Symbol | Meaning |
|---|---|
| `#` | Solid wall |
| `.` | Walkable floor |
| `S`, `T` | Exactly one Alpha and Beta spawn |
| `A` | Access Chip |
| `P` | Battery / Power Cell (15-second light boost) |
| `D` | Chip-consuming Laser Door (not a timed hazard) |
| `B` | Beacon Core region, 25 tiles |
| `K` | Sweep Data Core |

All rows must have equal width, with an enclosed wall border. Current maps are 35×27; the builder does not hardcode those dimensions. Gameplay uses continuous tile coordinates `px/py`; the scene uses metres (`2.25` metres per tile). `map-3d.js` is the only conversion boundary. The camera is 1.58 metres high; there is no jumping or vertical gameplay in this pass.

## Add or edit a map

1. Use `map-editor-v2.html` or edit a `scripts/maps.js` entry. Keep unique map IDs and the existing object shape. The editor's playtest handoff now opens the production 3D game.
2. Author hazards in tile coordinates using the existing editor controls. Keep patrol routes contiguous and walkable, including their loop closure. Reverse the route to create a back-and-forth patrol.
3. Run `npm run validate:maps` and `npm test`. Validation models chip pickup and one-chip-per-door consumption, proving both starts can reach the beacon in Sprint and collect all cores before reaching it in Sweep. It does not prove hazard timing or competitive balance.
4. Open `?map=map-01` (substitute the ID) to start that map directly. Add `&side=beta` or `&mode=sweep` as needed. Also test via Solo Run and the normal map selector.
5. Check dark-suit navigation, battery visibility, door approaches, hazard telegraphs, and both spawns. New maps automatically appear in solo selection and online rotation.

## Hazards

`hazard-layout.js` clones authored definitions, trims beams at walls, and repairs stale patrol routes to their longest valid contiguous section. Broken open-ended routes become back-and-forth loops. A remaining single cell becomes a stationary creature; an entirely invalid route is omitted. The original definitions are never overwritten. `validate:maps` prints every patrol repair so the author can replace the stale path deliberately.

Some shipped maps had routes crossing walls; those repairs are active during the 3D migration. Wall-mounted turrets remain in their authored wall cells, with visible muzzles projected onto their facing surface. Closed Laser Doors stop turret beams. Laser floor washes mark the full dangerous cell. Amber means warning, bright red means active, dim blue means cooldown. Magenta chip doors remain visually distinct.

Patrol rendering and contact damage sample the same interpolated route pose. Timed hazards sample elapsed match time rather than advancing in the renderer. Models live in `scene-hazards.js`; replacing them with imported meshes later does not change collision or timing. The inspected `Desktop/3d-assets` library contains nature/animation assets, so this pass uses locally generated primitive models with no external model files.

## Presentation and suit light

An optional `world3d.theme` on a map entry can override integer hex colors for `wall`, `floor`, `ceiling`, and `accent`. No geometry changes are required. For example:

```js
world3d: { theme: { wall: 0x43575f, floor: 0x253840, ceiling: 0x25343b, accent: 0x76f4ff } },
```

`lighting.js` owns the weak reserve-charge and charged-battery profiles; `renderer-3d.js` owns low ambient fill, fog, and camera lights. Keep enough near-field floor/wall contrast to navigate without a battery. Do not add a minimap, full-map overlay, or remembered layout reveal to gameplay.

`tests/3d-preview.html` is a separate visual test bench with map, battery, and hazard-inspection buttons. It is not linked from the game and does not write scores or connect online. Use it to compare reserve/battery lighting and inspect models, not to prove gameplay.

## Ownership and performance

The scene reads gameplay state; it must never consume a pickup, open a door, advance a hazard, or mutate a player. Walls and repeated facility parts are instanced. Scene resources are built only when the map object changes and disposed on exit/restart. Pixel ratio is capped at 1.75. Three.js is in `vendor/` with its license; no CDN or bundler is required.

3D scores use `illuminauts_pb_3d_v1_{mode}_{mapId}`. Preserve the old 2D keys. Existing par times are withheld until 3D playtesting establishes comparable targets. The map proof and two-peer delayed-pose tests are not substitutes for a live two-device online race or device-specific performance testing.
