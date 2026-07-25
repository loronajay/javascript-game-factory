-- Ladder reads rank every rated player within one game_slug. The primary key on
-- game_ratings is (player_id, game_slug), which does not serve a per-game ordered
-- scan, so the board and placement queries would sort the whole table per request.
-- This index matches the shared ladder ordering (rating desc, win differential, player_id).
create index if not exists game_ratings_ladder_idx
  on game_ratings (game_slug, rating desc, (wins - losses) desc, player_id asc);
