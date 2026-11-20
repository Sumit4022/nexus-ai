-- Older installations may already have these tables without the unique keys
-- required by save_agent_conversation's ON CONFLICT clauses. Validate before
-- creating indexes so existing rows are never removed or rewritten.
do $migration$
begin
    if exists (
        select 1
        from public.workspaces
        group by user_id
        having count(*) > 1
    ) then
        raise exception 'Cannot add the workspace user index: duplicate user_id values exist in public.workspaces.';
    end if;

    if exists (
        select 1
        from public.conversations
        group by id
        having count(*) > 1
    ) then
        raise exception 'Cannot add the conversation id index: duplicate id values exist in public.conversations.';
    end if;

    create unique index if not exists workspaces_user_id_unique_idx
        on public.workspaces (user_id);
    create unique index if not exists conversations_id_unique_idx
        on public.conversations (id);
end;
$migration$;

notify pgrst, 'reload schema';
