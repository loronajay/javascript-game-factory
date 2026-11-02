/** A public directory of island homesteads; returns the same owner identity as a public farm visit. */
export async function getFarmResidents(pool, input) {
    if (input?.region !== "orchard-isle")
        return { residents: [] };
    const after = typeof input?.after === "string" ? input.after.slice(0, 120) : "";
    const result = await pool.query(`
    select e.player_id, coalesce(nullif(p.profile_name, ''), 'An island farmer') as name
    from game_entitlements e
    join game_loadouts l on l.player_id = e.player_id and l.game_slug = 'farm'
    left join player_profiles p on p.player_id = e.player_id
    where e.game_slug = 'farm' and e.entitlement_id = 'lot.orchard' and e.player_id > $1
      and (l.garage->>'lot' = 'lot.orchard' or l.garage->'properties' ? 'lot.orchard')
    order by e.player_id limit 51`, [after]);
    const rows = result.rows ?? [];
    return { residents: rows.slice(0, 50).map((row) => ({ playerId: row.player_id, name: row.name, propertyId: "lot.orchard" })),
        next: rows.length > 50 ? rows[49].player_id : null };
}
