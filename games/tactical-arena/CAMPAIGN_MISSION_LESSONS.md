# Campaign Mission Lessons (dev reference)

Player-facing mission copy (`AUTHORED_MISSIONS` in `src/campaign/campaign.js`) is
in-world flavor text only — no "Lesson:" framing. The campaign is meant to double as
a teaching tool, but it should read as a campaign, not a tutorial track. This doc is
the design/dev record of what each mission is actually teaching, kept separate from
the copy players see.

| Mission (id) | Tactical lesson |
| --- | --- |
| Clod on the Ridge (`clod-trial`) | Armor, magic, and RAGE spacing — magic damage cuts through defense; loose spacing keeps Thunderous Charge from ending the run. |
| Necromancer's Gate (`necromancer-rise`) | Status pressure and cleansing — physical damage slips past Dead Zone, spacing starves Spread, and a cure keeps permanent poison from becoming a losing clock. |
| Cursed Swamp of the Witch Doctor (`witch-doctor-swamp`) | Body-blocks, fire lanes, and Volley Shot — orthogonal fire marks the only tiles that don't bite twice, Volley Shot reaches through blockers, and speed denies Black Death Dance. |
| Timeless Woods (`timeless-woods`) | Permanent stat buffs and RAGE revives — Father Time turns an ally into a carry with Age, then threatens Rewind at RAGE. |
| Root of the Virus (`virus-root`) | Poisonous squad synergy — Misfortune turns poison into a certainty, tight formations invite Spread, and protective support gives the rot something to argue with. |
| Wandering Paladin (`wandering-paladin`) | Light tiles, status immunity, and honorable duels — a 1v1 that gates on status immunity. |
| Temple Trial of the Monk (`monk-temple-trial`) | Read the real kit and find the real master — four Monks appear, only one is real; read the battle rather than guessing. |
| Gargoyle's Inferno (`gargoyle-inferno`) | Fire discipline and denying RAGE — a random tile ignites each turn, Pyroclasm punishes careless lines, and a fast kill denies Volcanic Rage's free eruption. |
| The High Ground of the Sniper (`sniper-highground`) | Cover, terrain fire, and a partly-fixed squad — destructible walls block both sightlines (shoot through them), the permanent cliff-fire must be routed around, and the Archer is pinned in slot one so the lesson is fought archer-vs-sniper; a blind on the enemy marksman is the bonus. |

When authoring a new mission, add its lesson here alongside the in-world subtitle/
description in `AUTHORED_MISSIONS` — keep the two in sync but never merge them back
into player-facing text.
