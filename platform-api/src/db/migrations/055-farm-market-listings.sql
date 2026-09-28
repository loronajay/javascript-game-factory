-- The Market Square's Exchange Board (services/farm-listing-policy.mts,
-- db/farm-listings.mts): players list server-minted goods for tickets and
-- anyone else buys them outright.
--
-- A listing row holds its goods in escrow: they left the seller's farm when it
-- went up and go back only when it is withdrawn (or taken down after it
-- expired). `quantity` is what is still for sale; `listed_quantity` what was
-- put up. An open row whose `expires_at` has passed reads as expired and
-- cannot be bought.
--
-- A sale row is the permanent record of one purchase — who, what, the price,
-- the Market's fee (burned) and the seller's proceeds — and the source of the
-- daily caps. `(buyer_id, purchase_id)` makes a purchase retry-safe.

create table if not exists farm_market_listings (
  listing_id      text        primary key,
  seller_id       text        not null,
  seller_name     text        not null default '',
  stack           text        not null,
  item_id         text        not null,
  quantity        integer     not null check (quantity >= 0),
  listed_quantity integer     not null check (listed_quantity > 0),
  unit_price      integer     not null check (unit_price > 0),
  status          text        not null default 'open',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  closed_at       timestamptz
);

create index if not exists farm_market_listings_open
  on farm_market_listings (created_at desc) where status = 'open';
create index if not exists farm_market_listings_seller
  on farm_market_listings (seller_id, status, created_at desc);

create table if not exists farm_market_listing_sales (
  buyer_id     text        not null,
  purchase_id  text        not null,
  listing_id   text        not null references farm_market_listings (listing_id),
  seller_id    text        not null,
  stack        text        not null,
  item_id      text        not null,
  quantity     integer     not null check (quantity > 0),
  unit_price   integer     not null check (unit_price > 0),
  total        integer     not null,
  fee          integer     not null,
  proceeds     integer     not null,
  created_at   timestamptz not null default now(),
  primary key (buyer_id, purchase_id)
);

create index if not exists farm_market_listing_sales_buyer
  on farm_market_listing_sales (buyer_id, created_at);
create index if not exists farm_market_listing_sales_seller
  on farm_market_listing_sales (seller_id, created_at);
