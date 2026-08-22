-- Physical calendar preorders.
--
-- Digital fulfillment (game_progress_claims + game_inventory_items) already records that a
-- player was paid their bonus, but it cannot ship anything: it holds no name, no address and
-- no fulfillment state. This table is the shipping record, and it is deliberately separate
-- from the entitlement ledger -- one is a promise to a courier, the other a promise to an
-- account.

create table if not exists calendar_orders (
  order_id               text        primary key,
  player_id              text        not null,
  game_slug              text        not null default 'yam-bowling',
  product_id             text        not null default 'yam-bowling-2027-calendar',

  -- Payment linkage. checkout_session_id is the idempotency key for fulfillment; the
  -- payment intent is the join key refund and dispute webhooks arrive with.
  checkout_session_id    text        not null default '',
  payment_intent_id      text        not null default '',

  quantity               int         not null default 1 check (quantity >= 1),
  unit_amount_cents      int         not null default 0 check (unit_amount_cents >= 0),
  shipping_amount_cents  int         not null default 0 check (shipping_amount_cents >= 0),
  tax_amount_cents       int         not null default 0 check (tax_amount_cents >= 0),
  total_amount_cents     int         not null default 0 check (total_amount_cents >= 0),
  currency               text        not null default 'usd',

  customer_name          text        not null default '',
  customer_email         text        not null default '',
  shipping_address       jsonb       not null default '{}'::jsonb,

  -- pending | paid | refunded | cancelled
  payment_state          text        not null default 'pending',
  -- preorder | paid | production | ready_to_ship | shipped | delivered | cancelled | refunded
  fulfillment_state      text        not null default 'preorder',
  tracking_number        text        not null default '',
  carrier                text        not null default '',

  -- pending | granted | already_held | revoked
  voucher_bonus_state    text        not null default 'pending',
  voucher_bonus_claim_id text        not null default '',
  voucher_bonus_quantity int         not null default 0 check (voucher_bonus_quantity >= 0),

  admin_note             text        not null default '',
  created_at             timestamptz not null default now(),
  paid_at                timestamptz,
  shipped_at             timestamptz,
  updated_at             timestamptz not null default now()
);

-- One order per checkout session. This is what makes repeated webhook delivery and a
-- refreshed return page converge on the same row instead of shipping two calendars.
create unique index if not exists calendar_orders_session_key
  on calendar_orders (checkout_session_id)
  where checkout_session_id <> '';

create index if not exists calendar_orders_player_idx
  on calendar_orders (player_id, created_at desc);

create index if not exists calendar_orders_fulfillment_idx
  on calendar_orders (payment_state, fulfillment_state, created_at desc);

create index if not exists calendar_orders_payment_intent_idx
  on calendar_orders (payment_intent_id)
  where payment_intent_id <> '';
