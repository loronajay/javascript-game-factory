alter table accounts
  add column if not exists current_session_id text not null default '';

create index if not exists idx_accounts_current_session
  on accounts (player_id, current_session_id);
