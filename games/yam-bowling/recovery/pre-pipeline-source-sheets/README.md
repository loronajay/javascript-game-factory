# Pre-pipeline pose-sheet recovery

This directory preserves the original 1536 x 1024 six-pose sheets that existed
before background removal and pose-cell rebuilding damaged the checked-in
masters.

- `assets/characters/skins/*/halloween/source.png`: 28 opaque ImageGen outputs
  recovered from the local Codex task image store for task
  `01a00ea9-543d-78c1-ae80-c779536a5bfe` (`Add Halloween bowler skins`).
- `assets/characters/skins/*/maid/source.png`: all 30 opaque ImageGen outputs
  recovered from the local Codex task image store for task
  `01a004d0-93cf-70b0-8d8c-7c4bfcf6d7d6` (`Add Maid Cafe bowler skins`).
  Daisy Monroe, Nia Brooks, Tessa Quinn, Zuri Banks, and Carmen Blaze use the
  corrected originals that superseded their earlier drafts in that task.
- `MANIFEST.tsv`: destination, provenance, source identifier, byte size, and
  Git blob hash for every recovered file.

The Halloween and Maid Cafe files intentionally retain their painted
white/light-gray backgrounds. They are the pre-segmentation originals. Do not run
`prepare_keyed_skin_source.py --in-place` on the only copy; process into a new
destination and validate the result with `tools/check_pose_sheet.py`.

Daisy Monroe and Lumi Vega are not duplicated here because their checked-in
Halloween masters already pass the pose-sheet verifier. The staged set is the
exact missing Halloween inventory: 28 sheets.

The requested Echo Sterling, Nia Brooks, and Reina Sato swimsuit originals were
not present in the Codex generated-image stores, session image snapshots, other
Dad Games copies, or archives. Git commit `b49eb9e1` contains versions of those
three files, but `tools/check_pose_sheet.py` rejects all three; they are not
included here to prevent accidental adoption as recovered masters.
