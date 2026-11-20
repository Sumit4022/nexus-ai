alter table public.conversations
    add column if not exists metadata jsonb not null default '{}'::jsonb;
