-- Phase 7.3: enforce the inactive Idea Candidate edit contract at the database boundary.

create or replace function public.ar_guard_idea_candidate_inactive_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('discarded', 'archived') and (
    new.title,
    new.one_liner,
    new.target_user,
    new.problem_statement,
    new.core_value,
    new.first_build_scope,
    new.excluded_scope,
    new.implementation_difficulty,
    new.monetization_hint,
    new.first_screen_idea,
    new.memo,
    new.order_index
  ) is distinct from (
    old.title,
    old.one_liner,
    old.target_user,
    old.problem_statement,
    old.core_value,
    old.first_build_scope,
    old.excluded_scope,
    old.implementation_difficulty,
    old.monetization_hint,
    old.first_screen_idea,
    old.memo,
    old.order_index
  ) then
    raise exception 'Discarded or archived Idea Candidate must be restored before editing'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ar_trg_guard_idea_candidate_inactive_edit
  on public.ar_idea_candidates;
create trigger ar_trg_guard_idea_candidate_inactive_edit
before update on public.ar_idea_candidates
for each row execute function public.ar_guard_idea_candidate_inactive_edit();

revoke all on function public.ar_guard_idea_candidate_inactive_edit()
  from public, anon, authenticated, service_role;