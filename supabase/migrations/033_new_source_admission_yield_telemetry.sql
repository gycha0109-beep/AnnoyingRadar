begin;

alter table public.ar_source_ingestion_runs
  add column if not exists new_admission_telemetry_version text,
  add column if not exists new_admission_candidate_count integer,
  add column if not exists new_admission_review_count integer,
  add column if not exists new_admission_reject_count integer;

alter table public.ar_source_ingestion_runs
  drop constraint if exists ar_source_ingestion_runs_new_admission_candidate_nonnegative,
  add constraint ar_source_ingestion_runs_new_admission_candidate_nonnegative
    check (new_admission_candidate_count is null or new_admission_candidate_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_new_admission_review_nonnegative,
  add constraint ar_source_ingestion_runs_new_admission_review_nonnegative
    check (new_admission_review_count is null or new_admission_review_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_new_admission_reject_nonnegative,
  add constraint ar_source_ingestion_runs_new_admission_reject_nonnegative
    check (new_admission_reject_count is null or new_admission_reject_count >= 0),
  drop constraint if exists ar_source_ingestion_runs_new_admission_telemetry_complete,
  add constraint ar_source_ingestion_runs_new_admission_telemetry_complete
    check (
      (
        new_admission_telemetry_version is null
        and new_admission_candidate_count is null
        and new_admission_review_count is null
        and new_admission_reject_count is null
      )
      or
      (
        new_admission_telemetry_version is not null
        and new_admission_candidate_count is not null
        and new_admission_review_count is not null
        and new_admission_reject_count is not null
        and new_admission_candidate_count
          + new_admission_review_count
          + new_admission_reject_count = inserted_count
      )
    );

commit;
