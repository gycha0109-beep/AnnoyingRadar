-- Phase 15.1 hardening: expose only public-safe published projections.
-- Base Public Radar tables keep curator audit/internal fields and are not directly readable by anon/authenticated.

revoke select on table public.ar_public_problems from anon, authenticated;
revoke select on table public.ar_public_problem_evidence_snapshots from anon, authenticated;

drop view if exists public.ar_public_problem_evidence_feed;
drop view if exists public.ar_public_problem_feed;

create view public.ar_public_problem_feed
with (security_barrier = true)
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
  count(e.id)::integer as evidence_count,
  count(distinct e.source_key)::integer as source_count
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

create view public.ar_public_problem_evidence_feed
with (security_barrier = true)
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

revoke all on table public.ar_public_problem_feed from public, anon, authenticated, service_role;
revoke all on table public.ar_public_problem_evidence_feed from public, anon, authenticated, service_role;

grant select on table public.ar_public_problem_feed to anon, authenticated, service_role;
grant select on table public.ar_public_problem_evidence_feed to anon, authenticated, service_role;
