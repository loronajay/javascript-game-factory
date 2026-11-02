-- Existing listings remain in the mainland exchange. Escrow, ownership and balances are untouched.
alter table farm_market_listings add column if not exists region_id text not null default 'mainland';
create index if not exists farm_market_listings_region_open
  on farm_market_listings (region_id, created_at desc) where status = 'open';
