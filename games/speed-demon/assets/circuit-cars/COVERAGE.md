# Canonical circuit-car coverage

Coverage means the model has accepted north/south art plus one coherent lateral
half-turn, a compiled transparent `512x64` runtime sheet, and a manifest. The
opposite NE/E/SE views are mirrored from NW/W/SW so generated art cannot switch
vehicle bodies between headings. The authoritative model inventory is
`canonical-roster.json`; the runtime-ready subset is `catalog.json`.

**Current verified coverage: 6 / 24 cars (25%). Six canonical archetypes have
at least one runtime-ready representative. Incomplete or mislabeled turntables
remain unavailable until replacement art passes the heading and body-continuity
audit.**

## Models A

### 2026-09-10 inspection in progress

The full-roster stripe viewer now shows all 24 entries and exports a PNG. Missing
atlases are explicitly marked unavailable. Saved positive/negative stripe curves
are regression-tested on every available model and all eight headings. Lateral
stripe guides now mirror with the repaired artwork.
Both enlarged previews and the exported contact sheet use the race renderer's
per-heading and per-model size normalization. Raw 64px atlas cells must not be
used as visual evidence of in-race size. Every new model must retain consistent
apparent size through all eight turns; the full-roster size audit remains part
of acceptance, alongside physical nose direction and stripe flow.

Coverage remains 6/24. The Shutter Z source draft has an opaque checkerboard and
has not been admitted to the runtime catalog. The visual audit is not complete:
Tsunami's North/South views both appear to show rear lamps, and Chrono's cardinal
views need another physical-nose audit. Passing structural asset tests alone is
not a visual sign-off.

- [x] `kaido-gts` — Kaido GTS — GT — row 1, column 1
- [x] `tsunami-rz` — Tsunami RZ — coupe — row 1, column 2
- [ ] `shutter-z` — Shutter Z — coupe — row 1, column 3
- [ ] `meridian-rs` — Meridian RS — Euro — row 1, column 4 — quarantined: missing SE/S/SW views
- [ ] `monolith-8` — Monolith 8 — wedge — row 2, column 1
- [ ] `zephyr-z` — Zephyr Z — coupe — row 2, column 2
- [ ] `stallion-gt` — Stallion GT — muscle — row 2, column 3
- [ ] `aero-rs` — Aero RS — Euro — row 2, column 4
- [ ] `skyward-r` — Skyward R — GT — row 3, column 1 — quarantined: six frames use opposite headings
- [ ] `gravel-stx` — Gravel STx — GT — row 3, column 2
- [x] `toro-sv` — Toro SV — exotic — row 3, column 3
- [x] `scalpel-r` — Scalpel R — hatch — row 3, column 4

## Models B

- [x] `chrono-12` — Chrono 12 — wedge — row 1, column 1
- [ ] `orbit-rz` — Orbit RZ — coupe — row 1, column 2
- [ ] `vega-qv` — Vega QV — exotic — row 1, column 3
- [ ] `crest-s` — Crest S — Euro — row 1, column 4
- [ ] `titan-r` — Titan R — GT — row 2, column 1
- [ ] `cyclone-rz` — Cyclone RZ — coupe — row 2, column 2
- [x] `colt-gt` — Colt GT — muscle — row 2, column 3
- [ ] `ember-rs` — Ember RS — hatch — row 2, column 4
- [ ] `halo-lt` — Halo LT — exotic — row 3, column 1
- [ ] `vortex-fd` — Vortex FD — coupe — row 3, column 2
- [ ] `kaido-r` — Kaido R — GT — row 3, column 3
- [ ] `crest-turbo` — Crest Turbo — Euro — row 3, column 4

## Archetype coverage

| Archetype | Ready | Canonical total |
| --- | ---: | ---: |
| GT | 1 | 5 |
| Coupe | 1 | 6 |
| Euro | 0 | 4 |
| Wedge | 1 | 2 |
| Muscle | 1 | 2 |
| Exotic | 1 | 3 |
| Hatch | 1 | 2 |
