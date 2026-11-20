create or replace function public.save_agent_conversation(
    p_conversation_id uuid,
    p_title text,
    p_agent_type text,
    p_messages jsonb,
    p_metadata jsonb default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $function$
declare
    v_user_id uuid := auth.uid();
    v_workspace_id uuid;
    v_now timestamptz := clock_timestamp();
    v_rows_updated integer;
begin
    if v_user_id is null then
        raise exception using errcode = '42501', message = 'Authentication required';
    end if;

    if jsonb_typeof(p_messages) <> 'array' then
        raise exception using errcode = '22023', message = 'Messages must be a JSON array';
    end if;

    insert into public.workspaces (user_id, name)
    values (v_user_id, 'My Workspace')
    on conflict (user_id) do nothing;

    select id into v_workspace_id
    from public.workspaces
    where user_id = v_user_id;

    insert into public.conversations (
        id, workspace_id, user_id, title, agent_type, metadata, updated_at
    ) values (
        p_conversation_id,
        v_workspace_id,
        v_user_id,
        p_title,
        p_agent_type,
        coalesce(p_metadata, '{}'::jsonb),
        v_now
    )
    on conflict (id) do update set
        workspace_id = excluded.workspace_id,
        title = excluded.title,
        agent_type = excluded.agent_type,
        metadata = coalesce(p_metadata, public.conversations.metadata),
        updated_at = v_now
    where public.conversations.user_id = v_user_id;

    get diagnostics v_rows_updated = row_count;
    if v_rows_updated = 0 then
        raise exception using errcode = '42501', message = 'Conversation could not be saved';
    end if;

    delete from public.messages
    where conversation_id = p_conversation_id
      and user_id = v_user_id;

    insert into public.messages (
        conversation_id, user_id, role, content, context, created_at
    )
    select
        p_conversation_id,
        v_user_id,
        message.value ->> 'role',
        message.value ->> 'content',
        nullif(message.value ->> 'context', ''),
        v_now + (message.ordinality * interval '1 microsecond')
    from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality);
end;
$function$;

revoke all on function public.save_agent_conversation(uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.save_agent_conversation(uuid, text, text, jsonb, jsonb) to authenticated;

create or replace function public.nexus_ai_storage_status()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
    select jsonb_build_object(
        'chatHistoryReady',
            to_regclass('public.workspaces') is not null
            and exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'conversations' and column_name = 'metadata'
            )
            and exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'messages' and column_name = 'content'
            ),
        'attachmentContextReady', exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'messages' and column_name = 'context'
        ),
        'documentsReady', to_regclass('public.knowledge_documents') is not null,
        'atomicSaveReady', coalesce(
            has_function_privilege(
                current_user,
                to_regprocedure('public.save_agent_conversation(uuid,text,text,jsonb,jsonb)')::oid,
                'EXECUTE'
            ),
            false
        )
    );
$function$;

revoke all on function public.nexus_ai_storage_status() from public;
grant execute on function public.nexus_ai_storage_status() to authenticated;
