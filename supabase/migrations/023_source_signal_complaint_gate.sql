-- Phase 15.5: complaint relevance classification and Gold Set v0.1.
-- Source Signal remains editorial supply data and is intentionally separate from
-- user-owned ar_raw_inputs / ar_pain_evidences.

create table if not exists public.ar_source_signal_classifications (
  id uuid primary key default gen_random_uuid(),
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete cascade,
  classifier_version text not null,
  prefilter_version text not null,
  prefilter_decision text not null,
  prefilter_reason_codes text[] not null default '{}'::text[],
  model_decision text,
  final_decision text not null,
  complaint_relevant text not null,
  first_hand_experience text not null,
  concrete_friction text not null,
  core_evidence text,
  reason_codes text[] not null default '{}'::text[],
  confidence numeric(5,4),
  prompt_version text,
  provider text,
  model_name text,
  provider_request_id text,
  input_tokens integer,
  output_tokens integer,
  classified_by_user_id uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),

  constraint ar_source_signal_classifications_classifier_version_check
    check (length(trim(classifier_version)) between 1 and 120),
  constraint ar_source_signal_classifications_prefilter_version_check
    check (length(trim(prefilter_version)) between 1 and 120),
  constraint ar_source_signal_classifications_prefilter_decision_check
    check (prefilter_decision in ('continue', 'review', 'reject')),
  constraint ar_source_signal_classifications_model_decision_check
    check (model_decision is null or model_decision in ('pass', 'review', 'reject')),
  constraint ar_source_signal_classifications_final_decision_check
    check (final_decision in ('pass', 'review', 'reject')),
  constraint ar_source_signal_classifications_complaint_check
    check (complaint_relevant in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_classifications_first_hand_check
    check (first_hand_experience in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_classifications_friction_check
    check (concrete_friction in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_classifications_core_evidence_length
    check (core_evidence is null or length(core_evidence) between 1 and 2000),
  constraint ar_source_signal_classifications_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint ar_source_signal_classifications_token_check
    check (
      (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
    ),
  constraint ar_source_signal_classifications_prefilter_contract
    check (
      (
        prefilter_decision = 'reject'
        and model_decision is null
        and final_decision = 'reject'
      )
      or (
        prefilter_decision = 'review'
        and model_decision is not null
        and final_decision = 'review'
      )
      or (
        prefilter_decision = 'continue'
        and model_decision is not null
        and final_decision = model_decision
      )
    ),
  constraint ar_source_signal_classifications_model_dimension_contract
    check (
      model_decision is null
      or (
        model_decision = 'pass'
        and complaint_relevant = 'yes'
        and first_hand_experience = 'yes'
        and concrete_friction = 'yes'
      )
      or (
        model_decision = 'reject'
        and (
          complaint_relevant = 'no'
          or first_hand_experience = 'no'
          or concrete_friction = 'no'
        )
      )
      or (
        model_decision = 'review'
        and complaint_relevant <> 'no'
        and first_hand_experience <> 'no'
        and concrete_friction <> 'no'
        and (
          complaint_relevant = 'uncertain'
          or first_hand_experience = 'uncertain'
          or concrete_friction = 'uncertain'
        )
      )
    ),
  constraint ar_source_signal_classifications_pass_contract
    check (
      final_decision <> 'pass'
      or (
        complaint_relevant = 'yes'
        and first_hand_experience = 'yes'
        and concrete_friction = 'yes'
        and core_evidence is not null
        and length(trim(core_evidence)) > 0
      )
    ),
  constraint ar_source_signal_classifications_provider_contract
    check (
      (model_decision is null and provider is null and model_name is null and prompt_version is null)
      or
      (model_decision is not null and provider is not null and model_name is not null and prompt_version is not null)
    )
);

create table if not exists public.ar_source_signal_gold_annotations (
  id uuid primary key default gen_random_uuid(),
  source_signal_id uuid not null
    references public.ar_source_signals(id)
    on delete cascade,
  gold_set_version text not null default 'gold-v0.1',
  complaint_relevant text not null,
  first_hand_experience text not null,
  concrete_friction text not null,
  spam_or_ad boolean not null default false,
  repost_or_copy boolean not null default false,
  news_only boolean not null default false,
  generic_negative_only boolean not null default false,
  core_evidence text,
  annotator_note text,
  reviewed_by uuid
    references auth.users(id)
    on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_source_signal_gold_annotations_version_check
    check (length(trim(gold_set_version)) between 1 and 80),
  constraint ar_source_signal_gold_annotations_complaint_check
    check (complaint_relevant in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_gold_annotations_first_hand_check
    check (first_hand_experience in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_gold_annotations_friction_check
    check (concrete_friction in ('yes', 'no', 'uncertain')),
  constraint ar_source_signal_gold_annotations_core_evidence_length
    check (core_evidence is null or length(core_evidence) between 1 and 2000),
  constraint ar_source_signal_gold_annotations_note_length
    check (annotator_note is null or length(annotator_note) <= 4000),
  constraint ar_source_signal_gold_annotations_positive_contract
    check (
      complaint_relevant <> 'yes'
      or (
        first_hand_experience = 'yes'
        and concrete_friction = 'yes'
        and core_evidence is not null
        and length(trim(core_evidence)) > 0
      )
    ),
  constraint ar_source_signal_gold_annotations_unique_version
    unique (source_signal_id, gold_set_version)
);

create or replace function public.ar_validate_source_signal_core_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_raw_text text;
begin
  if new.core_evidence is null then
    return new;
  end if;

  select raw_text
    into v_raw_text
  from public.ar_source_signals
  where id = new.source_signal_id;

  if v_raw_text is null then
    raise exception 'Source Signal not found for core evidence validation'
      using errcode = '23503';
  end if;

  if position(new.core_evidence in v_raw_text) = 0 then
    raise exception 'core_evidence must be an exact contiguous Source Signal excerpt'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create index if not exists ar_idx_source_signal_classifications_signal_created
  on public.ar_source_signal_classifications (source_signal_id, created_at desc);
create index if not exists ar_idx_source_signal_classifications_decision_created
  on public.ar_source_signal_classifications (final_decision, created_at desc);
create index if not exists ar_idx_source_signal_gold_version_reviewed
  on public.ar_source_signal_gold_annotations (gold_set_version, reviewed_at desc);
create index if not exists ar_idx_source_signal_gold_complaint
  on public.ar_source_signal_gold_annotations (gold_set_version, complaint_relevant);

alter table public.ar_source_signal_classifications enable row level security;
alter table public.ar_source_signal_gold_annotations enable row level security;

revoke all on table public.ar_source_signal_classifications from public, anon, authenticated;
revoke all on table public.ar_source_signal_gold_annotations from public, anon, authenticated;

grant select, insert on table public.ar_source_signal_classifications to service_role;
grant select, insert, update on table public.ar_source_signal_gold_annotations to service_role;

drop trigger if exists ar_trg_source_signal_classification_core_evidence
  on public.ar_source_signal_classifications;
create trigger ar_trg_source_signal_classification_core_evidence
before insert or update of core_evidence, source_signal_id
on public.ar_source_signal_classifications
for each row execute function public.ar_validate_source_signal_core_evidence();

drop trigger if exists ar_trg_source_signal_gold_core_evidence
  on public.ar_source_signal_gold_annotations;
create trigger ar_trg_source_signal_gold_core_evidence
before insert or update of core_evidence, source_signal_id
on public.ar_source_signal_gold_annotations
for each row execute function public.ar_validate_source_signal_core_evidence();

drop trigger if exists ar_trg_source_signal_gold_updated_at
  on public.ar_source_signal_gold_annotations;
create trigger ar_trg_source_signal_gold_updated_at
before update on public.ar_source_signal_gold_annotations
for each row execute function public.ar_set_updated_at();
