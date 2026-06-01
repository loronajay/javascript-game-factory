# Card Game Digital Rules Scope

This packet captures the current paper rules for the card game as a digital reference. It is not a redesign document. It is a structured rules capture meant to support later video game implementation.

The game currently uses premade 60-card decks. Deck building is intentionally deferred until the engine is working with at least two premade decks.

## Document Map

- `01_core_game_rules.md` - player HP, deck setup, draw rules, hand limit, win/loss.
- `02_card_types.md` - monsters, accessories, Later cards.
- `03_zones_and_visibility.md` - deck, hand, monster board, attached cards, active Later cards, graveyard visibility.
- `04_turn_structure_and_stars.md` - turn sequence, 5-star economy, delayed star costs, unused-star penalty.
- `05_monsters_combat_and_damage.md` - summoning, attacks, targeting, overflow, death, damage persistence.
- `06_effect_system_requirements.md` - abilities, passives, interrupts, triggers, durations, hidden-zone effects.
- `07_digital_data_model_first_pass.md` - first-pass TypeScript-style shapes for the eventual engine.
- `08_open_questions_and_deferred_scope.md` - unresolved or deferred items.
- `09_card_digitization_and_engine_plan.md` - paper-card transcription workflow, validation plan, and engine milestones.
