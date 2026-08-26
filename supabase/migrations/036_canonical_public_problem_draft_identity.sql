-- Phase 15.8R: idempotent identity for governed Canonical Public Problem drafts.
--
-- Existing historical/manual Public Problems remain valid with NULL
-- problem_signature. New formation-governed drafts use the canonical
-- problem_signature as their internal idempotency identity.

alter table public.ar_public_problems
  add column if not exists problem_signature text;

alter table public.ar_public_problems
  drop constraint if exists ar_public_problems_problem_signature_nonblank;

alter table public.ar_public_problems
  add constraint ar_public_problems_problem_signature_nonblank
  check (
    problem_signature is null
    or length(btrim(problem_signature)) between 1 and 500
  );

create unique index if not exists ar_public_problems_problem_signature_unique
  on public.ar_public_problems (problem_signature)
  where problem_signature is not null;

create or replace function public.ar_create_canonical_public_problem_draft(
  p_curator_user_id uuid,
  p_problem_signature text,
  p_title text,
  p_summary text,
  p_target_user text default null,
  p_situation text default null,
  p_category text default null
)
returns public.ar_public_problems
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem public.ar_public_problems%rowtype;
  v_signature text;
  v_title text;
  v_summary text;
  v_target_user text;
  v_situation text;
  v_category text;
begin
  perform public.ar_require_radar_curator(p_curator_user_id);

  v_signature := btrim(coalesce(p_problem_signature, ''));
  v_title := btrim(coalesce(p_title, ''));
  v_summary := btrim(coalesce(p_summary, ''));
  v_target_user := nullif(btrim(coalesce(p_target_user, '')), '');
  v_situation := nullif(btrim(coalesce(p_situation, '')), '');
  v_category := nullif(btrim(coalesce(p_category, '')), '');

  if length(v_signature) not between 1 and 500 then
    raise exception 'problem_signature must contain 1 to 500 characters' using errcode = '22023';
  end if;
  if length(v_title) not between 1 and 240 then
    raise exception 'title must contain 1 to 240 characters' using errcode = '22023';
  end if;
  if length(v_summary) not between 1 and 4000 then
    raise exception 'summary must contain 1 to 4000 characters' using errcode = '22023';
  end if;
  if v_target_user is not null and length(v_target_user) > 1000 then
    raise exception 'target_user must be at most 1000 characters' using errcode = '22023';
  end if;
  if v_situation is not null and length(v_situation) > 2000 then
    raise exception 'situation must be at most 2000 characters' using errcode = '22023';
  end if;
  if v_category is not null and length(v_category) > 120 then
    raise exception 'category must be at most 120 characters' using errcode = '22023';
  end if;

  insert into public.ar_public_problems (
    problem_signature,
    title,
    summary,
    target_user,
    situation,
    category,
    status,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_signature,
    v_title,
    v_summary,
    v_target_user,
    v_situation,
    v_category,
    'draft',
    p_curator_user_id,
    p_curator_user_id
  )
  on conflict (problem_signature) where problem_signature is not null
  do nothing
  returning * into v_problem;

  if found then
    return v_problem;
  end if;

  select * into v_problem
  from public.ar_public_problems
  where problem_signature = v_signature;

  if not found then
    raise exception 'canonical draft identity conflict could not be resolved' using errcode = '40001';
  end if;

  if v_problem.status <> 'draft'
     or v_problem.published_at is not null
     or v_problem.archived_at is not null then
    raise exception 'existing canonical identity is not an active draft' using errcode = '23514';
  end if;

  if v_problem.title is distinct from v_title
     or v_problem.summary is distinct from v_summary
     or v_problem.target_user is distinct from v_target_user
     or v_problem.situation is distinct from v_situation
     or v_problem.category is distinct from v_category then
    raise exception 'existing canonical draft content differs from requested authority' using errcode = '23514';
  end if;

  return v_problem;
end;
$$;

revoke all on function public.ar_create_canonical_public_problem_draft(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.ar_create_canonical_public_problem_draft(
  uuid, text, text, text, text, text, text
) to service_role;
