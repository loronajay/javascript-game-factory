# Sprite Visual Audit

These are visual inspection notes, not exact repair instructions. Every open
item still needs to be checked against the best available source/reference.
Problems may include bad crops, missing or extra body parts, neighboring hair
or limbs, white spots, inconsistent anatomy, or a generally unusable sheet.

## Safe one-sprite workflow

1. Work on one runtime PNG at a time. Throw PNGs must remain 440 x 960 with a
   transparent background.
2. Keep a pose sheet named `source.png` as a PNG reference. Do **not** convert
   the whole source sheet to WebP.
3. After correcting a runtime PNG, drag it onto `CONVERT_ONE_SPRITE.cmd` in the
   project root. The matching WebP beside it will be replaced.
4. Inspect the WebP in game, then check off only that frame.
5. Do not rebuild Reina Sato's swimsuit WebPs from the current PNGs. The WebPs
   are the good copies and the PNGs are bad.

## Completed

- [x] Aaliyah Storm — swimsuit throw 4: converted the known-good PNG to WebP
  and verified 440 x 960 RGBA with exact alpha on 2026-08-20.

## Recovery inventory for flagged source sheets

`available` means a matching sheet exists under
`recovery/pre-pipeline-source-sheets/`. It has not been copied over the live
sheet by this audit, so no current work is silently overwritten.

### Available

- Amara Reed — swimsuit
- Carmen Blaze — maid, swimsuit
- Cassy Cruz — maid
- Claire Rowan — maid
- Daisy Monroe — maid
- Echo Sterling — maid
- Hazel Ward — Halloween
- Imani Cole — Halloween, maid
- Kevya Desai — Halloween, maid
- Lillie Chen — maid
- Lumi Vega — maid
- Marisol Cruz — maid
- Mina Park — maid
- Naomi Okafor — maid, swimsuit
- Nia Brooks — maid
- Nyx Calder — Halloween, maid
- Piper Hart — maid
- Rei Nakamura — maid
- Reina Sato — maid
- Sabrina Wilde — maid (the original note omitted the variant; verify this is
  the intended sheet)
- Scarlett Voss — maid
- Simone Carter — maid, swimsuit
- Skye Bennett — maid
- Tessa Quinn — maid, swimsuit

### Not found in recovery

- Cassy Cruz — swimsuit (inferred from "same issue as maid")
- Daisy Monroe — swimsuit
- Fiona Vale — swimsuit
- Hazel Ward — swimsuit
- Kevya Desai — swimsuit
- Lumi Vega — likely swimsuit (the original note omitted the variant)
- Nyx Calder — swimsuit
- Piper Hart — swimsuit
- Rei Nakamura — swimsuit needs an entirely new sheet, per the audit note

## Full visual checklist

### Aaliyah Storm

- [x] Swimsuit — throw 4 PNG needed WebP conversion.

### Amara Reed

- [ ] Maid — throw 5.
- [ ] Swimsuit — source sheet. `recovery available`

### Carmen Blaze

- [ ] Halloween — throw 2.
- [ ] Maid — source sheet. `recovery available`
- [ ] Swimsuit — source sheet. `recovery available`

### Cassy Cruz

- [ ] Halloween — needs a new throw sheet and portrait sheet; character is too
  buff.
- [ ] Maid — portrait is too buff; old source sheet needed. `recovery available`
- [ ] Swimsuit — same issue as maid. `recovery source not found`

### Claire Rowan

- [ ] Maid — source sheet. `recovery available`

### Daisy Monroe

- [ ] Maid — source sheet and throw 5. `recovery available`
- [ ] Swimsuit — source sheet and throw 5. `recovery source not found`

### Echo Sterling

- [ ] Maid — source sheet and throw 4. `recovery available`

### Fiona Vale

- [ ] Swimsuit — source sheet and throw 3. `recovery source not found`

### Hazel Ward

- [ ] Halloween — source sheet and throw 5. `recovery available`
- [ ] Swimsuit — source sheet and throw 3. `recovery source not found`

### Imani Cole

- [ ] Halloween — source sheet and throw 5. `recovery available`
- [ ] Maid — source sheet and throw 4. `recovery available`

### Kevya Desai

- [ ] Halloween — source sheet, throw 4, and throw 5. `recovery available`
- [ ] Maid — source sheet and throw 5. `recovery available`
- [ ] Swimsuit — source sheet, throw 3, and throw 5.
  `recovery source not found`

### Lillie Chen

- [ ] Halloween — throw 2, throw 4, and throw 5.
- [ ] Maid — source sheet and all throws. `recovery available`

### Lumi Vega

- [ ] Halloween — white spots on all.
- [ ] Maid — source sheet and throw 5. `recovery available`
- [ ] Variant omitted in original note, likely swimsuit — source sheet and
  throw 5 hand. `recovery source not found`

### Marisol Cruz

- [ ] Halloween — throw 5 hand.
- [ ] Maid — source sheet and all throws. `recovery available`

### Mina Park

- [ ] Halloween — throw 4.
- [ ] Maid — source sheet, throw 4, and throw 5. `recovery available`

### Naomi Okafor

- [ ] Halloween — white spots and throw 5 foot.
- [ ] Maid — source sheet, throw 4, and throw 5. `recovery available`
- [ ] Swimsuit — source sheet and all throws. `recovery available`

### Nia Brooks

- [ ] Halloween — throw 5.
- [ ] Maid — source sheet and throw 5. `recovery available`

### Nyx Calder

- [ ] Halloween — victory/defeat poses do not match source sheet; source sheet
  also needed. `recovery available`
- [ ] Maid — throw 5 loses fingers; source sheet needed. `recovery available`
- [ ] Swimsuit — source sheet; all throws are bad. `recovery source not found`

### Piper Hart

- [ ] Halloween — throw 5.
- [ ] Maid — source sheet, throw 2, and throw 4. `recovery available`
- [ ] Swimsuit — source sheet, throw 2, throw 4, and white spots.
  `recovery source not found`

### Rei Nakamura

- [ ] Halloween — all throws.
- [ ] Maid — source sheet and all throws. `recovery available`
- [ ] Swimsuit — needs an entirely new sheet; arm is messed up in throw 5.

### Reina Sato

- [ ] Halloween — throw 5 and white spots.
- [ ] Maid — source sheet and all throws. `recovery available`
- [ ] Swimsuit — WebPs are all good; PNGs are bad. Preserve the WebPs.

### Roxy Chen

- [ ] Halloween — throw 4 and white spots.
- [ ] Maid — throw 4.

### Sabrina Wilde

- [ ] Halloween — throw 2, throw 4, and throw 5.
- [ ] Variant omitted in original note, likely maid — source sheet; all throws
  are bad. `maid recovery available; verify variant`

### Sage Holloway

- [ ] Halloween — throw 5.
- [ ] Maid — some spots; not severe.

### Scarlett Voss

- [ ] Halloween — white spots.
- [ ] Maid — source sheet and throw 4. `recovery available`

### Simone Carter

- [ ] Halloween — white spots, throw 2, throw 4, and throw 5.
- [ ] Maid — source sheet; all throws are bad. `recovery available`
- [ ] Swimsuit — source sheet, throw 3, and throw 5. `recovery available`

### Skye Bennett

- [ ] Halloween — throw 5.
- [ ] Maid — source sheet, throw 4, and throw 5. `recovery available`

### Talia Dodson

- [ ] Halloween — needs a new throw sheet.
- [ ] Maid — victory poses do not match throw sheet; character is too buff.

### Tessa Quinn

- [ ] Halloween — throw 3, throw 4, throw 5, and spots.
- [ ] Maid — source sheet; all throws are bad. `recovery available`
- [ ] Swimsuit — source sheet; all throws are bad. `recovery available`

### Zuri Banks

- [ ] Maid — spots.
- [ ] Halloween — spots.
