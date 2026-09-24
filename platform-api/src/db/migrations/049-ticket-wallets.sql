-- Factory-wide soft currency. Wallet ownership belongs to the platform player,
-- never to one cabinet. Every mutation has a unique transaction key so retries
-- and repeated result reports cannot mint twice.

create table if not exists ticket_wallets (
  player_id  text        primary key references players(player_id) on delete cascade,
  balance    int         not null default 5000 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_transactions (
  transaction_id bigserial   primary key,
  player_id      text        not null references players(player_id) on delete cascade,
  transaction_key text       not null,
  amount          int        not null check (amount <> 0),
  reason          text       not null,
  metadata        jsonb      not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (player_id, transaction_key)
);

create index if not exists ticket_transactions_player_history
  on ticket_transactions (player_id, created_at desc, transaction_id desc);

-- Existing accounts receive the same welcome grant as accounts first seen after
-- this migration. The unique transaction key is the durable exactly-once fence.
insert into ticket_wallets (player_id, balance)
select player_id, 5000 from players
on conflict (player_id) do nothing;

insert into ticket_transactions (player_id, transaction_key, amount, reason)
select player_id, 'welcome', 5000, 'welcome_grant' from ticket_wallets
on conflict (player_id, transaction_key) do nothing;
