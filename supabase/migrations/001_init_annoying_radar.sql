-- 001_init_annoying_radar_v1.1.sql
-- 어노잉 레이더 v0.1 초기 DB 스키마
-- 기존 랭킹위키 Supabase 프로젝트 안에 임시 탑승하는 전제
-- 모든 어노잉 레이더 리소스에는 ar_ prefix를 붙인다.
--
-- 포함 범위:
-- 1. ar_raw_inputs
-- 2. ar_pain_evidences
-- 3. ar_problem_candidates
-- 4. ar_problem_evidence_links
-- 5. raw_input owner 검증 trigger
-- 6. candidate/evidence link 검증 trigger
-- 7. updated_at trigger
-- 8. indexes
-- 9. RLS select policy
--
-- v0.1에서 만들지 않는 것:
-- - problem_cards table
-- - research_projects table
-- - idea_candidates table
-- - reports table

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. ar_raw_inputs
-- =========================================================

create table if not exists public.ar_raw_inputs (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  raw_text text not null,
  source_type text,
  source_url text,
  source_memo text,
  language text,

  analysis_status text not null default 'input_saved',
  content_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_raw_inputs_raw_text_not_empty
    check (length(trim(raw_text)) > 0),

  constraint ar_raw_inputs_analysis_status_check
    check (analysis_status in (
      'idle',
      'input_saved',
      'extracting',
      'extraction_failed',
      'reviewing_evidence',
      'grouping',
      'grouping_failed',
      'reviewing_candidates',
      'completed'
    ))
);

-- =========================================================
-- 2. ar_pain_evidences
-- =========================================================

create table if not exists public.ar_pain_evidences (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  raw_input_id uuid not null
    references public.ar_raw_inputs(id)
    on delete cascade,

  original_text text not null,
  summary_ko text,
  pain_type text,
  target_user text,
  situation text,
  sentiment_level text,
  intensity_level text,

  source_type text,
  source_url text,
  source_memo text,

  status text not null default 'draft',
  order_index integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_pain_evidences_original_text_not_empty
    check (length(trim(original_text)) > 0),

  constraint ar_pain_evidences_status_check
    check (status in ('draft', 'confirmed', 'deleted')),

  constraint ar_pain_evidences_sentiment_level_check
    check (
      sentiment_level is null
      or sentiment_level in ('negative', 'mixed', 'neutral', 'unknown')
    ),

  constraint ar_pain_evidences_intensity_level_check
    check (
      intensity_level is null
      or intensity_level in ('low', 'medium', 'high', 'unknown')
    ),

  constraint ar_pain_evidences_order_index_check
    check (order_index is null or order_index >= 0)
);

-- =========================================================
-- 3. ar_problem_candidates
-- =========================================================

create table if not exists public.ar_problem_candidates (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  raw_input_id uuid not null
    references public.ar_raw_inputs(id)
    on delete cascade,

  title text not null,
  summary text,
  target_user text,
  situation text,

  evidence_count integer not null default 0,
  intensity_level text,
  repeat_pattern_level text,
  clarity_level text,

  status text not null default 'draft',
  discard_reason text,
  order_index integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_problem_candidates_title_not_empty
    check (length(trim(title)) > 0),

  constraint ar_problem_candidates_status_check
    check (status in ('draft', 'confirmed', 'discarded')),

  constraint ar_problem_candidates_evidence_count_check
    check (evidence_count >= 0),

  constraint ar_problem_candidates_confirmed_has_evidence_check
    check (
      status != 'confirmed'
      or evidence_count >= 1
    ),

  constraint ar_problem_candidates_intensity_level_check
    check (
      intensity_level is null
      or intensity_level in ('low', 'medium', 'high', 'unknown')
    ),

  constraint ar_problem_candidates_repeat_pattern_level_check
    check (
      repeat_pattern_level is null
      or repeat_pattern_level in ('weak', 'moderate', 'strong', 'unknown')
    ),

  constraint ar_problem_candidates_clarity_level_check
    check (
      clarity_level is null
      or clarity_level in ('unclear', 'partial', 'clear', 'unknown')
    ),

  constraint ar_problem_candidates_order_index_check
    check (order_index is null or order_index >= 0)
);

-- =========================================================
-- 4. ar_problem_evidence_links
-- =========================================================

create table if not exists public.ar_problem_evidence_links (
  id uuid primary key default gen_random_uuid(),

  problem_candidate_id uuid not null
    references public.ar_problem_candidates(id)
    on delete cascade,

  pain_evidence_id uuid not null
    references public.ar_pain_evidences(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  constraint ar_problem_evidence_links_unique_pair
    unique (problem_candidate_id, pain_evidence_id)
);

-- =========================================================
-- 5. Raw Input Owner 검증 Trigger
--    Evidence/Candidate의 user_id는 연결된 Raw Input의 user_id와 반드시 같아야 한다.
-- =========================================================

create or replace function public.ar_validate_pain_evidence_raw_input_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  raw_input_user_id uuid;
begin
  select user_id
    into raw_input_user_id
  from public.ar_raw_inputs
  where id = new.raw_input_id;

  if raw_input_user_id is null then
    raise exception 'ar_raw_input not found: %', new.raw_input_id
      using errcode = '23503';
  end if;

  if raw_input_user_id <> new.user_id then
    raise exception 'ar_pain_evidence.user_id must match ar_raw_inputs.user_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ar_trg_validate_pain_evidence_raw_input_owner
on public.ar_pain_evidences;

create trigger ar_trg_validate_pain_evidence_raw_input_owner
before insert or update of user_id, raw_input_id on public.ar_pain_evidences
for each row
execute function public.ar_validate_pain_evidence_raw_input_owner();


create or replace function public.ar_validate_problem_candidate_raw_input_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  raw_input_user_id uuid;
begin
  select user_id
    into raw_input_user_id
  from public.ar_raw_inputs
  where id = new.raw_input_id;

  if raw_input_user_id is null then
    raise exception 'ar_raw_input not found: %', new.raw_input_id
      using errcode = '23503';
  end if;

  if raw_input_user_id <> new.user_id then
    raise exception 'ar_problem_candidate.user_id must match ar_raw_inputs.user_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ar_trg_validate_problem_candidate_raw_input_owner
on public.ar_problem_candidates;

create trigger ar_trg_validate_problem_candidate_raw_input_owner
before insert or update of user_id, raw_input_id on public.ar_problem_candidates
for each row
execute function public.ar_validate_problem_candidate_raw_input_owner();

-- =========================================================
-- 6. Candidate/Evidence Link 관계 검증 Trigger
--    Candidate와 Evidence는 반드시 같은 user_id, 같은 raw_input_id 안에서만 연결된다.
-- =========================================================

create or replace function public.ar_validate_problem_evidence_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate_user_id uuid;
  candidate_raw_input_id uuid;
  evidence_user_id uuid;
  evidence_raw_input_id uuid;
begin
  select user_id, raw_input_id
    into candidate_user_id, candidate_raw_input_id
  from public.ar_problem_candidates
  where id = new.problem_candidate_id;

  select user_id, raw_input_id
    into evidence_user_id, evidence_raw_input_id
  from public.ar_pain_evidences
  where id = new.pain_evidence_id;

  if candidate_user_id is null then
    raise exception 'ar_problem_candidate not found: %', new.problem_candidate_id
      using errcode = '23503';
  end if;

  if evidence_user_id is null then
    raise exception 'ar_pain_evidence not found: %', new.pain_evidence_id
      using errcode = '23503';
  end if;

  if candidate_user_id <> evidence_user_id then
    raise exception 'ar_problem_candidate and ar_pain_evidence must belong to the same user'
      using errcode = '23514';
  end if;

  if candidate_raw_input_id <> evidence_raw_input_id then
    raise exception 'ar_problem_candidate and ar_pain_evidence must belong to the same raw_input'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ar_trg_validate_problem_evidence_link
on public.ar_problem_evidence_links;

create trigger ar_trg_validate_problem_evidence_link
before insert or update of problem_candidate_id, pain_evidence_id on public.ar_problem_evidence_links
for each row
execute function public.ar_validate_problem_evidence_link();

-- =========================================================
-- 7. updated_at 공통 Trigger
-- =========================================================

create or replace function public.ar_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ar_trg_raw_inputs_updated_at
on public.ar_raw_inputs;

create trigger ar_trg_raw_inputs_updated_at
before update on public.ar_raw_inputs
for each row
execute function public.ar_set_updated_at();

drop trigger if exists ar_trg_pain_evidences_updated_at
on public.ar_pain_evidences;

create trigger ar_trg_pain_evidences_updated_at
before update on public.ar_pain_evidences
for each row
execute function public.ar_set_updated_at();

drop trigger if exists ar_trg_problem_candidates_updated_at
on public.ar_problem_candidates;

create trigger ar_trg_problem_candidates_updated_at
before update on public.ar_problem_candidates
for each row
execute function public.ar_set_updated_at();

-- =========================================================
-- 8. Indexes
-- =========================================================

create index if not exists ar_idx_raw_inputs_user_id
  on public.ar_raw_inputs (user_id);

create index if not exists ar_idx_raw_inputs_user_created_at
  on public.ar_raw_inputs (user_id, created_at desc);

create index if not exists ar_idx_raw_inputs_user_updated_at
  on public.ar_raw_inputs (user_id, updated_at desc);

create index if not exists ar_idx_raw_inputs_user_analysis_status
  on public.ar_raw_inputs (user_id, analysis_status);

create index if not exists ar_idx_raw_inputs_user_content_hash
  on public.ar_raw_inputs (user_id, content_hash);

create index if not exists ar_idx_pain_evidences_user_id
  on public.ar_pain_evidences (user_id);

create index if not exists ar_idx_pain_evidences_raw_input_id
  on public.ar_pain_evidences (raw_input_id);

create index if not exists ar_idx_pain_evidences_user_raw_input
  on public.ar_pain_evidences (user_id, raw_input_id);

create index if not exists ar_idx_pain_evidences_user_raw_input_status
  on public.ar_pain_evidences (user_id, raw_input_id, status);

create index if not exists ar_idx_pain_evidences_user_status
  on public.ar_pain_evidences (user_id, status);

create index if not exists ar_idx_pain_evidences_pain_type
  on public.ar_pain_evidences (pain_type);

create index if not exists ar_idx_pain_evidences_intensity_level
  on public.ar_pain_evidences (intensity_level);

create index if not exists ar_idx_problem_candidates_user_id
  on public.ar_problem_candidates (user_id);

create index if not exists ar_idx_problem_candidates_raw_input_id
  on public.ar_problem_candidates (raw_input_id);

create index if not exists ar_idx_problem_candidates_user_raw_input
  on public.ar_problem_candidates (user_id, raw_input_id);

create index if not exists ar_idx_problem_candidates_user_raw_input_status
  on public.ar_problem_candidates (user_id, raw_input_id, status);

create index if not exists ar_idx_problem_candidates_user_status
  on public.ar_problem_candidates (user_id, status);

create index if not exists ar_idx_problem_candidates_intensity_level
  on public.ar_problem_candidates (intensity_level);

create index if not exists ar_idx_problem_candidates_clarity_level
  on public.ar_problem_candidates (clarity_level);

create index if not exists ar_idx_problem_candidates_user_created_at
  on public.ar_problem_candidates (user_id, created_at desc);

create index if not exists ar_idx_problem_evidence_links_candidate_id
  on public.ar_problem_evidence_links (problem_candidate_id);

create index if not exists ar_idx_problem_evidence_links_evidence_id
  on public.ar_problem_evidence_links (pain_evidence_id);

-- =========================================================
-- 9. RLS
--    v0.1에서는 client direct write를 허용하지 않는다.
--    select는 자기 데이터만 허용한다.
--    insert/update/delete는 서버 API Route + service role에서만 수행한다.
-- =========================================================

alter table public.ar_raw_inputs enable row level security;
alter table public.ar_pain_evidences enable row level security;
alter table public.ar_problem_candidates enable row level security;
alter table public.ar_problem_evidence_links enable row level security;

drop policy if exists ar_users_can_read_own_raw_inputs
on public.ar_raw_inputs;

create policy ar_users_can_read_own_raw_inputs
on public.ar_raw_inputs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists ar_users_can_read_own_pain_evidences
on public.ar_pain_evidences;

create policy ar_users_can_read_own_pain_evidences
on public.ar_pain_evidences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists ar_users_can_read_own_problem_candidates
on public.ar_problem_candidates;

create policy ar_users_can_read_own_problem_candidates
on public.ar_problem_candidates
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists ar_users_can_read_own_problem_evidence_links
on public.ar_problem_evidence_links;

create policy ar_users_can_read_own_problem_evidence_links
on public.ar_problem_evidence_links
for select
to authenticated
using (
  exists (
    select 1
    from public.ar_problem_candidates pc
    where pc.id = ar_problem_evidence_links.problem_candidate_id
      and pc.user_id = auth.uid()
  )
);

-- =========================================================
-- 10. 생성 확인용 Query
-- =========================================================
-- 아래 쿼리는 실행 후 별도로 확인할 때 사용한다.
--
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'ar_raw_inputs',
--     'ar_pain_evidences',
--     'ar_problem_candidates',
--     'ar_problem_evidence_links'
--   )
-- order by table_name;
--
-- select routine_name
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in (
--     'ar_validate_pain_evidence_raw_input_owner',
--     'ar_validate_problem_candidate_raw_input_owner',
--     'ar_validate_problem_evidence_link',
--     'ar_set_updated_at'
--   )
-- order by routine_name;
--
-- 다음 단계:
-- 002_create_problem_candidates_rpc.sql
