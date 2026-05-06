# Planning Docs

This folder collects cross-cutting plans and handoff documents for the shared platform.

## What is here

- architecture and cutover handoffs
- migration plans
- feature rollout notes
- bug tracking notes
- implementation plans for shared platform work

## Working guidance

- Use this folder for multi-surface planning that spans pages, frontend modules, and the API.
- Keep per-game design source of truth inside the relevant game folder instead of here.
- Prefer updating an existing plan when it is still active rather than creating near-duplicate handoff files.
- For architecture continuity after a context clear, start with `ARCHITECTURE_HANDOFF.md`, then `TYPESCRIPT_MIGRATION_PLAN.md`, then the relevant product plan or bug doc.
