create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references players(player_id) on delete cascade,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_accounts_email on accounts (email);
create index if not exists idx_accounts_player_id on accounts (player_id);
