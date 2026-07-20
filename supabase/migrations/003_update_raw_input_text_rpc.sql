-- 003_update_raw_input_text_rpc.sql
-- Annoying Radar v0.1 Raw Input text update cleanup RPC.
--
-- This keeps raw_text update, candidate/link cleanup, evidence deletion,
-- analysis_status reset, and content_hash update in one database transaction.

create or replace function public.ar_update_raw_input_text(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_raw_text text,
  p_content_hash text,
  p_source_type text default null,
  p_source_url text default null,
  p_source_memo text default null,
  p_language text default null
)
returns public.ar_raw_inputs
language plpgsql
set search_path = public
as $$
declare
  v_analysis_status text;
  v_candidate_ids uuid[];
  v_result public.ar_raw_inputs%rowtype;
begin
  if p_raw_input_id is null then
    raise exception 'p_raw_input_id is required'
      using errcode = '22004';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required'
      using errcode = '22004';
  end if;

  if p_raw_text is null or length(trim(p_raw_text)) = 0 then
    raise exception 'p_raw_text is required'
      using errcode = '23514';
  end if;

  select analysis_status
    into v_analysis_status
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if v_analysis_status is null then
    raise exception 'ar_raw_input not found or not owned: %', p_raw_input_id
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.ar_problem_candidates pc
    where pc.raw_input_id = p_raw_input_id
      and pc.user_id = p_user_id
      and pc.status = 'confirmed'
  ) then
    raise exception 'confirmed candidate exists for raw_input: %', p_raw_input_id
      using errcode = '23514';
  end if;

  if v_analysis_status not in (
    'input_saved',
    'extraction_failed',
    'reviewing_evidence',
    'grouping_failed',
    'reviewing_candidates'
  ) then
    raise exception 'invalid analysis_status for raw_text update: %', v_analysis_status
      using errcode = '23514';
  end if;

  select coalesce(array_agg(pc.id), array[]::uuid[])
    into v_candidate_ids
  from public.ar_problem_candidates pc
  where pc.raw_input_id = p_raw_input_id
    and pc.user_id = p_user_id
    and pc.status in ('draft', 'discarded');

  if cardinality(v_candidate_ids) > 0 then
    delete from public.ar_problem_evidence_links pel
    where pel.problem_candidate_id = any(v_candidate_ids);

    delete from public.ar_problem_candidates pc
    where pc.id = any(v_candidate_ids);
  end if;

  update public.ar_pain_evidences pe
  set status = 'deleted'
  where pe.raw_input_id = p_raw_input_id
    and pe.user_id = p_user_id
    and pe.status <> 'deleted';

  update public.ar_raw_inputs ri
  set
    raw_text = p_raw_text,
    analysis_status = 'input_saved',
    content_hash = p_content_hash
  where ri.id = p_raw_input_id
    and ri.user_id = p_user_id
  returning *
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.ar_update_raw_input_text(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
)
from public;

revoke all on function public.ar_update_raw_input_text(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
)
from anon;

revoke all on function public.ar_update_raw_input_text(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
)
from authenticated;

grant execute on function public.ar_update_raw_input_text(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
)
to service_role;
