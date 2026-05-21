#!/usr/bin/env python3
"""
generate_map.py — generates a dense-labyrinth Illuminauts map entry.

Usage: python generate_map.py <map_id> <seed>
  e.g. python generate_map.py map-04 42

Outputs a complete maps.js entry block to stdout.
Append it to MAPS array in scripts/maps.js before the closing ];
"""
import random, sys
from collections import deque

MAP_W, MAP_H = 35, 27

# Fixed structures — never change these
BX1, BY1, BX2, BY2 = 15, 11, 19, 15   # beacon cols/rows (inclusive)
DOOR_X, DOOR_Y = 17, 16                # entry door, one row below beacon
AX, AY = 1, 1                          # Alpha start
BX, BY = 33, 1                         # Beta start


# ─── Grid helpers ─────────────────────────────────────────────────────────────

def make_grid():
    return [['#'] * MAP_W for _ in range(MAP_H)]


def place_fixed(grid):
    for y in range(BY1, BY2 + 1):
        for x in range(BX1, BX2 + 1):
            grid[y][x] = 'B'
    grid[DOOR_Y][DOOR_X] = 'D'
    grid[AY][AX] = 'S'
    grid[BY][BX] = 'T'


def in_beacon(x, y):
    return BX1 <= x <= BX2 and BY1 <= y <= BY2


def is_protected(x, y):
    return in_beacon(x, y) or (x == DOOR_X and y == DOOR_Y) \
        or (x == AX and y == AY) or (x == BX and y == BY)


def passable(grid, x, y):
    if x < 0 or x >= MAP_W or y < 0 or y >= MAP_H:
        return False
    return grid[y][x] != '#' and grid[y][x] != 'B'


# ─── Maze generation ──────────────────────────────────────────────────────────

def gen_maze(rng, grid):
    def valid_cell(cx, cy):
        return (1 <= cx <= MAP_W - 2 and 1 <= cy <= MAP_H - 2
                and not in_beacon(cx, cy))

    def wall_between(c1, c2):
        return ((c1[0] + c2[0]) // 2, (c1[1] + c2[1]) // 2)

    def can_connect(c1, c2):
        wx, wy = wall_between(c1, c2)
        return not in_beacon(wx, wy) and not (wx == DOOR_X and wy == DOOR_Y)

    def cell_neighbors(cx, cy):
        result = []
        for dx, dy in [(2, 0), (-2, 0), (0, 2), (0, -2)]:
            nx, ny = cx + dx, cy + dy
            if valid_cell(nx, ny) and can_connect((cx, cy), (nx, ny)):
                result.append((nx, ny))
        return result

    visited = set()

    def carve_cell(cx, cy):
        if not in_beacon(cx, cy):
            grid[cy][cx] = '.'
        visited.add((cx, cy))

    stack = [(AX, AY)]
    carve_cell(AX, AY)

    while stack:
        cx, cy = stack[-1]
        nbrs = [n for n in cell_neighbors(cx, cy) if n not in visited]
        if not nbrs:
            stack.pop()
            continue
        rng.shuffle(nbrs)
        nx, ny = nbrs[0]
        wx, wy = wall_between((cx, cy), (nx, ny))
        if not in_beacon(wx, wy) and not (wx == DOOR_X and wy == DOOR_Y):
            grid[wy][wx] = '.'
        carve_cell(nx, ny)
        stack.append((nx, ny))

    if (BX, BY) not in visited:
        grid[BY][BX] = '.'
        visited.add((BX, BY))

    approachX, approachY = DOOR_X, DOOR_Y + 1
    if valid_cell(approachX, approachY) and (approachX, approachY) not in visited:
        stack = [(approachX, approachY)]
        carve_cell(approachX, approachY)
        while stack:
            cx, cy = stack[-1]
            nbrs = [n for n in cell_neighbors(cx, cy) if n not in visited]
            if not nbrs:
                stack.pop()
                continue
            rng.shuffle(nbrs)
            nx, ny = nbrs[0]
            wx, wy = wall_between((cx, cy), (nx, ny))
            if not in_beacon(wx, wy) and not (wx == DOOR_X and wy == DOOR_Y):
                grid[wy][wx] = '.'
            carve_cell(nx, ny)
            stack.append((nx, ny))
    elif valid_cell(approachX, approachY):
        grid[approachY][approachX] = '.'


def add_loops(rng, grid, count=14):
    added = 0
    attempts = 0
    while added < count and attempts < 3000:
        attempts += 1
        orientation = rng.choice(['h', 'v'])
        if orientation == 'h':
            wx = rng.choice(range(2, MAP_W - 2, 2))
            wy = rng.choice(range(1, MAP_H - 2, 2))
            if (grid[wy][wx] == '#' and not in_beacon(wx, wy)
                    and not (wx == DOOR_X and wy == DOOR_Y)
                    and grid[wy][wx - 1] not in ('#', 'B')
                    and grid[wy][wx + 1] not in ('#', 'B')):
                grid[wy][wx] = '.'
                added += 1
        else:
            wx = rng.choice(range(1, MAP_W - 2, 2))
            wy = rng.choice(range(2, MAP_H - 2, 2))
            if (grid[wy][wx] == '#' and not in_beacon(wx, wy)
                    and not (wx == DOOR_X and wy == DOOR_Y)
                    and grid[wy - 1][wx] not in ('#', 'B')
                    and grid[wy + 1][wx] not in ('#', 'B')):
                grid[wy][wx] = '.'
                added += 1


# ─── Pickup placement ─────────────────────────────────────────────────────────

def find_floor(grid, exclude=()):
    ex = set(exclude)
    return [
        (x, y)
        for y in range(1, MAP_H - 1)
        for x in range(1, MAP_W - 1)
        if grid[y][x] == '.' and (x, y) not in ex
    ]


def place_scattered(rng, grid, char, count, floor_pool, min_dist=5, used=None):
    placed = list(used) if used else []
    pool = list(floor_pool)
    rng.shuffle(pool)
    target = (len(used) if used else 0) + count
    for x, y in pool:
        if len(placed) >= target:
            break
        if grid[y][x] != '.':
            continue
        if all(abs(x - px) + abs(y - py) >= min_dist for px, py in placed):
            grid[y][x] = char
            placed.append((x, y))
    return placed


def place_near_quadrant(rng, grid, char, qx_min, qx_max, qy_min, qy_max,
                        avoid=(), min_dist_from=4):
    candidates = [
        (x, y)
        for y in range(qy_min, qy_max)
        for x in range(qx_min, qx_max)
        if grid[y][x] == '.'
        and all(abs(x - ax) + abs(y - ay) >= min_dist_from for ax, ay in avoid)
    ]
    if candidates:
        x, y = rng.choice(candidates)
        grid[y][x] = char
        return (x, y)
    return None


def place_pickups(rng, grid):
    avoid_starts = [(AX, AY), (BX, BY)]

    alpha_chip = place_near_quadrant(rng, grid, 'A', 1, 17, 1, 13, avoid=avoid_starts)
    beta_chip  = place_near_quadrant(rng, grid, 'A', 18, 34, 1, 13, avoid=avoid_starts)
    placed_chips = [c for c in [alpha_chip, beta_chip] if c]

    floor = find_floor(grid)
    lower = [(x, y) for x, y in floor if y >= 14]
    place_scattered(rng, grid, 'A', 2, lower, min_dist=6, used=placed_chips)

    floor = find_floor(grid)
    place_scattered(rng, grid, 'P', 4, floor, min_dist=6)

    floor = find_floor(grid)
    place_scattered(rng, grid, 'K', 5, floor, min_dist=5)


# ─── Door placement ───────────────────────────────────────────────────────────

def is_corridor_chokepoint(grid, x, y):
    """True if this floor tile has exactly 2 passable neighbors that are directly opposite
    (i.e. it sits in a single-width corridor, not an open room or junction)."""
    if grid[y][x] != '.':
        return False
    nbrs = [
        (x + dx, y + dy)
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if passable(grid, x + dx, y + dy)
    ]
    if len(nbrs) != 2:
        return False
    (x1, y1), (x2, y2) = nbrs
    # Opposite means their midpoint is exactly (x, y)
    return x1 + x2 == 2 * x and y1 + y2 == 2 * y


def place_doors(rng, grid, count=4):
    """Place Laser Doors only at single-width corridor chokepoints."""
    fixed_points = [(AX, AY), (BX, BY), (DOOR_X, DOOR_Y)]
    min_dist = 4

    candidates = [
        (x, y)
        for y in range(1, MAP_H - 1)
        for x in range(1, MAP_W - 1)
        if is_corridor_chokepoint(grid, x, y)
        and not is_protected(x, y)
        and abs(x - DOOR_X) + abs(y - DOOR_Y) >= 5
        and all(abs(x - fx) + abs(y - fy) >= min_dist for fx, fy in fixed_points)
    ]

    rng.shuffle(candidates)
    placed = []
    for x, y in candidates:
        if len(placed) >= count:
            break
        if all(abs(x - px) + abs(y - py) >= min_dist for px, py in placed):
            grid[y][x] = 'D'
            placed.append((x, y))

    return placed


# ─── Hazard generation ────────────────────────────────────────────────────────

def find_runs(grid):
    def non_wall(x, y):
        return grid[y][x] not in ('#', 'B')

    h_runs = []
    for y in range(1, MAP_H - 1):
        run = []
        for x in range(1, MAP_W - 1):
            if non_wall(x, y):
                run.append(x)
            elif run:
                if len(run) >= 4:
                    h_runs.append((y, run[:]))
                run = []
        if len(run) >= 4:
            h_runs.append((y, run[:]))

    v_runs = []
    for x in range(1, MAP_W - 1):
        run = []
        for y in range(1, MAP_H - 1):
            if non_wall(x, y):
                run.append(y)
            elif run:
                if len(run) >= 4:
                    v_runs.append((x, run[:]))
                run = []
        if len(run) >= 4:
            v_runs.append((x, run[:]))

    return h_runs, v_runs


def corridor_key(axis, fixed, coords):
    return (axis, fixed, coords[0], coords[-1])


def beam_clear(grid, tx, ty, dx, dy, length):
    """Return True if at least `length` tiles in direction (dx,dy) from (tx,ty) are passable."""
    clear = 0
    for i in range(1, length + 2):
        nx, ny = tx + dx * i, ty + dy * i
        if nx < 0 or nx >= MAP_W or ny < 0 or ny >= MAP_H:
            break
        if grid[ny][nx] in ('#', 'B'):
            break
        clear += 1
    return clear >= length


STAGGER = [0, 1000, 500, 1500, 250, 750, 1250]

PROFILES = {
    'balanced':     {'aliens': 4, 'gates': 4, 'turrets': 3},
    'alien_heavy':  {'aliens': 7, 'gates': 2, 'turrets': 1},
    'gate_heavy':   {'aliens': 2, 'gates': 8, 'turrets': 2},
    'turret_heavy': {'aliens': 2, 'gates': 3, 'turrets': 6},
}


def gen_hazards(rng, grid):
    h_runs, v_runs = find_runs(grid)

    h_runs = [(y, xs) for y, xs in h_runs
              if not (BY1 <= y <= BY2 and any(BX1 <= x <= BX2 for x in xs))]
    v_runs = [(x, ys) for x, ys in v_runs
              if not (BX1 <= x <= BX2 and any(BY1 <= y <= BY2 for y in ys))]

    profile_name = rng.choice(list(PROFILES.keys()))
    counts = PROFILES[profile_name]

    # Single corridor pool shared across all hazard types — no corridor gets two hazards
    used_corridors = set()

    # ── Aliens ──
    aliens = []
    acount = 0

    alien_pool = (
        [('h', y, xs) for y, xs in h_runs if len(xs) >= 4] +
        [('v', x, ys) for x, ys in v_runs if len(ys) >= 4]
    )
    rng.shuffle(alien_pool)

    for axis, fixed, coords in alien_pool:
        if acount >= counts['aliens']:
            break
        key = corridor_key(axis, fixed, coords)
        if key in used_corridors:
            continue
        if axis == 'h':
            y, xs = fixed, coords
            if any(abs(y - AY) + abs(x - AX) < 3 for x in xs):
                continue
            if any(abs(y - BY) + abs(x - BX) < 3 for x in xs):
                continue
            route = ([{'x': x, 'y': y} for x in xs]
                     + [{'x': x, 'y': y} for x in reversed(xs[:-1])])
        else:
            x, ys = fixed, coords
            if any(abs(y - AY) + abs(x - AX) < 3 for y in ys):
                continue
            if any(abs(y - BY) + abs(x - BX) < 3 for y in ys):
                continue
            route = ([{'x': x, 'y': y} for y in ys]
                     + [{'x': x, 'y': y} for y in reversed(ys[:-1])])
        used_corridors.add(key)
        aliens.append({
            'id': f'alien{acount + 1}',
            'route': route,
            'index': 0,
            'lastStepAt': 0,
            'stepMs': 620,
        })
        acount += 1

    # ── Laser gates ──
    gates = []
    gcount = 0

    gate_pool = (
        [('h', y, xs) for y, xs in h_runs if len(xs) >= 3] +
        [('v', x, ys) for x, ys in v_runs if len(ys) >= 3]
    )
    rng.shuffle(gate_pool)

    for axis, fixed, coords in gate_pool:
        if gcount >= counts['gates']:
            break
        key = corridor_key(axis, fixed, coords)
        if key in used_corridors:
            continue
        mid = len(coords) // 2
        chunk = coords[max(0, mid - 1): mid + 2]
        tiles = (
            [{'x': c, 'y': fixed} for c in chunk] if axis == 'h'
            else [{'x': fixed, 'y': c} for c in chunk]
        )
        used_corridors.add(key)
        gates.append({
            'id': f'gate{gcount + 1}',
            'tiles': tiles,
            'cycleMs': 3000,
            'warningMs': 760,
            'activeMs': 820,
            'offsetMs': STAGGER[gcount % len(STAGGER)],
        })
        gcount += 1

    # ── Turrets ──
    turrets = []
    tcount = 0

    turret_pool = (
        [('h', y, xs) for y, xs in h_runs if len(xs) >= 5] +
        [('v', x, ys) for x, ys in v_runs if len(ys) >= 5]
    )
    rng.shuffle(turret_pool)

    for axis, fixed, coords in turret_pool:
        if tcount >= counts['turrets']:
            break
        key = corridor_key(axis, fixed, coords)
        if key in used_corridors:
            continue
        length = min(len(coords) - 1, 4)
        if axis == 'h':
            y = fixed
            # Randomly fire left or right
            if rng.choice([True, False]):
                tx, dx, dy = coords[0], 1, 0
            else:
                tx, dx, dy = coords[-1], -1, 0
            ty = y
        else:
            x = fixed
            if rng.choice([True, False]):
                ty, dx, dy = coords[0], 0, 1
            else:
                ty, dx, dy = coords[-1], 0, -1
            tx = x
        if not beam_clear(grid, tx, ty, dx, dy, length):
            continue
        used_corridors.add(key)
        turrets.append({
            'id': f'turret{tcount + 1}',
            'x': tx, 'y': ty,
            'dx': dx, 'dy': dy,
            'range': length,
            'cycleMs': 3000,
            'warningMs': 820,
            'activeMs': 520,
            'offsetMs': STAGGER[tcount % len(STAGGER)],
        })
        tcount += 1

    return aliens, gates, turrets, profile_name


# ─── BFS balance check ────────────────────────────────────────────────────────

def bfs_dist(grid, sx, sy, targets=None):
    dist = {(sx, sy): 0}
    q = deque([(sx, sy)])
    while q:
        cx, cy = q.popleft()
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = cx + dx, cy + dy
            if (nx, ny) not in dist and passable(grid, nx, ny):
                dist[(nx, ny)] = dist[(cx, cy)] + 1
                q.append((nx, ny))
    if targets:
        return {t: dist.get(t, 9999) for t in targets}
    return dist


def balance_report(grid):
    chips = [(x, y) for y in range(MAP_H) for x in range(MAP_W) if grid[y][x] == 'A']
    door  = (DOOR_X, DOOR_Y)

    alpha_dists = bfs_dist(grid, AX, AY)
    beta_dists  = bfs_dist(grid, BX, BY)

    def race_len(start_dists, chips_, door_):
        best = 9999
        for cx, cy in chips_:
            chip_d = start_dists.get((cx, cy), 9999)
            door_d = bfs_dist(grid, cx, cy, [door_])[door_]
            total  = chip_d + door_d
            if total < best:
                best = total
        return best

    a = race_len(alpha_dists, chips, door)
    b = race_len(beta_dists,  chips, door)
    return a, b


# ─── Output formatting ────────────────────────────────────────────────────────

def fmt_route(route):
    parts = ', '.join(f"{{ x: {r['x']}, y: {r['y']} }}" for r in route)
    return f'[{parts}]'


def fmt_tiles(tiles):
    parts = ', '.join(f"{{ x: {t['x']}, y: {t['y']} }}" for t in tiles)
    return f'[{parts}]'


def build_entry(map_id, grid, aliens, gates, turrets,
                sprint_par=120000, sweep_par=270000):
    sector = map_id.replace('map-', 'Sector ')
    rows_js = ',\n'.join(f"      '{''.join(row)}'" for row in grid)

    def alien_block(a):
        return (f"        {{\n"
                f"          id: '{a['id']}', route: {fmt_route(a['route'])},\n"
                f"          index: 0, lastStepAt: 0, stepMs: {a['stepMs']}\n"
                f"        }}")

    def gate_block(g):
        return (f"        {{\n"
                f"          id: '{g['id']}', tiles: {fmt_tiles(g['tiles'])},\n"
                f"          cycleMs: {g['cycleMs']}, warningMs: {g['warningMs']},"
                f" activeMs: {g['activeMs']}, offsetMs: {g['offsetMs']}\n"
                f"        }}")

    def turret_block(t):
        return (f"        {{\n"
                f"          id: '{t['id']}', x: {t['x']}, y: {t['y']},"
                f" dx: {t['dx']}, dy: {t['dy']}, range: {t['range']},\n"
                f"          cycleMs: {t['cycleMs']}, warningMs: {t['warningMs']},"
                f" activeMs: {t['activeMs']}, offsetMs: {t['offsetMs']}\n"
                f"        }}")

    aliens_str  = ',\n'.join(alien_block(a) for a in aliens)
    gates_str   = ',\n'.join(gate_block(g) for g in gates)
    turrets_str = ',\n'.join(turret_block(t) for t in turrets)

    return f"""\
  {{
    id: '{map_id}',
    soloConfig: {{
      name: '{sector}',
      sprint: {{ parMs: {sprint_par} }},
      sweep:  {{ parMs: {sweep_par} }},
    }},
    raw: [
{rows_js}
    ],
    hazards: {{
      aliens: [
{aliens_str}
      ],
      laserGates: [
{gates_str}
      ],
      turrets: [
{turrets_str}
      ]
    }}
  }}"""


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    map_id = sys.argv[1] if len(sys.argv) > 1 else 'map-07'
    seed   = int(sys.argv[2]) if len(sys.argv) > 2 else 42

    rng = random.Random(seed)
    grid = make_grid()
    place_fixed(grid)
    gen_maze(rng, grid)
    add_loops(rng, grid)
    place_fixed(grid)
    place_pickups(rng, grid)
    place_doors(rng, grid, count=4)
    aliens, gates, turrets, profile = gen_hazards(rng, grid)

    alpha_len, beta_len = balance_report(grid)

    print(f"# {map_id}  seed={seed}  profile={profile}", file=sys.stderr)
    print(f"# Balance: Alpha={alpha_len}  Beta={beta_len}  gap={abs(alpha_len-beta_len)}",
          file=sys.stderr)
    print(f"# Hazards: {len(aliens)} aliens, {len(gates)} gates, {len(turrets)} turrets",
          file=sys.stderr)
    print("# Map preview:", file=sys.stderr)
    for row in grid:
        print('#  ' + ''.join(row), file=sys.stderr)

    print(build_entry(map_id, grid, aliens, gates, turrets))


if __name__ == '__main__':
    main()
