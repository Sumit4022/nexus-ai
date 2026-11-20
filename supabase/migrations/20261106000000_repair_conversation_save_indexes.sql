-- Repair legacy deployments where an index with the expected name exists but
-- is not unique. save_agent_conversation uses ON CONFLICT on both columns.
-- Refuse to remove or rewrite any rows if duplicates would prevent the repair.
do $migration$
declare
    v_index_is_correct boolean;
begin
    if exists (
        select 1 from public.workspaces
        group by user_id
        having count(*) > 1
    ) then
        raise exception 'Cannot repair chat saves: duplicate workspace user_id values exist. No rows were changed.';
    end if;

    if exists (
        select 1 from public.conversations
        group by id
        having count(*) > 1
    ) then
        raise exception 'Cannot repair chat saves: duplicate conversation id values exist. No rows were changed.';
    end if;

    select index_data.indisunique
           and index_data.indnkeyatts = 1
           and index_data.indkey[0] = column_data.attnum
      into v_index_is_correct
      from pg_index as index_data
      join pg_attribute as column_data
        on column_data.attrelid = index_data.indrelid
       and column_data.attname = 'user_id'
       and column_data.attnum > 0
       and not column_data.attisdropped
     where index_data.indexrelid = to_regclass('public.workspaces_user_id_unique_idx')
       and index_data.indrelid = to_regclass('public.workspaces');

    if v_index_is_correct is distinct from true then
        drop index if exists public.workspaces_user_id_unique_idx;
    end if;

    select index_data.indisunique
           and index_data.indnkeyatts = 1
           and index_data.indkey[0] = column_data.attnum
      into v_index_is_correct
      from pg_index as index_data
      join pg_attribute as column_data
        on column_data.attrelid = index_data.indrelid
       and column_data.attname = 'id'
       and column_data.attnum > 0
       and not column_data.attisdropped
     where index_data.indexrelid = to_regclass('public.conversations_id_unique_idx')
       and index_data.indrelid = to_regclass('public.conversations');

    if v_index_is_correct is distinct from true then
        drop index if exists public.conversations_id_unique_idx;
    end if;

    create unique index if not exists workspaces_user_id_unique_idx
        on public.workspaces (user_id);
    create unique index if not exists conversations_id_unique_idx
        on public.conversations (id);
end;
$migration$;

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
        'knowledgeSearchReady',
            exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'knowledge_documents' and column_name = 'search_vector'
            )
            and to_regprocedure('public.search_knowledge_documents(text,integer)') is not null,
        'atomicSaveReady', coalesce(
            has_function_privilege(
                current_user,
                to_regprocedure('public.save_agent_conversation(uuid,text,text,jsonb,jsonb)')::oid,
                'EXECUTE'
            ),
            false
        )
        and exists (
            select 1 from pg_index as index_data
            join pg_attribute as column_data
              on column_data.attrelid = index_data.indrelid
             and column_data.attname = 'user_id'
             and column_data.attnum > 0
             and not column_data.attisdropped
            where index_data.indexrelid = to_regclass('public.workspaces_user_id_unique_idx')
              and index_data.indrelid = to_regclass('public.workspaces')
              and index_data.indisunique
              and index_data.indnkeyatts = 1
              and index_data.indkey[0] = column_data.attnum
        )
        and exists (
            select 1 from pg_index as index_data
            join pg_attribute as column_data
              on column_data.attrelid = index_data.indrelid
             and column_data.attname = 'id'
             and column_data.attnum > 0
             and not column_data.attisdropped
            where index_data.indexrelid = to_regclass('public.conversations_id_unique_idx')
              and index_data.indrelid = to_regclass('public.conversations')
              and index_data.indisunique
              and index_data.indnkeyatts = 1
              and index_data.indkey[0] = column_data.attnum
        )
    );
$function$;

revoke all on function public.nexus_ai_storage_status() from public;
grant execute on function public.nexus_ai_storage_status() to authenticated;
notify pgrst, 'reload schema';
