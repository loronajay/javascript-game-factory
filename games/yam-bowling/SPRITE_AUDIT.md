# Sprite Visual Audit — Complete

This is the completed historical record of the cast-wide visual repair pass.
The original findings covered bad crops, missing or extra body parts,
neighboring hair or limbs, white spots, inconsistent anatomy, and unusable
source sheets. Every checklist item below was repaired or reviewed against the
best available source, exported to runtime WebP, and accepted in the finished
cast pass on 2026-08-22.

## Safe one-sprite workflow

1. Work on one runtime PNG at a time. Throw PNGs must remain 440 x 960 with a
   transparent background.
2. Keep a pose sheet named `source.png` as a PNG reference. Do **not** convert
   the whole source sheet to WebP.
3. After correcting a runtime PNG, drag it onto `CONVERT_ONE_SPRITE.cmd` in the
   project root. The matching WebP beside it will be replaced.
4. Inspect the WebP in game, then check off only that frame.

## Completed

- [x] Aaliyah Storm — swimsuit throw 4: converted the known-good PNG to WebP
  and verified 440 x 960 RGBA with exact alpha on 2026-08-20.

## Recovery inventory for flagged source sheets

The sheets below were copied byte-for-byte over the live `source.png` on
2026-08-20 before their manual repair and export pass. Most came from
`recovery/pre-pipeline-source-sheets/`; the additional swimsuit sheets came
from `tmp/pre-fix-baseline/`.

### Restored from recovery

- Amara Reed — swimsuit
- Carmen Blaze — maid, swimsuit
- Cassy Cruz — maid, swimsuit
- Claire Rowan — maid
- Daisy Monroe — maid, swimsuit
- Echo Sterling — maid
- Fiona Vale — swimsuit
- Hazel Ward — Halloween, swimsuit
- Imani Cole — Halloween, maid
- Kevya Desai — Halloween, maid, swimsuit
- Lillie Chen — maid
- Lumi Vega — maid, swimsuit (the original note omitted the variant; swimsuit
  was used because it is the remaining variant in the note sequence)
- Marisol Cruz — maid
- Mina Park — maid
- Naomi Okafor — maid, swimsuit
- Nia Brooks — maid
- Nyx Calder — Halloween, maid, swimsuit
- Piper Hart — maid, swimsuit
- Rei Nakamura — maid
- Reina Sato — maid
- Sabrina Wilde — maid (the original note omitted the variant; maid was used
  because it is the recovery sheet matching the note's position in the list)
- Scarlett Voss — maid
- Simone Carter — maid, swimsuit
- Skye Bennett — maid
- Tessa Quinn — maid, swimsuit

### Replacement sources completed

- Rei Nakamura — swimsuit replacement source and runtime frames completed.
- Talia Dodson — Halloween replacement source and runtime frames completed.

## Full visual checklist


### Lumi Vega

- [x] Halloween — white spots on all.
- [x] Maid — source sheet and throw 5. `recovery available`
- [x] Variant omitted in original note, likely swimsuit — source sheet and
  throw 5 hand. `source restored from pre-fix baseline`

### Marisol Cruz

- [x] Halloween — throw 5 hand.
- [x] Maid — source sheet and all throws. `recovery available`

### Mina Park

- [x] Halloween — throw 4.
- [x] Maid — source sheet, throw 4, and throw 5. `recovery available`

### Naomi Okafor

- [x] Halloween — white spots and throw 5 foot.
- [x] Maid — source sheet, throw 4, and throw 5. `recovery available`
- [x] Swimsuit — source sheet and all throws. `recovery available`

### Nia Brooks

- [x] Halloween — throw 5.
- [x] Maid — source sheet and throw 5. `recovery available`

### Nyx Calder

- [x] Halloween — victory/defeat poses do not match source sheet; source sheet
  also needed. `recovery available`
- [x] Maid — throw 5 loses fingers; source sheet needed. `recovery available`
- [x] Swimsuit — source sheet; all throws are bad.
  `source restored from pre-fix baseline`

### Piper Hart

- [x] Halloween — throw 5.
- [x] Maid — source sheet, throw 2, and throw 4. `recovery available`
- [x] Swimsuit — source sheet, throw 2, throw 4, and white spots.
  `source restored from pre-fix baseline`

### Rei Nakamura

- [x] Halloween — all throws.
- [x] Maid — source sheet and all throws. `recovery available`
- [x] Swimsuit — replacement sheet and corrected throw 5 arm.

### Reina Sato

- [x] Halloween — throw 5 and white spots.
- [x] Maid — source sheet and all throws. `recovery available`
- [x] Swimsuit — preserved the known-good WebPs instead of regenerating them
  from the rejected PNG copies.

### Roxy Chen

- [x] Halloween — throw 4 and white spots.
- [x] Maid — throw 4.

### Sabrina Wilde

- [x] Halloween — throw 2, throw 4, and throw 5.
- [x] Variant omitted in original note, likely maid — source sheet; all throws
  are bad. `maid recovery available; verify variant`

### Sage Holloway

- [x] Halloween — throw 5.
- [x] Maid — some spots; not severe.

### Scarlett Voss

- [x] Halloween — white spots.
- [x] Maid — source sheet and throw 4. `recovery available`

### Simone Carter

- [x] Halloween — white spots, throw 2, throw 4, and throw 5.
- [x] Maid — source sheet; all throws are bad. `recovery available`
- [x] Swimsuit — source sheet, throw 3, and throw 5. `recovery available`

### Skye Bennett

- [x] Halloween — throw 5.
- [x] Maid — source sheet, throw 4, and throw 5. `recovery available`

### Talia Dodson

- [x] Halloween — replacement throw sheet.
- [x] Maid — victory poses did not match throw sheet; character was too buff.

### Tessa Quinn

- [x] Halloween — throw 3, throw 4, throw 5, and spots.
- [x] Maid — source sheet; all throws are bad. `recovery available`
- [x] Swimsuit — source sheet; all throws are bad. `recovery available`

### Zuri Banks

- [x] Maid — spots.
- [x] Halloween — spots.
