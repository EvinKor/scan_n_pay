-- Run this in your Supabase SQL Editor

-- Sessions table
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  data jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Index for code lookup
create index if not exists sessions_code_idx on sessions (code);

-- Enable Realtime on sessions table
-- (do this in Supabase dashboard: Database → Replication → sessions → enable)

-- Row Level Security — public read/write for MVP (no auth)
alter table sessions enable row level security;

create policy "Allow public read" on sessions for select using (true);
create policy "Allow public insert" on sessions for insert with check (true);
create policy "Allow public update" on sessions for update using (true);

-- Optional: auto-delete sessions older than 24 hours
-- create extension if not exists pg_cron;
-- select cron.schedule('cleanup-old-sessions', '0 * * * *',
--   $$delete from sessions where created_at < now() - interval '24 hours'$$
-- );
