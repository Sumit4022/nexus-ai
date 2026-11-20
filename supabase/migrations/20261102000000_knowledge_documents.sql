create table if not exists public.knowledge_documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 255),
    mime_type text not null,
    content text not null,
    created_at timestamptz not null default now()
);

create index if not exists knowledge_documents_user_created_idx
    on public.knowledge_documents (user_id, created_at desc);

alter table public.knowledge_documents enable row level security;

drop policy if exists "Users manage their own knowledge documents" on public.knowledge_documents;
create policy "Users manage their own knowledge documents"
    on public.knowledge_documents
    for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, delete on public.knowledge_documents to authenticated;
