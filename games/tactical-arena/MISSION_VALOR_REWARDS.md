# Campaign Mission Valor Rewards

Source of truth: `CAMPAIGN_VALOR_REWARDS` in `src/campaign/campaignContent.js` (line ~44).
Any mission not present in that map falls back to `75` valor (see the `?? 75` fallback
where it's read, line ~543) — currently every authored mission has an explicit entry,
so the fallback only applies to future/placeholder trail stops.

| # | Mission | Unlock / Reward | Required Stars | Valor |
| - | ------- | ---------------- | --------------- | ----- |
| 1 | Clod on the Ridge | Clod | 0 | 80 |
| 2 | Necromancer's Gate | Necromancer | 2 | 90 |
| 3 | Cursed Swamp of the Witch Doctor | Witch Doctor | 4 | 100 |
| 4 | Timeless Woods | Father Time | 6 | 115 |
| 5 | Root of the Virus | Virus | 8 | 130 |
| 6 | Wandering Paladin | Paladin | 10 | 145 |
| 7 | Temple Trial of the Monk | Monk | 12 | 160 |
| 8 | Mechs on the Farm | Big Brother or Little Brother (choice) | 13 | 175 |
| 9 | Gargoyle's Inferno | Gargoyle | 14 | 190 |
| 10 | The High Ground of the Sniper | Sniper | 16 | 205 |
| 11 | The Wandering Party | Skin pack (traveler's costume, no unit) | 18 | 220 |
| 12 | Dug Your Own Grave | Miner | 20 | 235 |
| 13 | Has-Been Heroes | Skin (Mystic look, no unit) | 22 | 250 |
| 14 | Battle for the Bridge | Ronin | 24 | 265 |
| 15 | Wrong Place, Wrong Time | Riot Cop | 26 | 280 |
| 16 | Out of Retirement | Angel + two summer skins | 28 | 300 |
| 17 | Voidwood Forest | Treant + Voidroot Treant skin | 30 | 320 |
| 18 | Spirit of the Woods | Mother Nature | 32 | 340 |
| 19 | The Showdown | Fat Knight, Fat Wizard, Fat Cleric, Fat Bowman | 0 (gated on prior missions) | 365 |
| 20 | Not My King | King | 0 (gated on prior missions) | 390 |
| 21 | Void Ridden Castle | Nemesis | 0 (gated on prior missions) | 420 |
| 22 | The Final Battle | Blacksword | 0 (gated on prior missions) | 500 |

## Notes for rescoping

- Values currently step up in a roughly steady ramp: `+10` to `+15` per mission through
  mid-campaign, then bigger jumps (`+20`, `+30`, `+50`, `+80`) in the last four
  end-game missions.
- Missions 19–22 don't gate on `requiredStars`; they gate on
  `requiresPreviousMissionsComplete` instead, so their `0` isn't a difficulty signal.
- To change a value, edit the corresponding entry in `CAMPAIGN_VALOR_REWARDS`
  (`src/campaign/campaignContent.js`) — nothing else needs to change to pick up a new
  number.
