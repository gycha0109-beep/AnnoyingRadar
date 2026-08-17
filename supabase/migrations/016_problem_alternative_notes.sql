-- Phase 12: Problem-linked competitor / alternative notes.

create table if not exists public.ar_problem_alternative_notes (
  id uuid primary key default gen_random_uuid(),
  problem_candidate_id uuid not null
    references public.ar_problem_candidates(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  kind text not null,
  name text not null,
  url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ar_problem_alternative_notes_kind_check
    check (kind in ('service', 'alternative')),
  constraint ar_problem_alternative_notes_name_length
    check (length(trim(name)) between 1 and 200),
  constraint ar_problem_alternative_notes_url_check
    check (
      url is null
      or (
        length(url) <= 2000
        and url ~* '^https?://'
      )
    ),
  constraint ar_problem_alternative_notes_note_length
    check (note is null or length(note) <= 4000)
);

create index if not exists ar_idx_problem_alternative_notes_user_problem_updated
  on public.ar_problem_alternative_notes (user_id, problem_candidate_id, updated_at desc);

create trigger ar_trg_problem_alternative_notes_updated_at
before update on public.ar_problem_alternative_notes
for each row execute function public.ar_set_updated_at();

create or replace function public.ar_validate_problem_alternative_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
begin
  select c.user_id, c.status, r.analysis_status
    into v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_problem_candidates c
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where c.id = new.problem_candidate_id;

  if v_candidate_user_id is null then
    raise exception 'Problem Card not found' using errcode = '23503';
  end if;
  if v_candidate_user_id <> new.user_id then
    raise exception 'Problem alternative user_id must match Problem Card owner'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Problem alternative requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Problem alternative requires a completed source analysis'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ar_trg_validate_problem_alternative_source
before insert or update of user_id, problem_candidate_id
on public.ar_problem_alternative_notes
for each row execute function public.ar_validate_problem_alternative_source();

create or replace function public.ar_create_problem_alternative_note(
  p_problem_candidate_id uuid,
  p_user_id uuid,
  p_kind text,
  p_name text,
  p_url text,
  p_note text
)
returns public.ar_problem_alternative_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_user_id uuid;
  v_candidate_status text;
  v_raw_status text;
  v_row public.ar_problem_alternative_notes%rowtype;
  v_url text;
begin
  if p_problem_candidate_id is null or p_user_id is null then
    raise exception 'Problem Card and user_id are required' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('service', 'alternative') then
    raise exception 'kind must be service or alternative' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'name must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 4000 then
    raise exception 'note must be at most 4000 characters' using errcode = '22023';
  end if;

  v_url := nullif(trim(coalesce(p_url, '')), '');
  if v_url is not null and (length(v_url) > 2000 or v_url !~* '^https?://') then
    raise exception 'url must be an http(s) URL with at most 2000 characters' using errcode = '22023';
  end if;

  select c.user_id, c.status, r.analysis_status
    into v_candidate_user_id, v_candidate_status, v_raw_status
  from public.ar_problem_candidates c
  join public.ar_raw_inputs r on r.id = c.raw_input_id
  where c.id = p_problem_candidate_id
  for update of c, r;

  if v_candidate_user_id is null then
    raise exception 'Problem Card not found' using errcode = 'P0002';
  end if;
  if v_candidate_user_id <> p_user_id then
    raise exception 'Problem Card owner must match problem alternative owner'
      using errcode = '23514';
  end if;
  if v_candidate_status <> 'confirmed' then
    raise exception 'Problem alternative requires a confirmed Problem Card'
      using errcode = '23514';
  end if;
  if v_raw_status <> 'completed' then
    raise exception 'Problem alternative requires a completed source analysis'
      using errcode = '23514';
  end if;

  insert into public.ar_problem_alternative_notes (
    problem_candidate_id,
    user_id,
    kind,
    name,
    url,
    note
  ) values (
    p_problem_candidate_id,
    p_user_id,
    p_kind,
    trim(p_name),
    v_url,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.ar_update_problem_alternative_note(
  p_note_id uuid,
  p_user_id uuid,
  p_patch jsonb
)
returns public.ar_problem_alternative_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ar_problem_alternative_notes%rowtype;
  v_unknown_keys text[];
  v_kind text;
  v_name text;
  v_url text;
  v_note text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Problem alternative patch must be a non-empty object' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_unknown_keys
  from jsonb_object_keys(p_patch) as keys(key)
  where key not in ('kind', 'name', 'url', 'note');
  if v_unknown_keys is not null then
    raise exception 'Unsupported Problem alternative fields: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  if p_patch ? 'kind' and (
    p_patch->'kind' = 'null'::jsonb or jsonb_typeof(p_patch->'kind') <> 'string'
  ) then
    raise exception 'kind must be service or alternative' using errcode = '22023';
  end if;
  if p_patch ? 'name' and (
    p_patch->'name' = 'null'::jsonb or jsonb_typeof(p_patch->'name') <> 'string'
  ) then
    raise exception 'name must be a string' using errcode = '22023';
  end if;
  if p_patch ? 'url' and (
    p_patch->'url' <> 'null'::jsonb and jsonb_typeof(p_patch->'url') <> 'string'
  ) then
    raise exception 'url must be a string or null' using errcode = '22023';
  end if;
  if p_patch ? 'note' and (
    p_patch->'note' <> 'null'::jsonb and jsonb_typeof(p_patch->'note') <> 'string'
  ) then
    raise exception 'note must be a string or null' using errcode = '22023';
  end if;

  select * into v_row
  from public.ar_problem_alternative_notes
  where id = p_note_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Problem alternative note not found' using errcode = 'P0002';
  end if;

  v_kind := case when p_patch ? 'kind' then p_patch->>'kind' else v_row.kind end;
  v_name := case when p_patch ? 'name' then trim(coalesce(p_patch->>'name', '')) else v_row.name end;
  v_url := case
    when p_patch ? 'url' then nullif(trim(coalesce(p_patch->>'url', '')), '')
    else v_row.url
  end;
  v_note := case
    when p_patch ? 'note' then nullif(trim(coalesce(p_patch->>'note', '')), '')
    else v_row.note
  end;

  if v_kind is null or v_kind not in ('service', 'alternative') then
    raise exception 'kind must be service or alternative' using errcode = '22023';
  end if;
  if length(v_name) not between 1 and 200 then
    raise exception 'name must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if v_url is not null and (length(v_url) > 2000 or v_url !~* '^https?://') then
    raise exception 'url must be an http(s) URL with at most 2000 characters' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 4000 then
    raise exception 'note must be at most 4000 characters' using errcode = '22023';
  end if;

  update public.ar_problem_alternative_notes
  set
    kind = v_kind,
    name = v_name,
    url = v_url,
    note = v_note
  where id = p_note_id and user_id = p_user_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.ar_delete_problem_alternative_note(
  p_note_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  delete from public.ar_problem_alternative_notes
  where id = p_note_id and user_id = p_user_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Problem alternative note not found' using errcode = 'P0002';
  end if;

  return v_deleted_id;
end;
$$;

alter table public.ar_problem_alternative_notes enable row level security;

drop policy if exists ar_users_can_read_own_problem_alternative_notes
  on public.ar_problem_alternative_notes;
create policy ar_users_can_read_own_problem_alternative_notes
  on public.ar_problem_alternative_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ar_problem_alternative_notes from anon, authenticated, service_role;
grant select on table public.ar_problem_alternative_notes to authenticated, service_role;

revoke all on function public.ar_validate_problem_alternative_source()
  from public, anon, authenticated, service_role;
revoke all on function public.ar_create_problem_alternative_note(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.ar_update_problem_alternative_note(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ar_delete_problem_alternative_note(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.ar_create_problem_alternative_note(uuid, uuid, text, text, text, text)
  to service_role;
grant execute on function public.ar_update_problem_alternative_note(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.ar_delete_problem_alternative_note(uuid, uuid)
  to service_role;
