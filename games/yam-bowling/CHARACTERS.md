# Canon character roster

| # | Character | Source PNG |
|---:|---|---|
| 01 | Daisy Monroe | `daisy-monroe.png` |
| 02 | Maren Holt | `maren-holt.png` |
| 03 | Nia Brooks | `nia-brooks.png` |
| 04 | Tessa Quinn | `tessa-quinn.png` |
| 05 | Zuri Banks | `zuri-banks.png` |
| 06 | Amara Reed | `amara-reed.png` |
| 07 | Claire Rowan | `claire-rowan.png` |
| 08 | Lumi Vega | `lumi-vega.png` |
| 09 | Cassy Cruz | `cassy-cruz.png` |
| 10 | Fiona Vale | `fiona-vale.png` |
| 11 | Nyx Calder | `nyx-calder.png` |
| 12 | Skye Bennett | `skye-bennett.png` |
| 13 | Carmen Blaze | `carmen-blaze.png` |
| 14 | Piper Hart | `piper-hart.png` |
| 15 | Maeve Sinclair | `maeve-sinclair.png` |
| 16 | Reina Sato | `reina-sato.png` |
| 17 | Jade Mercer | `jade-mercer.png` |
| 18 | Imani Cole | `imani-cole.png` |
| 19 | Sabrina Wilde | `sabrina-wilde.png` |
| 20 | Willa Grant | `willa-grant.png` |
| 21 | Aaliyah Storm | `aaliyah-storm.png` |
| 22 | Mina Park | `mina-park.png` |
| 23 | Scarlett Voss | `scarlett-voss.png` |
| 24 | Sage Holloway | `sage-holloway.png` |
| 25 | Hazel Ward | `hazel-ward.png` |
| 26 | Roxy Chen | `roxy-chen.png` |
| 27 | Naomi Okafor | `naomi-okafor.png` |
| 28 | Echo Sterling | `echo-sterling.png` |

Source PNGs live in `assets/characters/usable/canon/`. Each character's five cleaned throw frames live in `assets/characters/processed/canon/<firstname-lastname>/`. The original UUID for every source remains in `animation-core.js` as `legacyId` provenance.

Front-facing selection portraits are extracted from pose zero into `assets/characters/portraits/canon/`. Throw frames remain rear-facing because they are rendered from the bowler's lane perspective.

Protected hand-edited fourth-throw frames live in `assets/characters/manual-overrides/canon/<firstname-lastname>/throw-04.png`. The extractor automatically reapplies them after every rebuild.
