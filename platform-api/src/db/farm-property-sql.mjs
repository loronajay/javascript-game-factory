/** Internal SQL only: callers supply a fixed parameter placeholder, never user input. */
export function activeFarmPropertySql(playerParameter) {
    return `coalesce((select garage->>'lot' from game_loadouts where player_id = ${playerParameter} and game_slug = 'farm'), 'meadow')`;
}
