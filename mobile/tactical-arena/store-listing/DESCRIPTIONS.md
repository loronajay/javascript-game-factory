# Play Store listing copy — draft

Edit freely; this is a starting point, not a finished voice. Character counts are against
Play's hard limits and are current as written.

Everything here is checked against what the game actually ships — no feature is claimed that
does not exist. If you cut a feature before launch, cut it from here too: describing something
the app does not do is a rejection reason, not just a fib.

---

## App name (30 char limit)

```
Tactical Arena
```

*14 / 30*

---

## Short description (80 char limit)

Shown under the title in search results and at the top of the listing. This is the one line
most people actually read.

**Recommended:**

```
Turn-based squad tactics. Draft 4 units, outthink your opponent, climb the ladder.
```

*81 / 80 — one over. Use one of these instead:*

```
Turn-based squad tactics. Draft your four, outthink your rival, climb the ladder.
```

*80 / 80*

**Alternatives:**

```
Isometric turn-based tactics. Build a squad of four and outplay real opponents.
```

*78 / 80*

```
Draft four fighters. Master 30 units. Win the duel. Turn-based tactics, online.
```

*78 / 80*

---

## Full description (4000 char limit)

```
Tactical Arena is a turn-based tactics game about small squads and big decisions. Pick four fighters from a roster of thirty, read the board, and win the duel — no timers, no twitch, just the plan you commit to.

⚔ BUILD YOUR FOUR
Thirty draftable units, each with their own stats, reach, and signature ARTS. A Sniper who punishes open ground. A Necromancer who turns your losses into his army. A Treant who simply refuses to fall over. Your squad is four choices, and every one of them costs you another.

🎯 TACTICS THAT REWARD READING THE BOARD
Positioning, elevation, facing, and range all matter. Physical damage is blunted by armour; magic ignores it entirely; true damage ignores everything. Weather rolls in and changes the fight — a thunderstorm will put out the fires you were counting on. Wounded units enter RAGE and get more dangerous, not less.

🏆 RANKED DUELS
Climb a real ELO ladder in 1v1 Ranked. A public profile tracks your standing, your record, and your per-unit stats, so you can see which units you actually win with — not the ones you think you do. Earn badges and wear one on your nameplate.

🌐 PLAY WITH PEOPLE
• Classic 1v1 and Draft 1v1 with snake-order picks and formation editing
• 4-Player Free-for-All
• 2v2 Teams
• Quick Match or private room codes
• Add friends, view profiles, and rematch the people who beat you

🗺 A CAMPAIGN WORTH FINISHING
22 missions with objectives, star ratings, dialogue, unlockable units, and multi-stage boss encounters. Special rules per mission — sometimes you are outnumbered, sometimes the board itself is against you.

⏱ TEMPO BATTLE
A different game entirely. No turns — every unit fills a readiness gauge and acts when it is ready. Same units, same rules, completely different pressure.

🎓 LEARN IN FIVE MINUTES
Five guided tutorials cover movement, combat maths, ARTS, and status effects. Then take on the CPU at Easy, Normal, or Hard until you are ready for people.

🎨 MAKE IT YOURS
Hundreds of unit skins, board themes, and unit nicknames. Earn Valor by playing and spend it in the shop, or buy what you want outright.

Free to play. No ads. No energy timers. No waiting to play the game you opened.

Tactical Arena is part of Jay's Javascript Arcade — one account across every cabinet, with friends, profiles, and a shared activity feed.
```

*Approximately 2100 / 4000 — deliberate. Play truncates after a few lines on mobile until
"read more" is tapped, so the first paragraph is doing most of the work.*

---

## Notes on claims made above

Verify each of these still holds at launch:

| Claim | Where it comes from |
| --- | --- |
| 30 draftable units | `src/core/unitCatalog.js` |
| 22 campaign missions | `campaignContent.js` |
| 5 tutorials | `src/tutorials/` |
| ELO ladder, per-unit stats, badges | Ranked is shipped and server-authoritative |
| FFA / 2v2 / Draft / Quick Match / codes | All shipped online modes |
| Tempo Battle | Shipped, versus CPU |
| CPU Easy / Normal / Hard | Shipped |
| "No ads" | True — there is no ad SDK in the build |
| "Free to play" | True — install is free; purchases are optional |

**Do not** claim cross-platform progression on mobile unless you have tested that a Play
purchase and a web purchase land on the same account. They should — both go through the
factory account — but say it after you have seen it, not before.
