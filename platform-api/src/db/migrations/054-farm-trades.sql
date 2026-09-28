-- Player trading on the Farm (services/farm-trade-policy.mts, db/farm-trades.mts).
--
-- One row per trade table, from the invitation to its end. The columns are what
-- the server needs to find a trade (who is at it, whether it is still live,
-- when it completed for the daily limit); `state` is the whole table as the
-- policy describes it: both offers, locks, confirmations, the revision every
-- lock and confirm must name, and an audit trail of every move. A completed
-- row is the permanent record of what crossed between the two farms.

create table if not exists farm_trades (
  id            text        primary key,
  initiator_id  text        not null,
  partner_id    text        not null,
  status        text        not null,
  state         jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists farm_trades_live_initiator
  on farm_trades (initiator_id) where status in ('invited', 'open');
create index if not exists farm_trades_live_partner
  on farm_trades (partner_id) where status in ('invited', 'open');
create index if not exists farm_trades_by_initiator
  on farm_trades (initiator_id, created_at desc);
create index if not exists farm_trades_completed_initiator
  on farm_trades (initiator_id, completed_at) where status = 'completed';
create index if not exists farm_trades_completed_partner
  on farm_trades (partner_id, completed_at) where status = 'completed';
