-- Phase 6: table-level workflow transition guard.
-- Same-status writes are metadata refreshes and are allowed.

create or replace function public.ar_guard_analysis_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.analysis_status is not distinct from old.analysis_status then
    return new;
  end if;

  if not (
    (old.analysis_status = 'idle' and new.analysis_status = 'input_saved')
    or (old.analysis_status = 'input_saved' and new.analysis_status in ('extracting', 'reviewing_evidence'))
    or (old.analysis_status = 'extracting' and new.analysis_status in ('reviewing_evidence', 'extraction_failed'))
    or (old.analysis_status = 'extraction_failed' and new.analysis_status in ('input_saved', 'extracting', 'reviewing_evidence'))
    or (old.analysis_status = 'reviewing_evidence' and new.analysis_status in ('input_saved', 'extracting', 'grouping'))
    or (old.analysis_status = 'grouping' and new.analysis_status in ('reviewing_candidates', 'grouping_failed'))
    or (old.analysis_status = 'grouping_failed' and new.analysis_status in ('input_saved', 'grouping'))
    or (old.analysis_status = 'reviewing_candidates' and new.analysis_status in ('input_saved', 'completed'))
  ) then
    raise exception 'Invalid analysis status transition: % -> %',
      old.analysis_status,
      new.analysis_status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ar_guard_analysis_status_transition
  on public.ar_raw_inputs;
create trigger trg_ar_guard_analysis_status_transition
before update of analysis_status
on public.ar_raw_inputs
for each row execute function public.ar_guard_analysis_status_transition();

revoke all on function public.ar_guard_analysis_status_transition()
  from public, anon, authenticated, service_role;
