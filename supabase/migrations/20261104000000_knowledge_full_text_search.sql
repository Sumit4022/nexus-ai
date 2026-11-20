alter table public.knowledge_documents
    add column if not exists search_vector tsvector
    generated always as (
        setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'B')
    ) stored;

create index if not exists knowledge_documents_search_vector_idx
    on public.knowledge_documents using gin (search_vector);

create or replace function public.search_knowledge_documents(
    p_query text,
    p_limit integer default 5
)
returns table (
    id uuid,
    name text,
    content text,
    score real
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
    v_user_id uuid := auth.uid();
    v_query tsquery;
    v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 10);
begin
    if v_user_id is null then
        raise exception using errcode = '42501', message = 'Authentication required';
    end if;

    if p_query is null or char_length(trim(p_query)) = 0 then
        raise exception using errcode = '22023', message = 'A search query is required';
    end if;

    v_query := websearch_to_tsquery('simple', p_query);
    if numnode(v_query) = 0 then
        return;
    end if;

    return query
    select
        document.id,
        document.name,
        document.content,
        ts_rank_cd(document.search_vector, v_query) as score
    from public.knowledge_documents as document
    where document.user_id = v_user_id
      and document.search_vector @@ v_query
    order by ts_rank_cd(document.search_vector, v_query) desc, document.created_at desc
    limit v_limit;
end;
$function$;

revoke all on function public.search_knowledge_documents(text, integer) from public;
grant execute on function public.search_knowledge_documents(text, integer) to authenticated;

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
    );
$function$;

revoke all on function public.nexus_ai_storage_status() from public;
grant execute on function public.nexus_ai_storage_status() to authenticated;
