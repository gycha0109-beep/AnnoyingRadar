# Phase 8 — Saved Problem Library / UC-09

## Status

- Baseline: `main@bd3a613d3f55f30cb45d3016232781b1212888a9`
- Upstream: Phase 7.1–7.4 complete
- Scope: UC-09 Saved Problems management surface
- Out of scope: UC-12 Research Projects, Idea Board/kanban, ranking/scoring, market validation, reports/export

## Domain boundary

Problem Card identity does not change:

```text
Problem Card = ar_problem_candidates row where status = confirmed
canonical id = ar_problem_candidates.id
```

Phase 8 adds management metadata only. It does not introduce a second Problem Card entity and does not change `ar_problem_candidates.status`.

```text
ar_saved_problem_cards.problem_candidate_id
  -> ar_problem_candidates.id
```

A missing metadata row means not saved. A row with `active` means saved and visible in the default library. A row with `archived` remains saved but is separated from the active library.

## Eligibility

A Problem Card can be saved only when:

```text
problem_candidate.user_id = current user
problem_candidate.status = confirmed
problem_candidate.evidence_count >= 1
source raw_input.user_id = current user
source raw_input.analysis_status = completed
```

The database revalidates ownership and the confirmed/completed source boundary.

## Metadata

```text
problem_candidate_id uuid primary key
user_id uuid
category text nullable
memo text nullable
status active | archived
created_at
updated_at
```

`category` and `memo` are user-authored. Phase 8 does not generate them with AI.

## Lifecycle

```text
not saved -> active
active -> archived
archived -> active
```

There is no physical DELETE API. Saving is idempotent and the primary key prevents duplicate Saved Problem rows.

The Saved Problem lifecycle is independent from the Problem Candidate lifecycle and the Idea Candidate lifecycle.

Archiving a Saved Problem must not:

- change `ar_problem_candidates.status`
- invalidate existing Idea Candidates
- change Idea Candidate status/history
- change Phase 7 Idea-generation eligibility

## API

```text
GET   /api/saved-problems?status=active|archived|all
GET   /api/problem-candidates/{candidateId}/save
POST  /api/problem-candidates/{candidateId}/save
PATCH /api/problem-candidates/{candidateId}/save
PATCH /api/problem-candidates/{candidateId}/save/status
```

Metadata PATCH accepts only `category` and `memo`. Status mutation has its own endpoint and accepts only `status`.

## UI

### `/problems`

Global Saved Problem library:

- active/archived navigation
- Problem Card title and summary
- category
- memo preview
- evidence count and existing Problem metrics
- re-entry to Problem Card detail

No ranking, numeric scoring, project grouping, or kanban is introduced.

### Problem Card detail

Eligible confirmed/completed Problem Cards expose a Saved Problem section:

- save
- edit category/memo
- archive
- restore
- navigate to global Saved Problems

The existing Phase 7 Idea section stays the single Idea-generation surface.

## Security/write boundary

```text
Browser
-> authenticated Next.js API
-> service-role server client
-> guarded Postgres RPC
```

- RLS enabled
- owner-scoped SELECT
- no direct client INSERT/UPDATE/DELETE grants
- RPC source ownership revalidation
- no client-visible service key

## Release gate

Deterministic CI must cover:

- request contracts
- owner scoping
- confirmed/completed eligibility
- duplicate-save prevention/idempotency
- metadata/status boundary separation
- active/archive lifecycle
- RLS and service-role-only mutation RPCs
- no DELETE API
- Phase 7 source identity and Idea lifecycle remain untouched

Hosted migration verification must confirm the actual table, RLS policy and service-role-only mutation RPC privileges before merge.

The Phase 8 browser gate is explicit and does not repeat live OpenAI generation already closed by Phase 7.4. It requires only manual authentication and intentionally operates only on a recent, completed, **unsaved Phase 7 live-E2E Problem Card**. Existing user Saved Problems are never selected or overwritten.

```text
npm run e2e:saved-problems:live
```

If no eligible unsaved Phase 7 E2E Problem Card remains in the recent-three window, run the existing `npm run e2e:live` gate first to create a fresh E2E source, then rerun the Phase 8 gate.

The runner verifies:

```text
manual login
-> locate recent unsaved Phase 7 E2E completed Problem Card
-> save Problem Card
-> edit category/memo
-> /problems active-library re-entry
-> archive
-> /problems?status=archived re-entry
-> restore
-> reload persistence
-> active-library re-entry
```

No password, token, Playwright storage state or reusable login credential is written to artifacts.

Phase 8 is merge-ready only after:

```text
implementation
-> independent review
-> exact-head deterministic CI PASS
-> hosted migration poststate PASS
-> npm run e2e:saved-problems:live PASS
-> exact PR head recheck
-> merge
-> merged-main exact-SHA CI PASS
```
