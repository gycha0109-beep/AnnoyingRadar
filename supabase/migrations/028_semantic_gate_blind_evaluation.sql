-- Phase 15.5D: semantic complaint facts, AI Silver authority, and blind human evaluation.
-- Legacy Phase 15.5 Gold tables remain intact for history, but are not the new evaluation authority.

create table if not exists public.ar_source_signal_evaluation_sets (
  evaluation_version text primary key,
  status text not null default 'labeling',
  representative_target integer not null default 60,
  challenge_target integer not null default 60,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  locked_by uuid references auth.users(id) on delete restrict,
  locked_at timestamptz,
  constraint ar_source_signal_evaluation_sets_version_check
    check (length(trim(evaluation_version)) between 1 and 120),
  constraint ar_source_signal_evaluation_sets_status_check
    check (status in ('labeling', 'locked')),
  constraint ar_source_signal_evaluation_sets_target_check
    check (representative_target = 60 and challenge_target = 60),
  constraint ar_source_signal_evaluation_sets_lock_check
    check (
      (status = 'labeling' and locked_by is null and locked_at is null)
      or
      (status = 'locked' and locked_by is not null and locked_at is not null)
    )
);

create table if not exists public.ar_source_signal_evaluation_samples (
  id uuid primary key default gen_random_uuid(),
  evaluation_version text not null
    references public.ar_source_signal_evaluation_sets(evaluation_version)
    on delete cascade,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete cascade,
  cohort text not null,
  acquisition_bucket text,
  sample_rank integer not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  constraint ar_source_signal_evaluation_samples_cohort_check
    check (cohort in ('representative', 'challenge')),
  constraint ar_source_signal_evaluation_samples_bucket_check
    check (
      (cohort = 'representative' and acquisition_bucket is null)
      or
      (cohort = 'challenge' and acquisition_bucket in ('complaint_heavy', 'domain_friction', 'domain_neutral', 'noise'))
    ),
  constraint ar_source_signal_evaluation_samples_rank_check
    check (sample_rank between 1 and 120),
  constraint ar_source_signal_evaluation_samples_signal_unique
    unique (evaluation_version, source_signal_id),
  constraint ar_source_signal_evaluation_samples_rank_unique
    unique (evaluation_version, sample_rank)
);

create table if not exists public.ar_source_signal_human_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_version text not null,
  source_signal_id uuid not null,
  annotation_authority text not null default 'human_blind',
  problem_claim text not null,
  experience_actor text not null,
  friction_specificity text not null,
  content_kind text not null,
  evidence_quote text,
  annotator_note text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ar_source_signal_human_evaluations_sample_fk
    foreign key (evaluation_version, source_signal_id)
    references public.ar_source_signal_evaluation_samples(evaluation_version, source_signal_id)
    on delete cascade,
  constraint ar_source_signal_human_evaluations_authority_check
    check (annotation_authority = 'human_blind'),
  constraint ar_source_signal_human_evaluations_problem_check
    check (problem_claim in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_human_evaluations_actor_check
    check (experience_actor in ('self', 'other', 'generic', 'unknown', 'not_applicable')),
  constraint ar_source_signal_human_evaluations_friction_check
    check (friction_specificity in ('concrete', 'vague', 'none', 'unknown')),
  constraint ar_source_signal_human_evaluations_kind_check
    check (content_kind in ('organic', 'advertisement', 'news', 'repost', 'informational', 'unknown')),
  constraint ar_source_signal_human_evaluations_evidence_length
    check (evidence_quote is null or length(evidence_quote) between 1 and 2000),
  constraint ar_source_signal_human_evaluations_note_length
    check (annotator_note is null or length(annotator_note) <= 4000),
  constraint ar_source_signal_human_evaluations_problem_evidence_check
    check (problem_claim <> 'yes' or evidence_quote is not null),
  constraint ar_source_signal_human_evaluations_unique
    unique (evaluation_version, source_signal_id)
);

create table if not exists public.ar_source_signal_semantic_judgments (
  id uuid primary key default gen_random_uuid(),
  source_signal_id uuid not null references public.ar_source_signals(id) on delete cascade,
  semantic_version text not null,
  judge_stage text not null,
  problem_claim text not null,
  experience_actor text not null,
  friction_specificity text not null,
  content_kind text not null,
  evidence_quote text,
  prompt_version text not null,
  provider text not null,
  model_name text not null,
  provider_request_id text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  constraint ar_source_signal_semantic_judgments_version_check
    check (length(trim(semantic_version)) between 1 and 120),
  constraint ar_source_signal_semantic_judgments_stage_check
    check (judge_stage in ('primary', 'secondary')),
  constraint ar_source_signal_semantic_judgments_problem_check
    check (problem_claim in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_semantic_judgments_actor_check
    check (experience_actor in ('self', 'other', 'generic', 'unknown', 'not_applicable')),
  constraint ar_source_signal_semantic_judgments_friction_check
    check (friction_specificity in ('concrete', 'vague', 'none', 'unknown')),
  constraint ar_source_signal_semantic_judgments_kind_check
    check (content_kind in ('organic', 'advertisement', 'news', 'repost', 'informational', 'unknown')),
  constraint ar_source_signal_semantic_judgments_evidence_length
    check (evidence_quote is null or length(evidence_quote) between 1 and 2000),
  constraint ar_source_signal_semantic_judgments_problem_evidence_check
    check (problem_claim <> 'yes' or evidence_quote is not null),
  constraint ar_source_signal_semantic_judgments_token_check
    check ((input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0))
);

create table if not exists public.ar_source_signal_silver_annotations (
  id uuid primary key default gen_random_uuid(),
  source_signal_id uuid not null references public.ar_source_signals(id) on delete cascade,
  silver_version text not null,
  semantic_version text not null,
  annotation_authority text not null default 'ai_silver',
  primary_judgment_id uuid references public.ar_source_signal_semantic_judgments(id) on delete restrict,
  secondary_judgment_id uuid references public.ar_source_signal_semantic_judgments(id) on delete restrict,
  prefilter_decision text not null,
  prefilter_reason_codes text[] not null default '{}'::text[],
  problem_claim text not null,
  experience_actor text not null,
  friction_specificity text not null,
  content_kind text not null,
  evidence_quote text,
  final_decision text not null,
  system_certainty text not null,
  resolution_reason_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint ar_source_signal_silver_annotations_version_check
    check (length(trim(silver_version)) between 1 and 120),
  constraint ar_source_signal_silver_annotations_authority_check
    check (annotation_authority = 'ai_silver'),
  constraint ar_source_signal_silver_annotations_prefilter_check
    check (prefilter_decision in ('continue', 'review', 'reject')),
  constraint ar_source_signal_silver_annotations_problem_check
    check (problem_claim in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_silver_annotations_actor_check
    check (experience_actor in ('self', 'other', 'generic', 'unknown', 'not_applicable')),
  constraint ar_source_signal_silver_annotations_friction_check
    check (friction_specificity in ('concrete', 'vague', 'none', 'unknown')),
  constraint ar_source_signal_silver_annotations_kind_check
    check (content_kind in ('organic', 'advertisement', 'news', 'repost', 'informational', 'unknown')),
  constraint ar_source_signal_silver_annotations_evidence_length
    check (evidence_quote is null or length(evidence_quote) between 1 and 2000),
  constraint ar_source_signal_silver_annotations_decision_check
    check (final_decision in ('pass', 'review', 'reject')),
  constraint ar_source_signal_silver_annotations_certainty_check
    check (system_certainty in ('high', 'medium', 'low')),
  constraint ar_source_signal_silver_annotations_reasons_check
    check (cardinality(resolution_reason_codes) between 1 and 12),
  constraint ar_source_signal_silver_annotations_primary_contract
    check ((prefilter_decision = 'reject' and primary_judgment_id is null) or primary_judgment_id is not null),
  constraint ar_source_signal_silver_annotations_pass_contract
    check (
      final_decision <> 'pass'
      or (
        problem_claim = 'yes'
        and experience_actor = 'self'
        and friction_specificity = 'concrete'
        and content_kind = 'organic'
        and evidence_quote is not null
      )
    ),
  constraint ar_source_signal_silver_annotations_unique
    unique (source_signal_id, silver_version)
);

create index if not exists ar_idx_source_signal_evaluation_samples_version_rank
  on public.ar_source_signal_evaluation_samples (evaluation_version, sample_rank);
create index if not exists ar_idx_source_signal_human_evaluations_version_reviewed
  on public.ar_source_signal_human_evaluations (evaluation_version, reviewed_at);
create index if not exists ar_idx_source_signal_semantic_judgments_signal_created
  on public.ar_source_signal_semantic_judgments (source_signal_id, created_at desc);
create index if not exists ar_idx_source_signal_silver_decision_created
  on public.ar_source_signal_silver_annotations (silver_version, final_decision, created_at desc);

alter table public.ar_source_signal_evaluation_sets enable row level security;
alter table public.ar_source_signal_evaluation_samples enable row level security;
alter table public.ar_source_signal_human_evaluations enable row level security;
alter table public.ar_source_signal_semantic_judgments enable row level security;
alter table public.ar_source_signal_silver_annotations enable row level security;

revoke all on table public.ar_source_signal_evaluation_sets from public, anon, authenticated, service_role;
revoke all on table public.ar_source_signal_evaluation_samples from public, anon, authenticated, service_role;
revoke all on table public.ar_source_signal_human_evaluations from public, anon, authenticated, service_role;
revoke all on table public.ar_source_signal_semantic_judgments from public, anon, authenticated, service_role;
revoke all on table public.ar_source_signal_silver_annotations from public, anon, authenticated, service_role;

grant select on table public.ar_source_signal_evaluation_sets to service_role;
grant select on table public.ar_source_signal_evaluation_samples to service_role;
grant select, insert, update on table public.ar_source_signal_human_evaluations to service_role;
grant select, insert on table public.ar_source_signal_semantic_judgments to service_role;
grant select, insert on table public.ar_source_signal_silver_annotations to service_role;

create or replace function public.ar_validate_source_signal_evidence_quote()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_raw_text text;
begin
  if new.evidence_quote is null then
    return new;
  end if;

  select raw_text into v_raw_text
  from public.ar_source_signals
  where id = new.source_signal_id;

  if v_raw_text is null then
    raise exception 'Source Signal not found for evidence validation' using errcode = '23503';
  end if;

  if position(new.evidence_quote in v_raw_text) = 0 then
    raise exception 'evidence_quote must be an exact contiguous Source Signal excerpt' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.ar_guard_blind_evaluation_from_ai()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.ar_source_signal_evaluation_samples sample
    join public.ar_source_signal_evaluation_sets eval_set
      on eval_set.evaluation_version = sample.evaluation_version
    where sample.source_signal_id = new.source_signal_id
      and eval_set.status = 'labeling'
  ) then
    raise exception 'Blind evaluation Source Signal cannot receive AI labels before evaluation lock'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.ar_guard_locked_human_evaluation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.ar_source_signal_evaluation_sets
  where evaluation_version = new.evaluation_version;

  if v_status = 'locked' then
    raise exception 'Locked blind human evaluation is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.ar_create_source_signal_evaluation_set(
  p_evaluation_version text,
  p_created_by uuid,
  p_samples jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_representative integer;
  v_challenge integer;
  v_complaint integer;
  v_friction integer;
  v_neutral integer;
  v_noise integer;
begin
  if exists (
    select 1 from public.ar_source_signal_evaluation_sets
    where evaluation_version = p_evaluation_version
  ) then
    raise exception 'Evaluation set already exists' using errcode = '23505';
  end if;

  select count(*),
         count(*) filter (where cohort = 'representative'),
         count(*) filter (where cohort = 'challenge'),
         count(*) filter (where acquisition_bucket = 'complaint_heavy'),
         count(*) filter (where acquisition_bucket = 'domain_friction'),
         count(*) filter (where acquisition_bucket = 'domain_neutral'),
         count(*) filter (where acquisition_bucket = 'noise')
    into v_total, v_representative, v_challenge, v_complaint, v_friction, v_neutral, v_noise
  from jsonb_to_recordset(p_samples)
    as sample(source_signal_id uuid, cohort text, acquisition_bucket text, sample_rank integer);

  if v_total <> 120 or v_representative <> 60 or v_challenge <> 60
     or v_complaint <> 15 or v_friction <> 20 or v_neutral <> 10 or v_noise <> 15 then
    raise exception 'Evaluation sample contract must be 60 representative + 60 challenge (15/20/10/15)'
      using errcode = '23514';
  end if;

  insert into public.ar_source_signal_evaluation_sets (
    evaluation_version, status, representative_target, challenge_target, created_by
  ) values (p_evaluation_version, 'labeling', 60, 60, p_created_by);

  insert into public.ar_source_signal_evaluation_samples (
    evaluation_version, source_signal_id, cohort, acquisition_bucket, sample_rank, assigned_by
  )
  select p_evaluation_version,
         sample.source_signal_id,
         sample.cohort,
         sample.acquisition_bucket,
         sample.sample_rank,
         p_created_by
  from jsonb_to_recordset(p_samples)
    as sample(source_signal_id uuid, cohort text, acquisition_bucket text, sample_rank integer);
end;
$$;

create or replace function public.ar_lock_source_signal_evaluation_set(
  p_evaluation_version text,
  p_locked_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sample_count integer;
  v_label_count integer;
begin
  select count(*) into v_sample_count
  from public.ar_source_signal_evaluation_samples
  where evaluation_version = p_evaluation_version;

  select count(*) into v_label_count
  from public.ar_source_signal_human_evaluations
  where evaluation_version = p_evaluation_version;

  if v_sample_count <> 120 or v_label_count <> 120 then
    raise exception 'Blind evaluation requires all 120 human labels before lock' using errcode = '23514';
  end if;

  update public.ar_source_signal_evaluation_sets
  set status = 'locked', locked_by = p_locked_by, locked_at = now()
  where evaluation_version = p_evaluation_version and status = 'labeling';

  if not found then
    raise exception 'Evaluation set is missing or already locked' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.ar_validate_source_signal_evidence_quote() from public, anon, authenticated;
revoke all on function public.ar_guard_blind_evaluation_from_ai() from public, anon, authenticated;
revoke all on function public.ar_guard_locked_human_evaluation() from public, anon, authenticated;
revoke all on function public.ar_create_source_signal_evaluation_set(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ar_lock_source_signal_evaluation_set(text, uuid) from public, anon, authenticated;
grant execute on function public.ar_validate_source_signal_evidence_quote() to service_role;
grant execute on function public.ar_guard_blind_evaluation_from_ai() to service_role;
grant execute on function public.ar_guard_locked_human_evaluation() to service_role;
grant execute on function public.ar_create_source_signal_evaluation_set(text, uuid, jsonb) to service_role;
grant execute on function public.ar_lock_source_signal_evaluation_set(text, uuid) to service_role;

drop trigger if exists ar_trg_human_evaluation_evidence on public.ar_source_signal_human_evaluations;
create trigger ar_trg_human_evaluation_evidence
before insert or update of evidence_quote, source_signal_id
on public.ar_source_signal_human_evaluations
for each row execute function public.ar_validate_source_signal_evidence_quote();

drop trigger if exists ar_trg_semantic_judgment_evidence on public.ar_source_signal_semantic_judgments;
create trigger ar_trg_semantic_judgment_evidence
before insert or update of evidence_quote, source_signal_id
on public.ar_source_signal_semantic_judgments
for each row execute function public.ar_validate_source_signal_evidence_quote();

drop trigger if exists ar_trg_silver_evidence on public.ar_source_signal_silver_annotations;
create trigger ar_trg_silver_evidence
before insert or update of evidence_quote, source_signal_id
on public.ar_source_signal_silver_annotations
for each row execute function public.ar_validate_source_signal_evidence_quote();

drop trigger if exists ar_trg_semantic_judgment_blind_guard on public.ar_source_signal_semantic_judgments;
create trigger ar_trg_semantic_judgment_blind_guard
before insert on public.ar_source_signal_semantic_judgments
for each row execute function public.ar_guard_blind_evaluation_from_ai();

drop trigger if exists ar_trg_silver_blind_guard on public.ar_source_signal_silver_annotations;
create trigger ar_trg_silver_blind_guard
before insert on public.ar_source_signal_silver_annotations
for each row execute function public.ar_guard_blind_evaluation_from_ai();

drop trigger if exists ar_trg_human_evaluation_lock_guard on public.ar_source_signal_human_evaluations;
create trigger ar_trg_human_evaluation_lock_guard
before insert or update on public.ar_source_signal_human_evaluations
for each row execute function public.ar_guard_locked_human_evaluation();

drop trigger if exists ar_trg_human_evaluation_updated_at on public.ar_source_signal_human_evaluations;
create trigger ar_trg_human_evaluation_updated_at
before update on public.ar_source_signal_human_evaluations
for each row execute function public.ar_set_updated_at();
