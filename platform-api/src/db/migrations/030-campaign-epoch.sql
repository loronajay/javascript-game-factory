-- Fencing token for campaign resets.
--
-- Every other kind of play progress a client syncs is monotone: missions get cleared,
-- stars go up, tutorials get completed. That is what lets the client merges be plain
-- forward-only unions, and why two devices playing at different rates converge instead
-- of fighting — neither can walk the other backwards.
--
-- Campaign reset is the one operation that moves BACKWARD, and a union cannot express
-- it. Before this column, resetting on one device was silently undone by any other
-- device that still had the old campaign cached: its next sync unioned the old missions
-- straight back in.
--
-- campaign_epoch only ever increments, once per reset. Clients store the epoch they are
-- on; a server epoch ahead of theirs means "a reset happened somewhere else", and they
-- replace their campaign state instead of merging it. Claims carry the epoch they were
-- built under, so a claim queued before a reset can be recognized as stale and dropped
-- rather than resurrecting the progress the player deliberately cleared.
--
-- Existing rows start at 0, which is also what a claim with no epoch is read as, so
-- nothing already recorded is treated as stale.

alter table game_progress_profiles
  add column if not exists campaign_epoch integer not null default 0;
