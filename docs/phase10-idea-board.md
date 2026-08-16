# Phase 10 — Idea Board

## Scope

Phase 10 turns the existing `/ideas` list into a Kanban projection of the canonical Idea Candidate lifecycle.

It does **not** introduce a new Board domain, Board status, Project-owned Idea status, ranking model, or Board persistence table.

## Canonical lifecycle

The Board lanes are exactly the existing `ar_idea_candidates.status` vocabulary:

```text
candidate
researching
build_soon
paused
discarded
archived
```

Status mutation remains:

```text
browser
-> PATCH /api/idea-candidates/{ideaId}/status
-> authenticated owner check
-> service-role RPC ar_set_idea_candidate_status
-> ar_idea_candidates.status + append-only status event
```

No direct browser/database write is added.

## Board semantics

- Active workflow lanes: `candidate`, `researching`, `build_soon`, `paused`
- Inactive/storage lanes: `discarded`, `archived`
- Desktop supports native drag-and-drop.
- A status-select fallback remains available for keyboard/touch use.
- Status movement is optimistic in the UI and rolls back on mutation failure.
- On mutation failure the card is also re-read from the canonical Idea detail API.
- Cards are ordered by `updated_at DESC`, then stable ID ordering.
- Existing `order_index` is **not** reinterpreted as Kanban position because it originated as generation-batch ordering.

## Research Project integration

`/ideas?project={projectId}` filters the Board to Idea Candidates explicitly linked through `ar_research_project_idea_links`.

Project membership remains independent from Idea lifecycle:

```text
Project membership != Idea status
```

Changing a card on a Project-filtered Board changes the canonical Idea Candidate status globally. It does not create a Project-specific status.

Both active and archived Projects can be used as Board filters because Project archive freezes Project metadata/membership mutation, not Idea Candidate lifecycle.

Project detail exposes a `Project Idea Board` link to the filtered view.

## Database

Phase 10 has no database migration.

Hosted prestate reverified on AnnoyingRadar authority `yjdubukqkcvkymabskzd`:

- no `ar_*board*` table exists
- `ar_set_idea_candidate_status` remains executable by `service_role` only
- `anon` and `authenticated` cannot execute the mutation RPC directly
- an existing safe `[AR-E2E:]` Idea fixture is linked to a Research Project

## Read projection

`lib/ideas/board-service.mjs` composes:

```text
Idea Candidate
+ source Problem Card title/status
+ explicit Research Project memberships
```

Project memberships are loaded in bulk. The Board does not perform N+1 `loadProjectsForIdea()` calls.

## Out of scope

Phase 10 does not add:

- manual intra-lane persistence/reordering
- priority/business/market score
- ranking
- WIP limits
- task/subtask
- sprint/milestone/deadline
- assignee/collaboration
- notifications
- Project-specific Idea lifecycle
- Problem Board
- automatic status movement

## Verification

Deterministic contracts freeze:

- exact lifecycle lanes
- existing status API/RPC reuse
- Project filter semantics
- no Board schema
- no use of `order_index` as Board position
- drag-and-drop plus select fallback
- no ranking/project-management expansion

Live Browser E2E command:

```text
npm run e2e:idea-board:live
```

The live flow is designed to:

```text
manual login
-> discover recent safe [AR-E2E:] Project-linked Idea via authenticated APIs
-> verify initial lane
-> drag to a reversible target status
-> verify API persistence
-> reload persistence
-> verify status history
-> verify Research Project filter
-> restore original status using select fallback
-> reload and prove final canonical state equals the starting state
```

The runner never stores credentials or a reusable `storageState` artifact.
