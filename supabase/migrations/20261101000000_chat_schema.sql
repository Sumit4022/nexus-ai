create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    name text not null default 'My Workspace',
    created_at timestamptz not null default now()
);

create table if not exists public.conversations (
    id uuid primary key,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null default 'New Conversation',
    agent_type text not null check (agent_type in ('coding', 'pdf', 'research', 'knowledge')),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    created_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);
create unique index if not exists workspaces_user_id_unique_idx on public.workspaces (user_id);
create unique index if not exists conversations_id_unique_idx on public.conversations (id);

alter table public.workspaces enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Users manage their own workspace" on public.workspaces;
create policy "Users manage their own workspace" on public.workspaces for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their own conversations" on public.conversations;
create policy "Users manage their own conversations" on public.conversations for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their own messages" on public.messages;
create policy "Users manage their own messages" on public.messages for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
