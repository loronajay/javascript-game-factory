-- Broadcast bookkeeping for events, matching 033 for bulletins.
--
-- Same once-only marker, claimed the same conditional way. The difference is which states
-- qualify: events have no draft, so the claim is gated on `scheduled` or `live` rather than
-- on published+public. `completed` and `cancelled` never announce — telling everyone about
-- an event they can no longer attend is noise, and `cancelled` doubles as the staging state
-- an operator can create in quietly before flipping to `scheduled`.
alter table arcade_events add column if not exists announced_at timestamptz;
