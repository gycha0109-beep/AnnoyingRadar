# Phase 7.3 — Idea Review Surface

## Status

- Baseline: `main@4b8f39a6b727b3b39d602340c67a55bd36096e5a`
- Scope: Phase 7 human review/status UX
- Upstream dependencies: Phase 7.1 persistence/status RPCs, Phase 7.2 grounded generator APIs
- Out of scope: Idea Board/kanban, Research Projects, ranking/scoring, reports/export, Phase 7.4 live browser E2E

## Product flow

```text
completed confirmed Problem Card
→ generate / add more Idea Candidates
→ open Idea detail
→ edit active Idea content
→ move Idea status
→ inspect append-only status history
→ re-enter through global Ideas list
```

## Surface contract

### Problem Card detail

For an owned Problem Card where `candidate.status = confirmed` and source `analysis_status = completed`:

- show Idea Candidate section
- load existing Ideas
- show existing count and compact cards
- first generation CTA: `Idea Candidate 생성`
- later generation CTA: `아이디어 추가 생성`
- show latest generation batch model/prompt/timestamp metadata
- link every Idea to `/idea-candidates/{ideaId}`

Generation remains append-only and delegates to the existing Phase 7.2 API.

### Idea Candidate detail

Route: `/idea-candidates/{ideaId}`

Show:

- current Idea status
- generation batch metadata
- source Problem Card link/title/summary
- source linked Evidence excerpts
- all editable Idea fields
- append-only status history

Editable only while status is:

```text
candidate
researching
build_soon
paused
```

`discarded` and `archived` are read-only until restored to an active status.

### Global list

Route: `/ideas`

A lightweight list only:

- title / one-liner
- status
- implementation difficulty
- source Problem Card title
- updated timestamp

No kanban, comparison, project grouping, or ranking is introduced.

## API additions

```text
GET   /api/idea-candidates/{ideaId}
PATCH /api/idea-candidates/{ideaId}
PATCH /api/idea-candidates/{ideaId}/status
```

Content PATCH:

- strict Idea patch contract
- owner check
- no status mutation
- delegates to `ar_update_idea_candidate`

Status PATCH:

- accepts exactly one `status`
- validates transition in JS for fast feedback
- DB RPC remains final authority and writes status history atomically

## Design review finding — inactive edit guard gap

Phase 7.0 explicitly states that `discarded` / `archived` Ideas are read-only until restored. The Phase 7.1 `ar_update_idea_candidate` RPC validates fields but does not currently reject content edits based on the current status.

UI-only disabling is insufficient because the backend service RPC would still accept the write.

Phase 7.3 therefore adds a DB trigger guard on `ar_idea_candidates`:

- when `OLD.status` is `discarded` or `archived`, any content/memo/order mutation is rejected
- a status-only transition through `ar_set_idea_candidate_status` remains allowed
- the guard does not depend on browser behavior

This is a contract remediation, not a new lifecycle.

## Verification gates

- unit/contract tests for API ownership, patch/status separation, inactive edit guard, Problem Card CTA rules, and global list route
- hosted Supabase migration verification
- exact-head GitHub CI
- merge
- merged-main exact-SHA CI

Phase 7.3 does not require a live OpenAI call or manual browser gate; those belong to Phase 7.4.