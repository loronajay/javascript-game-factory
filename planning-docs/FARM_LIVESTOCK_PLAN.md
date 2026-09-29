# Farm Livestock Plan

Status: **Phases 0–1 shipped** (2026-09-28): assets, the herd as server rows, homes (stalls, barn floor, pens), the Livestock Dealer, the herd sim and the Livestock panel. Next: Phase 2 (feed + products, and neglect). Sibling of `FARM_PETS_AND_CARE_PLAN.md`
and `FARM_HARVEST_MARKET_SKILLS_PLAN.md`.

Livestock are farm animals that **yield goods** — milk, wool, and meat
through the Market butcher. They are a separate system from pets that reuses
the pet engine's movement and bodies, and they are what finally gives the barn,
the stable stalls and the coop a job.

## Decisions locked (owner, 2026-09-28)

1. **Meat = send to the butcher.** A grown animal is sold to a Butcher in the
   Market Square; it leaves the farm and the player receives meat cuts. Nothing
   is shown on-screen. The pack's `Death` clip is not used for this.
2. **Species:** cow, pig, sheep, llama. **No zebra, no pug.**
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

`farm/assets/yield-animals/` — Quaternius *Farm Animals* pack, CC0 (`License.txt`).
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
   gate), coop reserved for chickens if an asset turns up. Total slots =
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
2. **Feed + products** — feed items, growth to adult, collect milk/wool
   through a server route, graded inventory stacks, market sale.
3. **Husbandry + kitchen** — skill, dairy recipes, Order Board notices,
   barter-table stacks.
4. **Butcher** — Market Butcher, meat cuts, meat recipes (and fish/crop
   combos).
5. **Breeding** — pairing, gestation, inherited stats, lineage.
6. **Trading** — live animals on the barter table (row changes owner) and
   possibly the Exchange Board.
7. **Horse** — ridable pet.

Later, outside this plan: **Weaving** (wool → cloth/goods at a loom), pig
**truffle hunting**, pet breeding.

## Open questions

- Can a butchered or sold animal's name/lineage be seen anywhere afterwards?
- Does a dead animal leave a memorial prop like a pet, or only a record?
- Pet breeding's own plan (hidden compatibility) — when?
