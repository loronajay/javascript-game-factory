-- Ranked liveness heartbeats.
--
-- Closes the "both clients lost the socket" hole. The relay tears the room down when
-- one peer drops, so a player whose machine dies takes their opponent's connection
-- with them: neither client can attest, the match sits `playing` until the 6h TTL
-- voids it, and a game that plainly had a winner produces no rating and no history.
--
-- A client claim ("they disconnected, I win") cannot fix this — a player who is
-- losing would pull their cable and claim the same thing, turning an earned win into
-- a `disputed` no-op. So liveness is measured by the server instead: each client
-- posts a heartbeat while it is in a live ranked match, and keeps posting through its
-- own disconnect screen. Whoever is still reporting when the other has gone silent
-- wins by forfeit. A cable-puller stops reporting too, so they still lose; a relay
-- outage leaves both sides reporting, so the match honestly voids.

alter table ranked_matches add column if not exists heartbeat_a timestamptz;
alter table ranked_matches add column if not exists heartbeat_b timestamptz;

-- The liveness sweep scans live matches for one stale side.
create index if not exists ranked_matches_liveness
  on ranked_matches (game_slug, status, heartbeat_a, heartbeat_b);
