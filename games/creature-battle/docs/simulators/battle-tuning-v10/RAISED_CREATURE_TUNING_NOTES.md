# Raised Creature Tuning Notes

Simulator v7 adds raised-creature simulation.

## Progression Rule

Manual stat points are earned after Level 1.

Flat 8-points-per-level allocation is no longer canon. Manual allocation now uses a diminishing curve so early levels allow strong build shaping while high levels preserve long-term identity without runaway stat stacking.

```txt
Level 2–20: +8 points per level-up
Level 21–35: +6 points per level-up
Level 36–50: +4 points per level-up
Level 51–69: +2 points per level-up
Level 70+: +1 point per level-up
```

Manual points may be allocated only into:

```txt
Strength
Defense
Intelligence
Spirit
Speed
```

HP and MP are not directly allocated in this simulator. They come from species growth, individual variance, and derived resource bonuses from allocated stats.

## Resource Influence

For tuning only:

```txt
HP bonus = floor(StrengthAllocation × 0.60 + DefenseAllocation × 0.90)
MP bonus = floor(IntelligenceAllocation × 0.70 + SpiritAllocation × 0.70)
```

This lets raised builds affect survivability/resource pools without making HP/MP direct allocation targets.

## Individual Variance

Each side can roll individual base and growth variance.

This simulates the idea that two creatures of the same species are not exactly identical.

The default variance controls are:

```txt
Base stat variance: ±3
Growth variance: ±0.15
```

These are not final rare-variant rules. They are simulator knobs for tuning normal individual spread.

## Daredevil Eligibility

If a creature spends zero manual stat points, it remains no-allocation eligible.

Once any manual stat point is spent:

```txt
daredevilEligible = false
naturalGrowthOnly = false
```


## v8 Per-Stat Manual Allocation Cap

Simulator v8 adds a hard cap to prevent one-stat dumping.

Prototype rule:

```txt
ManualStatCapPerStat = (Level - 1) × ManualStatCapPerLevel
```

Default:

```txt
ManualStatCapPerLevel = 4
```

Because creatures earn 8 manual stat points per level-up, this means at most half of each level's manual points can be concentrated into one primary stat.

Example:

```txt
Level 2:
Available points = 8
Single-stat cap = 4

Level 10:
Available points = 72
Single-stat cap = 36

Level 20:
Available points = 152
Single-stat cap = 76
```

This still allows specialization, but prevents dumping every point into Intelligence, Speed, or another single stat forever.


## v9 Natural Level-Up Variance

Variance is automatic and applies on level-up.

Each stat receives a random additive bonus every level:

```txt
NaturalVarianceRollPerStatPerLevel = random(+0.25 to +1.25)
```

These rolls are accumulated from Level 2 onward.

This is not the same as rare variant growth. Rare variants may later use different base/growth tables. Natural variance is the normal spread that prevents two creatures of the same species from being mathematically identical.


## v10 Diminishing Manual Allocation

The simulator now calculates available manual points by summing the canon reward for each level-up from Level 2 through the selected level.

```txt
ManualStatPointsAvailable = sum(points earned for each level from 2 through CurrentLevel)
```

The single-stat cap is also summed level by level.

```txt
If a level grants 8 or 6 points: no more than 3 may go into one stat for that level.
If a level grants 4 points: no more than 2 may go into one stat for that level.
If a level grants 2 or 1 points: no more than 1 may go into one stat for that level.
```

This removes the old editable cap knob. Manual allocation is now a canon progression rule inside the simulator, not a free tuning control.
