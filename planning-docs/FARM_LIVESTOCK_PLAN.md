# Farm Livestock Plan

Status: **Phases 0–5 shipped** (2026-09-28), **plus the chicken** (2026-09-29): assets, the herd as server rows, homes, the Livestock Dealer, the herd sim and panel; then hunger, feeding, milk and wool, and death from neglect with a memorial; then the Husbandry skill, dairy recipes and herd orders; then the Butcher, meat and meat recipes; then breeding; then **trading** (Phase 6, 2026-09-29). Next: Phase 7 (the horse). Sibling of `FARM_PETS_AND_CARE_PLAN.md`
and `FARM_HARVEST_MARKET_SKILLS_PLAN.md`.

Livestock are farm animals that **yield goods** — milk, wool, and meat
through the Market butcher. They are a separate system from pets that reuses
the pet engine's movement and bodies, and they are what finally gives the barn,
the stable stalls and the coop a job.

## Decisions locked (owner, 2026-09-28)

1. **Meat = send to the butcher.** A grown animal is sold to a Butcher in the
   Market Square; it leaves the farm and the player receives meat cuts. Nothing
   is shown on-screen. The pack's `Death` clip is not used for this.
2. **Species:** cow, pig, sheep, llama — and the **chicken** (2026-09-29, a
   rigged CC-BY model the owner added; hens lay eggs, roosters don't, and
   roosters are drawn bigger and in their own colours). **No zebra, no pug.**
   - Llama is a wool animal.
   - **Horse is a pet, not livestock** — a pet that works differently: it can
     be **ridden** and does **not** play Pet Games. Its own phase below.
3. **Sourcing = buy + breeding.** Young stock is bought for tickets; adults
   can be bred. Livestock breeding is a **simple** system. Pet breeding is a
   separate, slightly different design (hidden compatibility values etc.) and
   stays in its own pass.
4. **Livestock have grades and stats**, and those change the value of the
   goods, of the animal at the butcher, and of offspring — so breeding better
   stock is a real progression path.
5. ~~Pig, sheep and llama have no walk clip → a procedural gait.~~ The
   converter found that every model ships real `Idle`/`Walk`/`WalkSlow`/`Run`/
   `Jump`/`Death` clips (the FBX skim missed them), so no gait was needed.
6. **Bigger land is coming later.** Livestock capacity must come from housing
   and space, never a hard species constant, so buying land later is a
   capacity change, not a redesign.
7. **Neglect can kill**, on the same rules as pets (below).
8. **Sheep give milk as well as wool.** Pigs are meat-only for now; truffle
   hunting is a possible later pass.
9. **Wool feeds a later Weaving craft.** Until then it sells and fills orders.
10. **Pens are a new placeable item** (a catalog row with a slot count), not
    a ring of existing fences.

## Assets

`farm/assets/yield-animals/` — Quaternius *Farm Animals* pack, CC0 (`License.txt`),
and `chicken.glb` (Maf'j Alvarez, CC-BY-4.0, credited in `CREDITS.md`; not
built by `convert.py`, it came as a GLB).
Blends/FBX/OBJ only. Clips found in the FBX:

| Model | Clips |
|---|---|
| Cow, Horse, Pig, Sheep, Llama | Idle, Walk, WalkSlow, Run, Jump, Death (confirmed by the converter) |
| Zebra, Pug | not used |

Convert like the fishing pack: `farm/assets/yield-animals/tools/convert.py`
(Blender 5.1 is installed), commit only the GLBs, gitignore the source
folders. The converter prints each file's actions — confirm the clip list
there, since the FBX grep above is approximate.

## What is reused vs. new

**Reused from pets:** the pure 60 Hz wander sim and line-of-sight pens
(`farm-pets.mts` — parametrize rather than fork), clip slicing
(`farm-animal-clips.mts`), metre-height body scaling (`farm-pet-bodies.mts`),
palettes (`farm-pet-palettes.mts`), carry/put-down, the farm clock (paused
while away — livestock never progress offline, same as pets), and the portrait
renderer.

**Not carried over:** affection, happiness-driven runaways, toys, dwellings,
tricks, Pet Games, memorials/tombstones.

**New:** `js/farm-catalog/livestock.mts` (pure species catalog),
`js/farm-livestock.mts` (pure stats/grade/product/breeding maths), a livestock
panel, a server mirror `services/farm-livestock-catalog.mts`, and a
Husbandry skill.

## Trust model

An animal's stats decide what its goods, its meat and its offspring are worth,
so **stats cannot live in the client-saved farm document.** Same shape as fish:

- **One server-minted row per animal** — `farm_livestock` (migration 057):
  id, owner, species, gender, stats, grade, birth farm-time, parents, status
  (`alive` / `butchered` / `traded`). Bought, bred and traded animals change
  only through server routes.
- The farm document holds **placement only** (which pen/stall, position) by
  animal id, the way a Trophy Mount names only a `fishId`. A forged id that
  isn't the owner's live animal draws nothing.
- Product readiness, yields, breeding results and butcher cuts are decided
  server-side inside the bounded farm clock (real time + nap bank), exactly as
  harvests are.

## The individual

- **Gender** female/male; **life stage** young → adult → elder on the farm
  clock. Only adults produce, breed, or fetch full butcher value.
- **Stats (1–100, species-weighted ranges):**
  - **Yield** — how much product per cycle / how many cuts.
  - **Quality** — biases the product grade (Poor/Normal/Fine/Perfect, the
    existing `farm-quality` grades).
  - **Growth** — how fast a young animal reaches adult.
  - **Hardiness** — how slowly hunger drains, how forgiving neglect is.
- **Grade** (e.g. ★1–★5) derived from the stats — shown on the card, drives
  dealer/butcher price.
- **Palette** from the pet palette system; cosmetic only.

## Loop

1. **Housing.** Each animal needs a slot: stable stalls (3), barn stalls,
   pens (a new placeable decor row per size, each with a slot count and a
   gate), and the Chicken Coop's floor (six, chickens only). Total slots =
   capacity. A shut stall already pens an animal.
2. **Feed.** Hay / grain / suitable crops from inventory. Fed and housed =
   the product timer runs; hungry = it stalls and care grade drops.
   **Neglect kills, like pets:** hunger drains per farm day (Hardiness
   slows it), ≤40 is Hungry, 0 is Starving, and an animal at 0 for one full
   farm day dies — the row becomes `died` atomically, no meat is given.
   Pet warning stages are reused (Doing well / Needs care / Distressed /
   Life at risk). Farm clock only, so nothing drains while away. Livestock
   have no affection, so there are no runaways.
3. **Collect** (E at the animal): milk (cow, sheep), shear wool (sheep,
   llama, on a regrow timer). Pigs have no renewable product — they are
   raised for the butcher.
   Server-minted into inventory stacks keyed `item@grade`.
4. **Sell / cook / order.** Market merchant with day prices; Cooking recipes
   (butter, cheese, cream, and later meat dishes); Order Board notices;
   barter-table stacks.
5. **Butcher.** Adult → cuts (count from Yield + age, grade from Quality +
   care). Animal row → `butchered`.
6. **Breed.** Two housed adults, same species, opposite gender, fed → after a
   gestation of N farm days the server mints a young one.

## Breeding (livestock, simple)

- Each stat of the offspring = parents' average ± a small random spread,
  with a small chance of a bigger upward jump, clamped to the species range.
- Grade follows from the new stats — so pairing two high-grade adults is how a
  player raises the herd.
- Cooldown per mother; needs a free housing slot for the young; server rolls
  the RNG. Lineage kept (parent ids) for a later pedigree view.
- No hidden compatibility — that complexity is reserved for pet breeding.

## Husbandry skill

`skills.husbandry` — server-owned like Farming, 1–99 on the same curve.
XP from collecting, butchering and breeding. Levels gate species (e.g. sheep
1, pig 5, cow 10, llama 15), breeding, and bonus capacity.

## Horse (ridable pet)

A new entry in the pet roster with `ridable: true` and excluded from Pet
Games. E to mount, the player's body rides the horse (the `seated` state in
`farm-body.mts` is the closest seam), WASD drives the horse's real Walk/Run
clips. Lives in a stable stall as its home. Riding makes more sense once
land gets bigger, so it follows the livestock phases.

## Phases

0. ✅ **Assets** — `farm/assets/yield-animals/tools/convert.py`, GLBs for
   cow/pig/sheep/llama/horse with named clips.
1. ✅ **Herd on the field** — `js/farm-catalog/livestock.mts`,
   `js/farm-livestock*.mts`, migration 057 `farm_livestock`, Livestock Dealer
   (Hollis) in the Market, homes (stable stalls ×1, barn floor ×2, Small Pen
   ×2, Large Pen ×4), herd sim, Livestock panel (L / Herd). Homeless animals
   (their pen taken down) roam the field until re-homed.
2. ✅ **Feed + products + neglect** — `js/farm-livestock-care.mts` ↔ the
   server's copy: care is a checkpoint and a straight line (hunger at a farm
   minute, 25/day scaled by Hardiness), so well-fed time, hungry (stress) time
   and the minute it starved are exact between checkpoints. Goods fill only
   while grown and well fed; a whole farm day at empty is death. One route,
   `POST /games/farm/livestock/care` (checkup/feed/collect), sends the farm like
   a harvest; the server settles the herd at the verified clock first, closing
   a dead animal's row and writing a pets-style memorial stone + history entry.
   G feeds (Hay / Pig Feed from the supply shop, else a liked crop, plainest
   first); E collects a ready good. Milk, Sheep's Milk, Wool, Llama Wool live in
   the harvest basket at Poor/Normal/Fine/Perfect (Quality stat − 60 × the
   cycle's hungry share) and sell at the Produce Merchant (price derived from a
   per-day value). Yield: 1 + ⌊Yield/40⌋ per collection.
3. ✅ **Husbandry + kitchen** — `skills.husbandry`, server-owned and pinned
   by the save guard like Farming. A collection pays 60 XP per farm day of the
   good's cycle, less its hungry share (`livestockCollectXp`, mirrored). The
   Dealer gates sheep 1 / pig 5 / cow 10 / llama 15; animals already owned
   are kept. Eight level-taught dairy recipes use milk from the basket. Two
   herd notices (slots 7–8, their own stream and customers, `kind: "goods"`)
   pay Husbandry XP. The kitchen's notices skip dairy dishes, so no posted order
   changed. Barter stacks were already there: goods are basket produce. Four
   achievements. Not built: bonus capacity from Husbandry (wait for land),
   and the breeding gate (Phase 5).
4. ✅ **Butcher** — Otto's stall in the Market Square's south-east corner
   (`BUTCHER_STALL_ID`). One meat per species (Mutton 4 / Pork 6 / Beef 8 /
   Llama Meat 5 cuts at an average one's prime), basket produce graded
   Poor–Perfect like milk. Cuts = species cuts × Yield (0.6×–1.4×) × age
   (none while young, ¾ the day it grows, all at twice its grown age); grade =
   Quality less its lifetime hunger (`care.neglect`, new, tracked at any
   age). Price per cut is derived: (young price + 30/day × days to prime) ÷
   cuts, so an average one kept to its prime pays back its price plus a
   milking cow's day rate. `POST /games/farm/livestock/butcher` settles the
   herd at the farm's STORED clock (the square has no running one), refuses a
   young one and a basket without room for every cut, then closes the row as
   `butchered` in the same transaction as the meat and the Husbandry XP (the
   species' days to grown × 60, less its hungry share). Pure rules in
   `js/farm-livestock-butcher.mts` ↔ the server catalog; the counter
   (`farm-livestock-butcher-panel.mts`, wired by `farm-market-butcher.mts`)
   quotes each animal and asks twice. Eight level-taught meat recipes
   (Pork Sausages 4 … Sunday Pot Roast 33, with Moussaka taking milk and Surf
   & Turf a reef fish), kept off the kitchen's notices like the dairy ones.
   Two achievements (Off to the Butcher, Prime Cut). No migration. Not built:
   meat on herd order notices.
5. ✅ **Breeding** — decided with the owner 2026-09-28: pair from the Herd
   panel, the pair must **share a home** (pen or barn floor), free, from
   Husbandry 3, **one young per birth**, and bred stats may pass the Dealer's
   ranges up to 100 (the plan's "clamped to the species range" would have made
   ★5 unreachable). `js/farm-livestock-breeding.mts` ↔ the server's Breeding
   section. The pregnancy lives in the mother's `care` and carries the sire as
   he was. Only well-fed time counts toward the species' `gestationDays` (2/2/3/3).
   The server mints the young one at the first settle after it comes due, into
   her home or the first with room. If there is no room, the birth waits. She
   rests 1 farm day. Stats are the parents' average ±5 with a 10% chance of
   +6–12; the coat is hers, his, or 10% any. A birth pays 60 XP per gestation
   day (`husbandry.births`). Achievements: New Arrival, Best of Breed. A
   pregnancy is lost with its mother (death or Butcher). No migration.
   Not built: a pedigree view.
6. ✅ **Trading** — decided with the owner 2026-09-29: an animal goes on the
   barter table (one line per animal, by row id, like a fish) and on the
   Exchange Board, one to a listing, at a price the SELLER sets. The receiver
   must be able to keep it — the Dealer's Husbandry level for the species, room
   under `MAX_HERD`, and a free home — or the table reopens (`no_room_*`,
   `husbandry_too_low_*`, `herd_full_*`) and a board purchase is refused before
   any ticket moves. A pregnancy travels; the young one is born on the new farm.
   The one seam is `db/farm-livestock-transfer.mts`: the animal is carried to
   the sender's STORED clock (one found dead there is `offer_gone`/`died`; its
   own farm marks it at its next settle), then every farm-minute stamp moves by
   the difference to the receiver's clock (`rebaseLivestockCare`; durations do
   not move, and stamps may now be negative — a ten-day-old cow on a five-day
   farm was born on day −5). A listed animal is `state = 'listed'` on clock
   zero: it neither eats nor grows on the board, and comes home (to a free
   home, or the field) when taken down. Other side's animals are read as public
   cards (`GET /games/farm/livestock/cards?ids=`). No migration. Alongside it:
   the Exchange Board dropped its ½–1½× band for player-set prices (1–10,000)
   with the daily caps raised to 10,000, and fish list on it too
   (`db/farm-fish-listing.mts`, same `listed` escrow, buyer needs creel room).
   Not built: pedigree view, trading pets.
7. ✅ **Horse** — ridable pet (built 2026-09-29). Scoped and built in its own plan: `FARM_RIDING_PLAN.md` (the horse as a pet, cosmetic riding everywhere, piloted riding in Windrush Downs off the Market Square).

Later, outside this plan: **Weaving** (wool → cloth/goods at a loom), pig
**truffle hunting**, pet breeding.

## Open questions

- Can a butchered or sold animal's name/lineage be seen anywhere afterwards? (Bred rows now carry `parents` with both names, which the Herd panel shows while the young one lives.) (Its row is kept — `state = 'butchered'`, `ended_minute` — so a pedigree view can read it later; nothing shows it yet.)
- ~~Does a dead animal leave a memorial prop?~~ Yes, like a pet (owner, 2026-09-28).
- Pet breeding's own plan (hidden compatibility) — when?
