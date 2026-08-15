-- Phase 7.3 review hardening: inactive Ideas may only receive a status-only restore/transition.

create or replace function public.ar_guard_idea_candidate_inactive_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('discarded', 'archived') then
    if new.status = old.status then
      raise exception 'Discarded or archived Idea Candidate must be restored before editing'
        using errcode = '23514';
    end if;

    if (
      new.user_id,
      new.problem_candidate_id,
      new.generation_batch_id,
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
      old.user_id,
      old.problem_candidate_id,
      old.generation_batch_id,
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
      raise exception 'Inactive Idea Candidate status transition must not edit content or source identity'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.ar_guard_idea_candidate_inactive_edit()
  from public, anon, authenticated, service_role;