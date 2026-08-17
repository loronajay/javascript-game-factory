# Canon character roster

| # | Character | Source PNG |
|---:|---|---|
| 01 | Daisy Monroe | `daisy-monroe.png` |
| 02 | Nia Brooks | `nia-brooks.png` |
| 03 | Tessa Quinn | `tessa-quinn.png` |
| 04 | Zuri Banks | `zuri-banks.png` |
| 05 | Amara Reed | `amara-reed.png` |
| 06 | Claire Rowan | `claire-rowan.png` |
| 07 | Lumi Vega | `lumi-vega.png` |
| 08 | Cassy Cruz | `cassy-cruz.png` |
| 09 | Fiona Vale | `fiona-vale.png` |
| 10 | Nyx Calder | `nyx-calder.png` |
| 11 | Skye Bennett | `skye-bennett.png` |
| 12 | Carmen Blaze | `carmen-blaze.png` |
| 13 | Piper Hart | `piper-hart.png` |
| 14 | Reina Sato | `reina-sato.png` |
| 15 | Imani Cole | `imani-cole.png` |
| 16 | Sabrina Wilde | `sabrina-wilde.png` |
| 17 | Aaliyah Storm | `aaliyah-storm.png` |
| 18 | Mina Park | `mina-park.png` |
| 19 | Scarlett Voss | `scarlett-voss.png` |
| 20 | Sage Holloway | `sage-holloway.png` |
| 21 | Hazel Ward | `hazel-ward.png` |
| 22 | Roxy Chen | `roxy-chen.png` |
| 23 | Naomi Okafor | `naomi-okafor.png` |
| 24 | Echo Sterling | `echo-sterling.png` |
| 25 | Kevya Desai | `kevya-desai.png` |
| 26 | Lillie Chen | `lillie-chen.png` |
| 27 | Marisol Cruz | `marisol-cruz.png` |
| 28 | Rei Nakamura | `rei-nakamura.png` |
| 29 | Simone Carter | `simone-carter.png` |
| 30 | Talia Dodson | `talia-dodson.png` |

Source PNGs live in `assets/characters/usable/canon/`. Each character's five cleaned WebP throw frames live in `assets/characters/processed/canon/<firstname-lastname>/`. When a source originally had a UUID filename, that UUID remains in `animation-core.js` as `legacyId` provenance.

Front-facing selection portraits are extracted from pose zero into `assets/characters/portraits/canon/`. Throw frames remain rear-facing because they are rendered from the bowler's lane perspective.

Protected hand-edited fourth-throw frames live in `assets/characters/manual-overrides/canon/<firstname-lastname>/throw-04.png`. The extractor automatically reapplies them after every rebuild.

Characters removed from canon are archived under `assets/characters/not-usable/removed-canon/` so their source and derived artwork cannot be reintroduced by the extractor.

## Skin package convention

Every alternate outfit is a self-contained package at `assets/characters/skins/<character-slug>/<skin-id>/`. A package contains the original six-pose `source.png`, optimized `portrait.webp`, and `throw-01.webp` through `throw-05.webp`.

To add another collection, make a folder such as `assets/characters/skins/daisy-monroe/winter/`, drop the lineup in as `source.png`, add the collection id and display name to `AVAILABLE_SKINS` in `animation-core.js`, then run:

```powershell
.\.venv\Scripts\python.exe tools\process_character_skins.py --only winter
```

Use `--only daisy-monroe/winter` to rebuild one package. QA contact sheets and the extraction report are written under `tmp/skin-qa/`. Equipped outfits are stored per bowler on the device and copied into each match's player state.

## Full asset audit

Run the deterministic image audit after adding or rebuilding character art:

```powershell
.\.venv\Scripts\python.exe tools\audit_character_assets.py
```

It checks every canon and alternate portrait, result pose, throw frame, and six-pose source for missing files, invalid dimensions or alpha, clipped silhouettes, detached pose debris, large transparency punch-through, and occupied pose gutters. It also writes the complete labeled review atlases and JSON report under `tmp/character-asset-audit/`. Reviewed intentional detached details are bounded by pixel budgets, so larger future contamination still fails review.

Legacy or edited packages should be finalized with `tools/repack_skin_source.py`; it rebuilds `source.png` from the approved runtime sprites with true alpha and protected per-pose gutters.

## Menu splash convention

Character title-screen PNG masters live at `assets/menu-splashes/<firstname-lastname>.png`. The optimizer writes full-size and picker-thumbnail WebPs using the same canon slug. Add each available splash to `MENU_SPLASHES` in `menu-splash-core.js`, then run `tools/optimize_runtime_assets.py` so it appears in the player's menu-art picker.
