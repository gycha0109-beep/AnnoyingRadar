begin;

alter table public.ar_source_ingestion_runs
  add column if not exists discovery_policy_version text,
  add column if not exists discovery_continue_count integer not null default 0,
  add column if not exists discovery_reject_count integer not null default 0,
  add column if not exists discovery_reason_counts jsonb not null default '{}'::jsonb,
  add column if not exists admission_candidate_count integer not null default 0,
  add column if not exists admission_review_count integer not null default 0,
  add column if not exists admission_reject_count integer not null default 0;

alter table public.ar_source_ingestion_runs
  drop constraint if exists ar_source_ingestion_runs_discovery_continue_nonnegative,
  add constraint ar_source_ingestion_runs_discovery_continue_nonnegative
    check (discovery_continue_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_discovery_reject_nonnegative,
  add constraint ar_source_ingestion_runs_discovery_reject_nonnegative
    check (discovery_reject_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_admission_candidate_nonnegative,
  add constraint ar_source_ingestion_runs_admission_candidate_nonnegative
    check (admission_candidate_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_admission_review_nonnegative,
  add constraint ar_source_ingestion_runs_admission_review_nonnegative
    check (admission_review_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_admission_reject_nonnegative,
  add constraint ar_source_ingestion_runs_admission_reject_nonnegative
    check (admission_reject_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_discovery_reason_counts_object,
  add constraint ar_source_ingestion_runs_discovery_reason_counts_object
    check (jsonb_typeof(discovery_reason_counts) = 'object');

create index if not exists ar_idx_source_ingestion_runs_discovery_query
  on public.ar_source_ingestion_runs (source_platform, query_text, completed_at desc)
  where status = 'completed';

commit;
