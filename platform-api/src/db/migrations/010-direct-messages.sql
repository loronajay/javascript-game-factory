create table if not exists conversations (
  id text primary key,
  player_a_id text not null,
  player_b_id text not null,
  last_message_at timestamptz not null default now(),
  unread_count_a int not null default 0,
  unread_count_b int not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_conversations_pair unique (player_a_id, player_b_id)
);

create index if not exists idx_conversations_a
  on conversations (player_a_id, last_message_at desc);

create index if not exists idx_conversations_b
  on conversations (player_b_id, last_message_at desc);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  from_player_id text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conv
  on messages (conversation_id, created_at asc);
