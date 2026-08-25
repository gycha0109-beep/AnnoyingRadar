-- Phase 15.8M-A: durable current full-context Source Admission outcome authority.
-- This table stores structured resolution metadata only. It intentionally does not
-- store full source bodies, canonical URLs, author handles, or evidence quotes.

create table public.ar_source_full_context_resolution_outcomes (
  id uuid primary key default gen_random_uuid(),
  outcome_schema_version text not null,
  batch_version text not null,
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete cascade,
  resolution_version text not null,
  recovery_version text,
  status text not null,
  decision text not null,
  reason_codes text[] not null,

  problem_claim text,
  experience_actor text,
  friction_cause text,
  friction_specificity text,
  pain_centrality text,
  content_kind text,

  context_status text not null,
  context_scope text,
  context_content_sha256 text,
  context_char_count integer,
  context_truncated boolean not null default false,

  prompt_version text not null,
  provider text not null,
  model_name text not null,

  recovery_attempted boolean not null default false,
  recovery_recovered boolean not null default false,
  recovery_attempt_count integer not null default 0,
  recovery_trigger_reason_code text,
  recovery_terminal_reason_code text,

  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint ar_source_full_context_outcomes_schema_version_check
    check (length(trim(outcome_schema_version)) between 1 and 120),
  constraint ar_source_full_context_outcomes_batch_version_check
    check (length(trim(batch_version)) between 1 and 160),
  constraint ar_source_full_context_outcomes_resolution_version_check
    check (length(trim(resolution_version)) between 1 and 120),
  constraint ar_source_full_context_outcomes_recovery_version_check
    check (recovery_version is null or length(trim(recovery_version)) between 1 and 120),
  constraint ar_source_full_context_outcomes_status_check
    check (status in ('resolved', 'unresolved')),
  constraint ar_source_full_context_outcomes_decision_check
    check (decision in ('candidate', 'reject', 'review')),
  constraint ar_source_full_context_outcomes_status_decision_check
    check (
      (status = 'resolved' and decision in ('candidate', 'reject'))
      or
      (status = 'unresolved' and decision = 'review')
    ),
  constraint ar_source_full_context_outcomes_reasons_check
    check (cardinality(reason_codes) between 1 and 12),

  constraint ar_source_full_context_outcomes_problem_claim_check
    check (problem_claim is null or problem_claim in ('yes', 'no', 'unclear')),
  constraint ar_source_full_context_outcomes_actor_check
    check (experience_actor is null or experience_actor in ('self', 'other', 'generic', 'unknown')),
  constraint ar_source_full_context_outcomes_cause_check
    check (friction_cause is null or friction_cause in ('external_service_or_product', 'self_caused', 'mixed', 'unknown')),
  constraint ar_source_full_context_outcomes_specificity_check
    check (friction_specificity is null or friction_specificity in ('concrete', 'vague', 'none', 'unknown')),
  constraint ar_source_full_context_outcomes_centrality_check
    check (pain_centrality is null or pain_centrality in ('central', 'incidental', 'unclear')),
  constraint ar_source_full_context_outcomes_kind_check
    check (content_kind is null or content_kind in ('organic', 'advertisement', 'informational', 'news', 'repost', 'unknown')),
  constraint ar_source_full_context_outcomes_semantic_shape_check
    check (
      num_nonnulls(
        problem_claim,
        experience_actor,
        friction_cause,
        friction_specificity,
        pain_centrality,
        content_kind
      ) in (0, 6)
    ),
  constraint ar_source_full_context_outcomes_resolved_semantic_check
    check (
      status <> 'resolved'
      or num_nonnulls(
        problem_claim,
        experience_actor,
        friction_cause,
        friction_specificity,
        pain_centrality,
        content_kind
      ) = 6
    ),

  constraint ar_source_full_context_outcomes_context_status_check
    check (context_status in ('resolved', 'unavailable')),
  constraint ar_source_full_context_outcomes_context_hash_check
    check (context_content_sha256 is null or context_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ar_source_full_context_outcomes_context_contract
    check (
      (
        context_status = 'resolved'
        and context_scope = 'full_post'
        and context_content_sha256 is not null
        and context_char_count is not null
        and context_char_count >= 20
      )
      or
      (
        context_status = 'unavailable'
        and context_scope is null
        and context_content_sha256 is null
        and context_char_count is null
        and context_truncated = false
      )
    ),

  constraint ar_source_full_context_outcomes_prompt_check
    check (length(trim(prompt_version)) between 1 and 120),
  constraint ar_source_full_context_outcomes_provider_check
    check (length(trim(provider)) between 1 and 80),
  constraint ar_source_full_context_outcomes_model_check
    check (length(trim(model_name)) between 1 and 160),

  constraint ar_source_full_context_outcomes_recovery_count_check
    check (recovery_attempt_count between 0 and 2),
  constraint ar_source_full_context_outcomes_recovery_contract
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
        and recovery_trigger_reason_code is not null
      )
    ),
  constraint ar_source_full_context_outcomes_recovered_contract
    check (recovery_recovered = false or recovery_attempted = true),

  constraint ar_source_full_context_outcomes_unique_batch_signal
    unique (batch_version, source_signal_id)
);

create index ar_idx_source_full_context_outcomes_batch_decision
  on public.ar_source_full_context_resolution_outcomes (batch_version, decision, resolved_at desc);
create index ar_idx_source_full_context_outcomes_signal_created
  on public.ar_source_full_context_resolution_outcomes (source_signal_id, created_at desc);

alter table public.ar_source_full_context_resolution_outcomes enable row level security;

revoke all on table public.ar_source_full_context_resolution_outcomes
  from public, anon, authenticated, service_role;
grant select, insert on table public.ar_source_full_context_resolution_outcomes
  to service_role;

-- Defense in depth: no AI/full-context outcome may be persisted for any signal that
-- belongs to a blind evaluation sample. The operational discovery pool already
-- excludes Blind; this trigger prevents accidental cross-surface writes as well.
create or replace function public.ar_guard_full_context_outcome_from_blind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.ar_source_signal_evaluation_samples sample
    where sample.source_signal_id = new.source_signal_id
  ) then
    raise exception 'Blind evaluation Source Signal cannot receive full-context resolution outcomes'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.ar_guard_full_context_outcome_from_blind()
  from public, anon, authenticated;

drop trigger if exists ar_trg_guard_full_context_outcome_from_blind
  on public.ar_source_full_context_resolution_outcomes;
create trigger ar_trg_guard_full_context_outcome_from_blind
before insert or update on public.ar_source_full_context_resolution_outcomes
for each row execute function public.ar_guard_full_context_outcome_from_blind();
