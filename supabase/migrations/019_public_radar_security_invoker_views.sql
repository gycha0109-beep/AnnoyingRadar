-- Phase 15.1 security hardening: public read views execute with caller privileges.
-- Only public-safe base columns are granted; curator audit fields and internal source_key remain private.

create or replace view public.ar_public_problem_feed
with (security_barrier = true, security_invoker = true)
as
select
  p.id,
  p.title,
  p.summary,
  p.target_user,
  p.situation,
  p.category,
  p.status,
  p.published_at,
  p.created_at,
  p.updated_at,
  p.search_text,
  count(e.id)::integer as evidence_count
from public.ar_public_problems p
left join public.ar_public_problem_evidence_snapshots e
  on e.public_problem_id = p.id
where p.status = 'published'
group by
  p.id,
  p.title,
  p.summary,
  p.target_user,
  p.situation,
  p.category,
  p.status,
  p.published_at,
  p.created_at,
  p.updated_at,
  p.search_text;

create or replace view public.ar_public_problem_evidence_feed
with (security_barrier = true, security_invoker = true)
as
select
  e.id,
  e.public_problem_id,
  e.excerpt,
  e.publication_basis,
  e.source_type,
  e.source_label,
  e.source_url,
  e.source_observed_at,
  e.order_index,
  e.created_at,
  e.updated_at
from public.ar_public_problem_evidence_snapshots e
join public.ar_public_problems p
  on p.id = e.public_problem_id
where p.status = 'published';

revoke all on table public.ar_public_problems from anon, authenticated;
revoke all on table public.ar_public_problem_evidence_snapshots from anon, authenticated;

grant select (
  id,
  title,
  summary,
  target_user,
  situation,
  category,
  status,
  published_at,
  created_at,
  updated_at,
  search_text
) on public.ar_public_problems to anon, authenticated;

grant select (
  id,
  public_problem_id,
  excerpt,
  publication_basis,
  source_type,
  source_label,
  source_url,
  source_observed_at,
  order_index,
  created_at,
  updated_at
) on public.ar_public_problem_evidence_snapshots to anon, authenticated;

revoke all on table public.ar_public_problem_feed from public, anon, authenticated, service_role;
revoke all on table public.ar_public_problem_evidence_feed from public, anon, authenticated, service_role;

grant select on table public.ar_public_problem_feed to anon, authenticated, service_role;
grant select on table public.ar_public_problem_evidence_feed to anon, authenticated, service_role;
