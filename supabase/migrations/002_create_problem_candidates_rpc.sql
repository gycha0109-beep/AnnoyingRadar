-- 002_create_problem_candidates_rpc_v1.1.sql
-- 어노잉 레이더 v0.1 Candidate 생성 RPC
-- 기존 랭킹위키 Supabase 프로젝트 안에 임시 탑승하는 전제
-- 모든 어노잉 레이더 리소스에는 ar_ prefix를 붙인다.
--
-- 전제:
-- - 001_init_annoying_radar.sql 이 먼저 실행되어 있어야 한다.
-- - ar_raw_inputs
-- - ar_pain_evidences
-- - ar_problem_candidates
-- - ar_problem_evidence_links
-- 위 4개 테이블과 검증 trigger가 존재해야 한다.
--
-- 목적:
-- Candidate 생성 + Link 생성 + evidence_count 저장 + analysis_status 변경을
-- 하나의 Postgres 함수 안에서 처리한다.
--
-- 서버 API Route는 candidate insert와 link insert를 분리 실행하지 않고,
-- 이 RPC만 호출해야 한다.

create or replace function public.ar_create_problem_candidates_from_grouping(
  p_raw_input_id uuid,
  p_user_id uuid,
  p_candidates_json jsonb
)
returns setof public.ar_problem_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_input_status text;
  v_candidate jsonb;
  v_candidate_id uuid;
  v_evidence_id uuid;
  v_evidence_count integer;
  v_inserted_candidate_ids uuid[] := array[]::uuid[];
begin
  -- =======================================================
  -- 1. 입력 JSON 검증
  -- =======================================================

  if p_candidates_json is null then
    raise exception 'p_candidates_json is required'
      using errcode = '22004';
  end if;

  if jsonb_typeof(p_candidates_json) <> 'array' then
    raise exception 'p_candidates_json must be a jsonb array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_candidates_json) = 0 then
    raise exception 'p_candidates_json must contain at least one candidate'
      using errcode = '22023';
  end if;

  -- =======================================================
  -- 2. Raw Input 소유권 및 상태 검증
  --    FOR UPDATE로 동일 Raw Input에 대한 동시 그룹핑을 막는다.
  -- =======================================================

  select analysis_status
    into v_raw_input_status
  from public.ar_raw_inputs
  where id = p_raw_input_id
    and user_id = p_user_id
  for update;

  if v_raw_input_status is null then
    raise exception 'ar_raw_input not found or not owned: %', p_raw_input_id
      using errcode = '42501';
  end if;

  if v_raw_input_status not in ('grouping', 'grouping_failed') then
    raise exception 'invalid analysis_status for candidate grouping: %', v_raw_input_status
      using errcode = '23514';
  end if;

  -- =======================================================
  -- 3. Candidate JSON 구조 및 Evidence 유효성 사전 검증
  --    여기서 먼저 전부 검증한 뒤 기존 draft를 삭제한다.
  -- =======================================================

  for v_candidate in
    select value
    from jsonb_array_elements(p_candidates_json)
  loop
    if nullif(trim(coalesce(v_candidate->>'title', '')), '') is null then
      raise exception 'candidate.title is required'
        using errcode = '23514';
    end if;

    if (v_candidate ? 'evidence_ids') is false
      or jsonb_typeof(v_candidate->'evidence_ids') <> 'array'
      or jsonb_array_length(v_candidate->'evidence_ids') = 0
    then
      raise exception 'candidate.evidence_ids must contain at least one evidence id'
        using errcode = '23514';
    end if;

    for v_evidence_id in
      select value::text::uuid
      from jsonb_array_elements_text(v_candidate->'evidence_ids')
    loop
      if not exists (
        select 1
        from public.ar_pain_evidences pe
        where pe.id = v_evidence_id
          and pe.user_id = p_user_id
          and pe.raw_input_id = p_raw_input_id
          and pe.status = 'confirmed'
      ) then
        raise exception 'invalid confirmed evidence id for grouping: %', v_evidence_id
          using errcode = '23514';
      end if;
    end loop;
  end loop;

  -- =======================================================
  -- 4. 기존 draft Candidate 정리
  --    confirmed Candidate는 삭제하지 않는다.
  --    discarded Candidate도 기본적으로 유지한다.
  --    FK on delete cascade로 기존 draft link도 같이 정리된다.
  -- =======================================================

  delete from public.ar_problem_candidates pc
  where pc.raw_input_id = p_raw_input_id
    and pc.user_id = p_user_id
    and pc.status = 'draft';

  -- =======================================================
  -- 5. Candidate 및 Link 생성
  -- =======================================================

  for v_candidate in
    select value
    from jsonb_array_elements(p_candidates_json)
  loop
    select count(distinct value::text::uuid)
      into v_evidence_count
    from jsonb_array_elements_text(v_candidate->'evidence_ids');

    insert into public.ar_problem_candidates (
      user_id,
      raw_input_id,
      title,
      summary,
      target_user,
      situation,
      evidence_count,
      intensity_level,
      repeat_pattern_level,
      clarity_level,
      status,
      order_index
    )
    values (
      p_user_id,
      p_raw_input_id,
      trim(v_candidate->>'title'),
      nullif(trim(coalesce(v_candidate->>'summary', '')), ''),
      nullif(trim(coalesce(v_candidate->>'target_user', '')), ''),
      nullif(trim(coalesce(v_candidate->>'situation', '')), ''),
      v_evidence_count,
      nullif(trim(coalesce(v_candidate->>'intensity_level', '')), ''),
      nullif(trim(coalesce(v_candidate->>'repeat_pattern_level', '')), ''),
      nullif(trim(coalesce(v_candidate->>'clarity_level', '')), ''),
      'draft',
      nullif(trim(coalesce(v_candidate->>'order_index', '')), '')::integer
    )
    returning id into v_candidate_id;

    v_inserted_candidate_ids := array_append(v_inserted_candidate_ids, v_candidate_id);

    for v_evidence_id in
      select distinct value::text::uuid
      from jsonb_array_elements_text(v_candidate->'evidence_ids')
    loop
      insert into public.ar_problem_evidence_links (
        problem_candidate_id,
        pain_evidence_id
      )
      values (
        v_candidate_id,
        v_evidence_id
      );
    end loop;
  end loop;

  -- =======================================================
  -- 6. Raw Input 상태 변경
  -- =======================================================

  update public.ar_raw_inputs
  set analysis_status = 'reviewing_candidates'
  where id = p_raw_input_id
    and user_id = p_user_id;

  -- =======================================================
  -- 7. 생성된 Candidate 반환
  -- =======================================================

  return query
  select pc.*
  from public.ar_problem_candidates pc
  where pc.id = any(v_inserted_candidate_ids)
  order by pc.order_index asc nulls last, pc.created_at asc;

end;
$$;

-- =========================================================
-- 권한
-- =========================================================
-- v0.1 권장 구조는 서버 API Route + service role 호출이다.
-- service role은 RLS를 우회하므로 서버 API에서 requireUser()와 owner 검증을 반드시 수행한다.
--
-- authenticated에 직접 execute를 열지 않는다.
-- 필요 시 서버 구조에 맞춰 별도 grant를 검토한다.

revoke all on function public.ar_create_problem_candidates_from_grouping(uuid, uuid, jsonb)
from public;

revoke all on function public.ar_create_problem_candidates_from_grouping(uuid, uuid, jsonb)
from anon;

revoke all on function public.ar_create_problem_candidates_from_grouping(uuid, uuid, jsonb)
from authenticated;

-- service role 서버 API에서만 RPC를 호출할 수 있게 명시적으로 허용한다.
-- Supabase service role은 RLS를 우회하지만, 함수 execute 권한은 별도로 필요할 수 있다.
grant execute on function public.ar_create_problem_candidates_from_grouping(uuid, uuid, jsonb)
to service_role;

-- 중요:
-- 이 RPC 내부에서 오류가 발생하면 전체 함수 실행이 rollback된다.
-- 따라서 실패 시 raw_inputs.analysis_status = 'grouping_failed' 변경은
-- 서버 API Route의 catch 블록에서 별도 update로 처리한다.
--
-- 권장 API 실패 처리:
-- 1. RPC 호출
-- 2. RPC 실패 catch
-- 3. 같은 raw_input_id/user_id에 대해 ar_raw_inputs.analysis_status = 'grouping_failed'
-- 4. 500 또는 502 반환

-- =========================================================
-- 사용 예시
-- =========================================================
-- 서버 API Route에서 service role client로 호출:
--
-- select *
-- from public.ar_create_problem_candidates_from_grouping(
--   'RAW_INPUT_UUID'::uuid,
--   'USER_UUID'::uuid,
--   '[
--     {
--       "title": "추천 이유를 신뢰하기 어렵다",
--       "summary": "사용자는 추천 결과가 왜 자신에게 맞는지 이해하기 어렵다.",
--       "target_user": "화장품 추천 앱 사용자",
--       "situation": "AI 추천 결과를 확인할 때",
--       "evidence_ids": ["EVIDENCE_UUID_1", "EVIDENCE_UUID_2"],
--       "intensity_level": "medium",
--       "repeat_pattern_level": "moderate",
--       "clarity_level": "clear",
--       "order_index": 0
--     }
--   ]'::jsonb
-- );
--
-- =========================================================
-- 확인용 Query
-- =========================================================
-- select routine_name
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name = 'ar_create_problem_candidates_from_grouping';
