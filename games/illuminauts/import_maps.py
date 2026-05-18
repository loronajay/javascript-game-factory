#!/usr/bin/env python3
"""
import_maps.py — syncs .txt files from maps/ into scripts/maps.js.

Slug rule: map_04.txt  →  id 'map-04'  (underscores become hyphens, no extension)
Dedup:     skips any file whose derived id already appears in maps.js.
Run from the illuminauts directory:  python import_maps.py

Metadata header (optional, place before the tile rows):
  name: Sector 04
  sprint_par: 120000
  sweep_par: 270000

Defaults if omitted:  name = map id,  sprint_par = 120000,  sweep_par = 270000
"""

import re
import sys
from pathlib import Path

HERE     = Path(__file__).parent
MAPS_DIR = HERE / 'maps'
MAPS_JS  = HERE / 'scripts' / 'maps.js'

MAP_W = 35
MAP_H = 27
VALID_CHARS = set('.#SABPDTKB')


# ── Helpers ───────────────────────────────────────────────────────────────────

def slug(path: Path) -> str:
    return path.stem


def existing_ids(js_text: str) -> set:
    return set(re.findall(r"id:\s*'([^']+)'", js_text))


def parse_txt(path: Path) -> tuple[list[str], dict]:
    """
    Return (rows, meta) where rows is the 27 tile strings and meta holds
    name/sprint_par/sweep_par parsed from optional header lines.

    Accepts:
      - plain unquoted rows (one row per line)
      - quoted rows: 'row...' or "row..."
      - full maps.js entry pasted in (extra quoted strings filtered by width)
    """
    text = path.read_text(encoding='utf-8')

    # Parse metadata from key: value lines (won't be MAP_W chars wide)
    meta = {}
    for line in text.splitlines():
        m = re.match(r'^\s*(name|sprint_par|sweep_par)\s*:\s*(.+)', line)
        if m:
            meta[m.group(1).strip()] = m.group(2).strip()

    # Try quoted strings first (handles editor export and raw-array copy)
    pattern = r"'([^']{" + str(MAP_W) + r"})'|\"([^\"]{" + str(MAP_W) + r"})\""
    matches = re.findall(pattern, text)
    rows = [a or b for a, b in matches]

    # Fall back to bare lines of exactly MAP_W chars
    if not rows:
        rows = [ln.rstrip('\r\n') for ln in text.splitlines() if len(ln.rstrip('\r\n')) == MAP_W]

    if len(rows) != MAP_H:
        raise ValueError(f"expected {MAP_H} rows of width {MAP_W}, found {len(rows)}")

    for i, row in enumerate(rows):
        bad = [ch for ch in row if ch not in VALID_CHARS]
        if bad:
            raise ValueError(f"row {i}: unknown char(s) {bad!r}")

    return rows, meta


def format_entry(map_id: str, rows: list[str], meta: dict) -> str:
    name       = meta.get('name', map_id)
    sprint_par = int(meta.get('sprint_par', 120000))
    sweep_par  = int(meta.get('sweep_par',  270000))

    raw_lines = ',\n'.join(f"      '{r}'" for r in rows)
    return (
        f"  {{\n"
        f"    id: '{map_id}',\n"
        f"    soloConfig: {{\n"
        f"      name: '{name}',\n"
        f"      sprint: {{ parMs: {sprint_par} }},\n"
        f"      sweep:  {{ parMs: {sweep_par} }},\n"
        f"    }},\n"
        f"    raw: [\n"
        f"{raw_lines}\n"
        f"    ],\n"
        f"    hazards: {{\n"
        f"      aliens: [],\n"
        f"      laserGates: [],\n"
        f"      turrets: []\n"
        f"    }}\n"
        f"  }}"
    )


def insert_entry(js_text: str, entry: str) -> str:
    """Append an entry before the closing ]; of the MAPS array."""
    stripped = js_text.rstrip()
    if not stripped.endswith('];'):
        raise RuntimeError("maps.js does not end with '];' — check the file manually.")
    return stripped[:-2] + ',\n\n' + entry + '\n];\n'


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not MAPS_DIR.is_dir():
        print(f"ERROR: maps folder not found at {MAPS_DIR}")
        sys.exit(1)

    js_text = MAPS_JS.read_text(encoding='utf-8')
    ids = existing_ids(js_text)

    txt_files = sorted(MAPS_DIR.glob('*.txt'))
    if not txt_files:
        print("No .txt files found in maps/.")
        return

    added, skipped, errors = [], [], []

    for path in txt_files:
        map_id = slug(path)

        if map_id in ids:
            skipped.append(map_id)
            continue

        try:
            rows, meta = parse_txt(path)
            entry = format_entry(map_id, rows, meta)
            js_text = insert_entry(js_text, entry)
            ids.add(map_id)
            added.append(map_id)
        except (ValueError, RuntimeError) as e:
            errors.append(f"{path.name}: {e}")

    if added:
        MAPS_JS.write_text(js_text, encoding='utf-8')
        print(f"Added:   {', '.join(added)}")

    if skipped:
        print(f"Skipped (already in maps.js): {', '.join(skipped)}")

    if errors:
        print("Errors:")
        for msg in errors:
            print(f"  {msg}")

    if not added and not errors:
        print("Nothing new to add.")


if __name__ == '__main__':
    main()
