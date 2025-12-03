begin;

create extension if not exists "pgcrypto";

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  guest_id text,
  created_at timestamptz not null default now(),
  title text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_id_created_at
  on messages (conversation_id, created_at);

create table if not exists model_invocations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id) on delete set null,
  provider text not null,
  model text not null,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(10, 6),
  created_at timestamptz not null default now()
);

commit;
