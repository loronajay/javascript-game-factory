# Skin Pack Pricing

Skin packs are purchased bundles made from sellable skins that already have a
`packId` in `src/ui/skinModel.js`. Skins marked as Halloween exclusive but not
assigned to the Halloween Pack stay separate single purchases. Ghoul skins are
not sold directly or included in packs; matching Ghoul skins unlock when the
corresponding Necromancer skin is purchased.

## Pricing Rules

- Pack ownership should be fair to players who already bought individual skins.
  If a player owns part of a pack, the pack purchase should only charge for the
  remaining unowned contents.
- Big collection packs should feel like a real bundle discount, roughly 40-50%
  below the individual skin total.
- Small packs should use a lighter discount, roughly 15-30%, so individual skin
  prices still feel meaningful.
- Halloween-exclusive singles are not included in the Halloween Pack. Current
  examples: Enchanted Swordsman and Bronze Witch Mother Nature.

## Proposed Pack Prices

| Pack | Contents | Individual USD Total | Pack USD | Individual Valor Total | Pack Valor |
| --- | ---: | ---: | ---: | ---: | ---: |
| Summer Vibes | 29 common skins | $28.71 | $14.99 | 24,650 | 12,500 |
| Halloween | 25 rare skins | $49.75 | $24.99 | 38,750 | 19,500 |
| Arcane | 21 rare skins | $41.79 | $19.99 | 32,550 | 16,000 |
| Blood Moon | 30 epic skins | $89.70 | $49.99 | 67,500 | 40,000 |
| Void Dweller | 10 legendary skins | $39.90 | $24.99 | 28,500 | 19,500 |
| Desert Warriors | 4 rare skins | $7.96 | $5.99 | 6,200 | 4,750 |
| Geisha | 4 legendary skins | $15.96 | $11.99 | 11,400 | 8,750 |
| Riot Cop | 4 epic skins | $11.96 | $8.99 | 9,000 | 6,750 |
| Southern Kingdom | 12 epic skins | $35.88 | $26.99 | 27,000 | 20,250 |
| Grim Reaper | 2 epic skins | $5.98 | $4.99 | 4,500 | 3,750 |
| Infernal | 2 epic skins | $5.98 | $4.99 | 4,500 | 3,750 |
| Medieval | 2 rare skins | $3.98 | $2.99 | 3,100 | 2,500 |

## Storefront Behavior

- Add a `Skin Packs` tab to the shop.
- Pack cards should be clickable and open a contents view with every skin in the
  pack.
- The card and contents view should show owned progress, for example `3/25
  owned`.
- Valor purchases use the same confirmation dialog as units and individual
  skins.
- A confirmed pack purchase grants every currently unowned skin in that pack.
