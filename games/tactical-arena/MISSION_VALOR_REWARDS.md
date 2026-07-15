# Campaign Mission Valor Rewards

Source of truth: `CAMPAIGN_VALOR_REWARDS` in `src/campaign/campaignContent.js` (line ~44).
Any mission not present in that map falls back to `75` valor (see the `?? 75` fallback
where it's read, line ~543) — currently every authored mission has an explicit entry,
so the fallback only applies to future/placeholder trail stops.

| # | Mission | Unlock / Reward | Required Stars | Valor |
| - | ------- | ---------------- | --------------- | ----- |
| 1 | Clod on the Ridge | Clod | 0 | 55 |
| 2 | Necromancer's Gate | Necromancer | 2 | 60 |
| 3 | Cursed Swamp of the Witch Doctor | Witch Doctor | 4 | 65 |
| 4 | Timeless Woods | Father Time | 6 | 70 |
| 5 | Root of the Virus | Virus | 8 | 75 |
| 6 | Wandering Paladin | Paladin | 10 | 80 |
| 7 | Temple Trial of the Monk | Monk | 12 | 90 |
| 8 | Mechs on the Farm | Big Brother or Little Brother (choice) | 13 | 105 |
| 9 | Gargoyle's Inferno | Gargoyle | 14 | 120 |
| 10 | The High Ground of the Sniper | Sniper | 16 | 135 |
| 11 | The Wandering Party | Skin pack (traveler's costume, no unit) | 18 | 150 |
| 12 | Dug Your Own Grave | Miner | 20 | 165 |
| 13 | Has-Been Heroes | Skin (Mystic look, no unit) | 22 | 180 |
| 14 | Battle for the Bridge | Ronin | 24 | 195 |
| 15 | Wrong Place, Wrong Time | Riot Cop | 26 | 210 |
| 16 | Out of Retirement | Angel + two summer skins | 28 | 230 |
| 17 | Voidwood Forest | Treant + Voidroot Treant skin | 30 | 250 |
| 18 | Spirit of the Woods | Mother Nature | 32 | 270 |
| 19 | The Showdown | Fat Knight, Fat Wizard, Fat Cleric, Fat Bowman | 0 (gated on prior missions) | 295 |
| 20 | Not My King | King | 0 (gated on prior missions) | 320 |
| 21 | Void Ridden Castle | Nemesis | 0 (gated on prior missions) | 350 |
| 22 | The Final Battle | Blacksword | 0 (gated on prior missions) | 405 |

## Notes for rescoping

- Values now total `3,875` Valor across the full campaign. That is enough to let
  players buy a few units or a couple of common premium skins from campaign play,
  while leaving long-tail skins to USD purchases or sustained online play.
- The first seven missions award `495` Valor total, enough for one low-tier unit
  shop pick after the opening act without letting the early campaign empty the shop.
- Missions 19–22 don't gate on `requiredStars`; they gate on
  `requiresPreviousMissionsComplete` instead, so their `0` isn't a difficulty signal.
- To change a value, edit the corresponding entry in `CAMPAIGN_VALOR_REWARDS`
  (`src/campaign/campaignContent.js`) — nothing else needs to change to pick up a new
  number.
