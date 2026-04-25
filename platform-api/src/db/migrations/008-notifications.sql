create table if not exists notifications (
  id text primary key,
  recipient_player_id text not null,
  actor_player_id text not null default '',
  actor_display_name text not null default '',
  type text not null,
  status text not null default 'unread',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient
  on notifications (recipient_player_id, created_at desc);

create table if not exists friend_requests (
  id text primary key,
  from_player_id text not null,
  to_player_id text not null,
  from_display_name text not null default '',
  status text not null default 'pending',
  notification_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_friend_requests_pending_pair
  on friend_requests (from_player_id, to_player_id)
  where status = 'pending';

create index if not exists idx_friend_requests_to
  on friend_requests (to_player_id, created_at desc);
