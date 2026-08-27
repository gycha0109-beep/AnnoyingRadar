-- Phase 15.9N: durable, private, append-only Formation assessment authority.
-- This table stores structured Formation output and integrity metadata only.
-- It intentionally does not store full source bodies, canonical URLs, author handles,
-- provider request IDs, or the raw evidence quote.

create table public.ar_source_formation_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_schema_version text not null,
  assessment_batch_version text not null,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete restrict,
  source_admission_outcome_id uuid not null
    references public.ar_source_full_context_resolution_outcomes(id)
    on delete restrict,
  source_admission_outcome_schema_version text not null,
  source_admission_batch_version text not null,

  assessment_version text not null,
  observer_version text not null,
  formation_version text not null,
  status text not null,
  formation_state text not null,
  resolved boolean not null,
  reason_codes text[] not null,

  problem_claim text,
  experience_actor text,
  friction_specificity text,
  pain_centrality text,
  content_kind text,
  source_origin text,
  friction_responsibility text,

  evidence_quote_sha256 text,
  evidence_quote_char_count integer not null default 0,
  evidence_quote_start integer,
  evidence_quote_end integer,
  evidence_quote_grounded boolean not null default false,

  problem_mechanism_proposal text,
  incident_summary_proposal text,

  context_status text not null,
  context_scope text not null,
  context_content_sha256 text not null,
  context_char_count integer not null,
  context_truncated boolean not null default false,
  context_extraction_scope text,

  prompt_version text not null,
  provider text not null,
  model_name text not null,

  recovery_version text,
  recovery_attempted boolean not null default false,
  recovery_recovered boolean not null default false,
  recovery_attempt_count integer not null default 0,
  recovery_trigger_reason_code text,

  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint ar_source_formation_assessments_schema_version_check
    check (length(trim(assessment_schema_version)) between 1 and 120),
  constraint ar_source_formation_assessments_batch_version_check
    check (length(trim(assessment_batch_version)) between 1 and 160),
  constraint ar_source_formation_assessments_admission_schema_check
    check (length(trim(source_admission_outcome_schema_version)) between 1 and 120),
  constraint ar_source_formation_assessments_admission_batch_check
    check (length(trim(source_admission_batch_version)) between 1 and 160),
  constraint ar_source_formation_assessments_assessment_version_check
    check (length(trim(assessment_version)) between 1 and 120),
  constraint ar_source_formation_assessments_observer_version_check
    check (length(trim(observer_version)) between 1 and 120),
  constraint ar_source_formation_assessments_formation_version_check
    check (length(trim(formation_version)) between 1 and 120),
  constraint ar_source_formation_assessments_status_check
    check (status in ('resolved', 'unresolved')),
  constraint ar_source_formation_assessments_state_check
    check (formation_state in ('eligible', 'provenance_review', 'review', 'reject')),
  constraint ar_source_formation_assessments_status_state_check
    check (
      (
        status = 'resolved'
        and resolved = true
        and formation_state in ('eligible', 'provenance_review', 'reject')
      )
      or
      (
        status = 'unresolved'
        and resolved = false
        and formation_state = 'review'
      )
    ),
  constraint ar_source_formation_assessments_reasons_check
    check (cardinality(reason_codes) between 1 and 12),

  constraint ar_source_formation_assessments_problem_claim_check
    check (problem_claim is null or problem_claim in ('yes', 'no', 'unclear')),
  constraint ar_source_formation_assessments_actor_check
    check (experience_actor is null or experience_actor in ('self', 'specific_other', 'reported_population', 'generic', 'unknown')),
  constraint ar_source_formation_assessments_specificity_check
    check (friction_specificity is null or friction_specificity in ('concrete', 'vague', 'none', 'unknown')),
  constraint ar_source_formation_assessments_centrality_check
    check (pain_centrality is null or pain_centrality in ('central', 'incidental', 'unclear')),
  constraint ar_source_formation_assessments_kind_check
    check (content_kind is null or content_kind in ('organic', 'news', 'repost', 'informational', 'advertisement', 'unknown')),
  constraint ar_source_formation_assessments_origin_check
    check (source_origin is null or source_origin in ('original', 'derivative', 'unknown')),
  constraint ar_source_formation_assessments_responsibility_check
    check (friction_responsibility is null or friction_responsibility in ('external_service_or_product', 'external_process_or_policy', 'structural_system', 'contractual_term', 'self_caused', 'natural_event_only', 'mixed', 'unknown')),
  constraint ar_source_formation_assessments_semantic_shape_check
    check (
      num_nonnulls(
        problem_claim,
        experience_actor,
        friction_specificity,
        pain_centrality,
        content_kind,
        source_origin,
        friction_responsibility
      ) in (0, 7)
    ),
  constraint ar_source_formation_assessments_resolved_semantic_check
    check (
      status <> 'resolved'
      or num_nonnulls(
        problem_claim,
        experience_actor,
        friction_specificity,
        pain_centrality,
        content_kind,
        source_origin,
        friction_responsibility
      ) = 7
    ),

  constraint ar_source_formation_assessments_quote_hash_check
    check (evidence_quote_sha256 is null or evidence_quote_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ar_source_formation_assessments_quote_contract
    check (
      (
        evidence_quote_sha256 is null
        and evidence_quote_char_count = 0
        and evidence_quote_start is null
        and evidence_quote_end is null
        and evidence_quote_grounded = false
      )
      or
      (
        evidence_quote_sha256 is not null
        and evidence_quote_char_count > 0
        and evidence_quote_start is not null
        and evidence_quote_start >= 0
        and evidence_quote_end is not null
        and evidence_quote_end > evidence_quote_start
        and evidence_quote_end - evidence_quote_start = evidence_quote_char_count
        and evidence_quote_grounded = true
      )
    ),
  constraint ar_source_formation_assessments_mechanism_proposal_check
    check (problem_mechanism_proposal is null or char_length(problem_mechanism_proposal) between 1 and 240),
  constraint ar_source_formation_assessments_incident_proposal_check
    check (incident_summary_proposal is null or char_length(incident_summary_proposal) between 1 and 320),

  constraint ar_source_formation_assessments_context_status_check
    check (context_status = 'resolved'),
  constraint ar_source_formation_assessments_context_scope_check
    check (context_scope = 'full_post'),
  constraint ar_source_formation_assessments_context_hash_check
    check (context_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ar_source_formation_assessments_context_char_count_check
    check (context_char_count >= 20),
  constraint ar_source_formation_assessments_context_complete_check
    check (context_truncated = false),

  constraint ar_source_formation_assessments_prompt_check
    check (length(trim(prompt_version)) between 1 and 120),
  constraint ar_source_formation_assessments_provider_check
    check (length(trim(provider)) between 1 and 80),
  constraint ar_source_formation_assessments_model_check
    check (length(trim(model_name)) between 1 and 160),
  constraint ar_source_formation_assessments_recovery_version_check
    check (recovery_version is null or length(trim(recovery_version)) between 1 and 120),
  constraint ar_source_formation_assessments_recovery_count_check
    check (recovery_attempt_count between 0 and 2),
  constraint ar_source_formation_assessments_recovery_contract
    check (
      (
        recovery_attempted = false
        and recovery_recovered = false
        and recovery_trigger_reason_code is null
        and recovery_attempt_count in (0, 1)
      )
      or
      (
        recovery_attempted = true
        and recovery_attempt_count = 2
        and recovery_trigger_reason_code = 'source_formation_provider_incomplete'
      )
    ),
  constraint ar_source_formation_assessments_recovered_contract
    check (recovery_recovered = false or recovery_attempted = true),

  constraint ar_source_formation_assessments_unique_batch_signal
    unique (assessment_batch_version, source_signal_id)
);

create index ar_idx_source_formation_assessments_signal_created
  on public.ar_source_formation_assessments (source_signal_id, created_at desc);
create index ar_idx_source_formation_assessments_state_created
  on public.ar_source_formation_assessments (formation_state, created_at desc);
create index ar_idx_source_formation_assessments_admission_outcome
  on public.ar_source_formation_assessments (source_admission_outcome_id);

alter table public.ar_source_formation_assessments enable row level security;

revoke all on table public.ar_source_formation_assessments
  from public, anon, authenticated, service_role;
grant select, insert on table public.ar_source_formation_assessments
  to service_role;

create or replace function public.ar_guard_source_formation_assessment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  admission public.ar_source_full_context_resolution_outcomes%rowtype;
begin
  select *
  into admission
  from public.ar_source_full_context_resolution_outcomes outcome
  where outcome.id = new.source_admission_outcome_id;

  if not found then
    raise exception 'Formation assessment requires an existing Source Admission outcome'
      using errcode = '23514';
  end if;

  if admission.source_signal_id <> new.source_signal_id
     or admission.outcome_schema_version <> new.source_admission_outcome_schema_version
     or admission.batch_version <> new.source_admission_batch_version then
    raise exception 'Formation assessment Source Admission lineage mismatch'
      using errcode = '23514';
  end if;

  if admission.status <> 'resolved' or admission.decision <> 'candidate' then
    raise exception 'Formation assessment requires a resolved Candidate Source Admission outcome'
      using errcode = '23514';
  end if;

  if admission.context_status <> 'resolved'
     or admission.context_scope <> 'full_post'
     or admission.context_content_sha256 <> new.context_content_sha256
     or admission.context_char_count <> new.context_char_count
     or admission.context_truncated <> new.context_truncated then
    raise exception 'Formation assessment context does not match durable Source Admission context'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_signal_evaluation_samples sample
    where sample.source_signal_id = new.source_signal_id
  ) then
    raise exception 'Blind evaluation Source Signal cannot receive Formation assessments'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ar_source_incident_links link
    where link.source_signal_id = new.source_signal_id
  ) or exists (
    select 1
    from public.ar_public_problem_evidence_snapshots evidence
    where evidence.source_signal_id = new.source_signal_id
  ) then
    raise exception 'Source with downstream Incident/Public Evidence authority cannot receive a new Formation assessment'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.ar_guard_source_formation_assessment()
  from public, anon, authenticated;

drop trigger if exists ar_trg_guard_source_formation_assessment
  on public.ar_source_formation_assessments;
create trigger ar_trg_guard_source_formation_assessment
before insert or update on public.ar_source_formation_assessments
for each row execute function public.ar_guard_source_formation_assessment();
