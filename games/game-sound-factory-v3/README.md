# Game Sound Factory v3

Version 3 preserves the v2 hybrid audio engine and reorganizes the editor around a pseudo file browser.

## Immediate test

Open:

```text
standalone.html
```

The five supplied reference WAVs are embedded into the standalone file.

## Main v3 changes

- Fixed-height desktop application shell
- No full-page scrolling during normal desktop use
- Persistent Render WAV buttons in:
  - Top toolbar
  - Selected-file inspector
  - Mobile bottom action dock
- `Alt+R` render shortcut
- Pseudo filesystem:
  - Banks are top-level folders
  - Categories are subfolders
  - Patches are named sound files
- Breadcrumb path display
- Folder and file counts
- Search within the active folder
- Grid and list views
- Sort by name, category, or bank
- Editable rendered WAV filename
- Output filenames persist locally per patch
- Selected folder, selected patch, and view mode persist locally
- Custom duplicates appear under the `Custom` bank
- Original v2 engine, hybrid patches, raw references, retro bank, JSON editing, and WAV rendering remain intact

## Library structure

```text
Sound Library/
├── Mini-Tactics Hybrid/
│   ├── Board/
│   ├── Medic/
│   ├── Ranger/
│   ├── Status/
│   ├── Tank/
│   └── Warrior/
├── Reference Files/
│   └── Reference/
├── Retro / Arcade/
│   ├── Biological Nonsense/
│   ├── General/
│   ├── Mini-Tactics Retro/
│   └── Sci-Fi/
└── Custom/
```

The `Custom` bank appears after duplicating a patch.

## Rendering

1. Select a sound file.
2. Tune variation, pitch, and physical roles.
3. Set the desired output filename.
4. Press any visible `Render WAV` button or use `Alt+R`.

The WAV uses the current editor patch and current mixer settings.
