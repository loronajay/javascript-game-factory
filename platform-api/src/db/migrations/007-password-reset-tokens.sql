create table if not exists password_reset_tokens (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_email on password_reset_tokens (email);
