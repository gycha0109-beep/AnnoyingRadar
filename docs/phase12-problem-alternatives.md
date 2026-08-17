# Phase 12 — Problem-linked Competitor & Alternative Notes

## Status

`PHASE_12_IMPLEMENTED_UNVERIFIED`

## Source use case

`Usecase_v2.1.md` UC-15 defines the v0.3 capability minimally as:

- add competitor-service notes
- record existing services or alternatives related to a problem

Phase 12 intentionally implements only that manual research-asset boundary. It does not introduce automated competitor discovery, scoring, ranking, crawling, or AI selection.

## Canonical parent

A note belongs to the existing canonical Problem Card identity:

```text
ar_problem_candidates.id
```

No separate Problem Card table is introduced. A new note may only be created while the parent Problem Candidate is `confirmed` and its source Raw Input analysis is `completed`.

Once a note exists, it remains an owned research asset. Editing and deleting the note do not depend on the parent remaining confirmed. The parent foreign key itself is immutable through the application mutation contract.

## Persistence

Migration:

```text
supabase/migrations/016_problem_alternative_notes.sql
```

Table:

```text
ar_problem_alternative_notes

id
problem_candidate_id
user_id
kind            service | alternative
name            required, 1..200
url             optional http(s), <= 2000
note            optional, <= 4000
created_at
updated_at
```

The table uses:

- foreign key to `ar_problem_candidates`
- foreign key to `auth.users`
- owner-scoped SELECT RLS
- no authenticated direct writes
- service-role-only SECURITY DEFINER mutation RPCs
- parent/owner/source validation trigger

Mutation RPCs:

```text
ar_create_problem_alternative_note
ar_update_problem_alternative_note
ar_delete_problem_alternative_note
```

RPC validation independently enforces allowed kinds, lengths, URL scheme, patch keys and JSON value types rather than trusting only the API layer.

## API

Collection:

```text
GET  /api/problem-candidates/{candidateId}/alternatives
POST /api/problem-candidates/{candidateId}/alternatives
```

Item:

```text
PATCH  /api/problem-candidates/{candidateId}/alternatives/{noteId}
DELETE /api/problem-candidates/{candidateId}/alternatives/{noteId}
```

Every route:

- requires an authenticated user
- verifies Problem Candidate ownership
- scopes note access by candidate + note + user where applicable
- passes the authenticated user id into mutation RPCs

Create additionally requires:

```text
Problem Candidate status = confirmed
Raw Input analysis_status = completed
```

## UI

The Problem detail page includes a new section:

```text
기존 서비스 / 대안
```

Capabilities:

- list existing manual notes
- create `service` or `alternative`
- optional URL
- free-form research note
- inline edit
- two-step delete confirmation

The creation form explicitly states that only manually verified facts and notes are stored. URLs open in a new tab with `rel="noreferrer"`.

## Explicit non-goals

Phase 12 does not add:

- automatic web search
- Google / Product Hunt / community crawling
- automatic competitor identification
- AI competitor recommendation
- market-share data
- competition score
- weighting or ranking
- winner selection
- automatic URL ingestion
- Project- or Idea-owned competitor identity

## Verification contract

Static/release coverage includes:

- request normalization tests
- migration/RLS/RPC contract tests
- API auth/ownership/RPC contract tests
- UI manual-research boundary tests
- strict Manual Login Live Browser E2E contract

Live browser command:

```text
npm run e2e:problem-alternatives:live
```

The live flow is reversible:

```text
manual login
→ select an existing confirmed Problem Card
→ capture initial note count
→ create unique service note
→ verify API persistence
→ reload and verify persistence
→ edit it into an alternative note
→ verify API persistence
→ delete it through the canonical API/UI
→ verify exact initial note count is restored
→ require zero page errors and zero hydration errors
```

On failure after creation, the runner attempts cleanup only through the canonical authenticated DELETE API and records any possible residue in its diagnostics.

Accepted release output requires both markers:

```text
ProblemAlternativesLiveE2E: PASS (...)
ProblemAlternativesLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)
```

## Hosted lifecycle

The repository migration is not considered hosted authority until it is applied with the Supabase migration mechanism after exact-head CI passes. After application, table/RLS/grants/RPC definitions and zero unexpected preexisting rows must be reverified before the live browser gate.
