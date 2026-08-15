# Phase 7 — Problem Card → Idea Candidate Design

## 0. Status

- Phase: 7.0 design / design review
- Baseline: `main@7d448ece75cb1648748c31f1af0edbce2cc4bf39`
- Scope: v0.2 `UC-10 문제를 아이디어 후보로 변환` + `UC-11 아이디어 후보 상태 변경`
- Out of scope for this slice: `UC-09`의 Saved Problems 관리 메타데이터, `UC-12` Research Project 연결, Idea Board, Report/export, 경쟁 서비스 메모, 자동 시장성 판정
- No implementation/migration is included in this document commit.

## 1. Current authority observed in main

Current production code has completed the v0.1 boundary:

```text
Raw Input
→ Pain Evidence
→ Problem Candidate
→ confirmed Problem Card
→ RawInput.analysis_status = completed
```

Physical Problem Card identity remains the existing `ar_problem_candidates.id`; `status = confirmed` is the Problem Card boundary. There is no separate `problem_cards` table and no Idea Candidate code/table in current `main`.

The existing Problem Card detail remains readable after analysis completion, while Candidate mutation/restructure is disabled outside `reviewing_candidates`. Phase 7 must extend this completed/read-only Problem Card surface without reopening the v0.1 analysis state machine.

## 2. Source requirements carried forward

From `Usecase_v2.1.md`:

- Idea Candidate is derived from a confirmed Problem Card.
- No idea generation from an unconfirmed Problem Candidate.
- No standalone idea generation without problem evidence.
- User can edit the generated draft.
- Implementation difficulty is introduced at this stage.
- Idea status values are Candidate / Researching / Build Soon / Paused / Discarded / Archive.
- Status change history must remain available.
- Generated content includes idea name, one-liner, target user, problem statement, core value, first-build scope, excluded scope, implementation difficulty, monetization possibility/hint, and first-screen idea.

From `DB ERD_v1.2.md`:

- Physical source FK is `problem_candidate_id`.
- `idea_candidates.user_id` must match the source `problem_candidates.user_id`.
- Source Problem Candidate must be `confirmed`.
- Physical status spelling is `candidate / researching / build_soon / paused / discarded / archived`.

## 3. Reconciled document inconsistencies

### 3.1 `problem_card_id` vs `problem_candidate_id`

`Usecase_v2.1` uses conceptual `problem_card_id`, while ERD and current implementation model a Problem Card as a confirmed Problem Candidate. Phase 7 therefore uses:

```text
ar_idea_candidates.problem_candidate_id
  → ar_problem_candidates.id
```

No separate Problem Card table is introduced.

### 3.2 `Archive` vs `archived`

UI label may use `Archive`, but persisted status uses `archived` to match the ERD convention.

### 3.3 `first_screen_idea`

UC-10 explicitly requires a first-screen idea, but the ERD/Data section omits the field. Phase 7 keeps the explicit use-case requirement and adds physical `first_screen_idea` to the v0.2 schema proposal.

### 3.4 Status history

UC-11 explicitly requires status-change history, but the ERD has no history structure. Phase 7 adds a dedicated append-only status event table rather than overloading the current row.

## 4. Phase 7 product boundary

Phase 7 is an Idea Candidate vertical slice, not the whole v0.2 management layer.

```text
Completed Problem Card
→ AI Idea generation
→ persisted Idea Candidate(s)
→ human edit
→ status decision
→ status history
```

Phase 7 does not yet require a Research Project or Saved Problems metadata model. The existing confirmed Problem Card is the source entry point.

## 5. Source eligibility

An Idea Candidate generation request is allowed only when all conditions are true:

```text
problem_candidate.user_id = current user
problem_candidate.status = confirmed
problem_candidate.evidence_count >= 1
source raw_input.user_id = current user
source raw_input.analysis_status = completed
```

The additional `completed` requirement is deliberate. Current v0.1 allows confirmed Candidates to be restored while the Raw Input is still in `reviewing_candidates`; generating ideas before completion would allow the source to stop being a Problem Card after Idea rows already reference it. Requiring `completed` makes the Problem Card source stable without adding snapshot semantics or destructive cascades to user-generated ideas.

Phase 7 does **not** add new values to `RawInput.analysis_status`. Idea generation is a downstream workflow with its own records, not another Raw Input analysis state.

## 6. AI generation contract

### 6.1 Input

The generator receives only the selected Problem Card and its linked Evidence:

```text
Problem Card
- id
- title
- summary
- target_user
- situation
- intensity_level
- repeat_pattern_level
- clarity_level

Linked Evidence[]
- original_text
- summary_ko
- pain_type
- target_user
- situation
- sentiment_level
- intensity_level
- source_type
- source_url/source_memo where available
```

The full Raw Input is not required for generation. This keeps the derivation boundary explicit and reduces unrelated source text entering the prompt.

### 6.2 Output

One generation request returns `1..3` meaningfully distinct Idea Candidate drafts. Each item contains:

```text
title
one_liner
target_user
problem_statement
core_value
first_build_scope
excluded_scope
implementation_difficulty
monetization_hint
first_screen_idea
```

`memo` is user-authored and is not generated by AI.

### 6.3 Grounding rules

The provider prompt and post-validation must enforce:

- Every idea must address the supplied confirmed Problem Card.
- `problem_statement` must remain consistent with the source Problem Card/Evidence.
- AI must not claim validated market demand, revenue, competitor absence, or implementation certainty without evidence.
- `monetization_hint` is a hypothesis, not a marketability score.
- `implementation_difficulty` is a provisional build-scope estimate, not an objective engineering estimate.
- No single aggregate score or automatic ranking is introduced.
- Generated ideas are always drafts; AI never moves them to Researching/Build Soon automatically.

### 6.4 Implementation difficulty

Persisted values:

```text
low
medium
high
unknown
```

This is intentionally categorical and non-numeric. It is based on the proposed `first_build_scope` only and remains user-editable.

## 7. Generation/retry semantics

Generation is non-destructive.

- First generation appends a new batch of `1..3` Idea Candidates.
- Later `추가 생성` requests append a new batch; they never replace or delete earlier ideas.
- Existing user edits and status decisions are preserved.
- Provider failure produces no Idea Candidate DB mutation.
- Provider output is fully validated before persistence.
- Successful persistence of one generation batch is atomic.

This avoids the destructive regeneration problem present when AI output is treated as a replaceable draft set.

## 8. Proposed persistence model for Phase 7.1

### 8.1 `ar_idea_generation_batches`

Purpose: one successful provider generation event and its provenance.

```text
id uuid PK
user_id uuid FK auth.users
problem_candidate_id uuid FK ar_problem_candidates
model text
prompt_version text
provider_request_id text null
generation_input_tokens integer null
generation_output_tokens integer null
created_at timestamptz
```

Rules:

- owner must match source Problem Card owner.
- source must be `confirmed` and belong to a `completed` Raw Input at insertion time.
- a batch is created only after provider output validates.

### 8.2 `ar_idea_candidates`

```text
id uuid PK
user_id uuid FK auth.users
problem_candidate_id uuid FK ar_problem_candidates
generation_batch_id uuid FK ar_idea_generation_batches

title text not null
one_liner text
 target_user text
problem_statement text
core_value text
first_build_scope text
excluded_scope text
implementation_difficulty text
monetization_hint text
first_screen_idea text

status text not null default 'candidate'
memo text
order_index integer
created_at timestamptz
updated_at timestamptz
```

Physical status values:

```text
candidate
researching
build_soon
paused
discarded
archived
```

No physical DELETE API is part of Phase 7.

### 8.3 `ar_idea_candidate_status_events`

Append-only status history:

```text
id uuid PK
user_id uuid FK auth.users
idea_candidate_id uuid FK ar_idea_candidates
from_status text null
to_status text not null
created_at timestamptz
```

Initial creation records `from_status = null`, `to_status = candidate`.

## 9. Status transition contract

Phase 7 favors reversible organization states while preserving history.

Allowed transitions:

```text
candidate   → researching | build_soon | paused | discarded | archived
researching → candidate | build_soon | paused | discarded | archived
build_soon  → candidate | researching | paused | discarded | archived
paused      → candidate | researching | build_soon | discarded | archived
discarded   → candidate | archived
archived    → candidate | researching | build_soon | paused | discarded
```

A same-status write is rejected as a no-op request. Every successful transition updates the Idea Candidate and inserts one status event in the same DB transaction.

## 10. DB/security contract

Follow the v0.1 security boundary:

- authenticated client may SELECT only its own Idea data through RLS.
- client direct INSERT/UPDATE/DELETE is not granted.
- writes occur through server API routes using the service client.
- mutation RPC execution is restricted to backend/service role as appropriate.
- DB validates owner/source relationships again even after server authorization.
- batch + Idea Candidate insert is atomic.
- Idea Candidate status update + history event insert is atomic.

Suggested DB guards:

```text
idea.user_id = source_problem.user_id
batch.user_id = source_problem.user_id
batch.problem_candidate_id = idea.problem_candidate_id
source_problem.status = confirmed
source_raw_input.analysis_status = completed
implementation_difficulty in (low, medium, high, unknown)
status in (candidate, researching, build_soon, paused, discarded, archived)
order_index >= 0 when present
```

## 11. API contract proposal

```text
GET   /api/problem-candidates/{candidateId}/ideas
POST  /api/problem-candidates/{candidateId}/ideas/generate

GET   /api/idea-candidates/{ideaId}
PATCH /api/idea-candidates/{ideaId}
PATCH /api/idea-candidates/{ideaId}/status
```

`PATCH /api/idea-candidates/{ideaId}` edits draft content/memo/order only; it does not change `status`.

`PATCH /status` accepts one explicit `status` value and delegates transition validation/history to one DB transaction.

No delete route is added.

## 12. UI integration proposal

### 12.1 Existing Problem Card detail

Keep current v0.1 problem definition/evidence content read-only after `completed`, then add an independent Phase 7 section:

```text
Idea Candidates
- existing idea count
- Generate Idea Candidates
- Add more ideas
- latest provider metadata
- compact idea cards
```

CTA exposure:

```text
candidate.status = confirmed
AND raw_input.analysis_status = completed
```

For draft/discarded/uncompleted sources, no generation CTA is shown.

### 12.2 Idea Candidate detail page

Route:

```text
/idea-candidates/{ideaId}
```

Editable fields:

- title
- one_liner
- target_user
- problem_statement
- core_value
- first_build_scope
- excluded_scope
- implementation_difficulty
- monetization_hint
- first_screen_idea
- memo

Always show source traceability:

- source Problem Card link
- source Problem Card title/summary
- linked Evidence excerpts
- generation model/prompt metadata
- current status
- status history

### 12.3 Simple Idea list

Phase 7.3 should add a lightweight `/ideas` list to satisfy the v0.2 “간단한 아이디어 목록” requirement. It is not an Idea Board: no kanban, project grouping, comparison, or ranking.

## 13. Proposed implementation stages

### 7.1 — DB / contract foundation

- migrations for generation batch, Idea Candidate, status event
- RLS/indexes/triggers/RPCs
- JS normalization contracts
- DB integration tests

### 7.2 — grounded AI generator

- `lib/ideas/openai-generator.mjs`
- `OPENAI_IDEA_MODEL`
- strict Structured Outputs
- source-grounding validation
- provider unit tests
- live provider evaluation fixture/runner
- atomic generate API

### 7.3 — human review / status UX

- Problem Card Idea section
- Idea Candidate detail/edit page
- status transition/history UI
- simple global Idea list

### 7.4 — release hardening / live browser E2E

Extend the existing manual-login live browser flow after v0.1 completion:

```text
completed Problem Card
→ generate Idea Candidates
→ open Idea detail
→ edit one generated draft
→ status candidate → researching
→ status researching → build_soon
→ verify history
→ reload/re-enter and verify persistence
```

CI remains deterministic and does not require the user's live OpenAI key. Live provider evaluation and headful browser E2E remain explicit release gates.

## 14. Design review findings

### DR-01 — Do not extend `RawInput.analysis_status`

Idea generation occurs after problem analysis. Adding `generating_ideas` to the Raw Input state machine would couple two different lifecycles and weaken the already-hardened terminal `completed` invariant. Rejected.

### DR-02 — Do not create a separate `problem_cards` table

Current code and source documents use confirmed `ar_problem_candidates` as the physical Problem Card. Duplicating it would create identity/synchronization problems. Rejected.

### DR-03 — Do not generate before analysis completion

A confirmed Candidate can still return to draft while `reviewing_candidates`. That would violate the Idea source invariant. Phase 7 requires a completed source analysis. Accepted correction.

### DR-04 — Preserve old ideas on regeneration

Replacing the generated set would destroy user edits and decisions. Generation is append-only by batch. Accepted correction.

### DR-05 — Persist status history explicitly

UC-11 requires history; a single status column cannot satisfy it. Add an append-only status event table. Accepted correction.

### DR-06 — No numeric “business score”

Implementation difficulty is categorical and monetization is text/hypothesis. No automatic ranking or marketability score. Accepted correction.

### DR-07 — Keep `first_screen_idea`

The specific UC-10 requirement wins over its omission from the older ERD field list. Add it to the Phase 7 physical schema. Accepted correction.

### DR-08 — UC-09 / UC-12 remain separate

Confirmed Problem Cards already persist, but the v0.2 Saved Problems requirements also mention category/memo/state, and Research Project linking is a separate lifecycle. Phase 7 does not silently mark those requirements complete; they remain for the following management slice.

## 15. Phase 7.0 acceptance criteria

Design is ready for implementation when all of the following are accepted:

- Problem Card physical identity remains `ar_problem_candidates.id`.
- Idea generation is allowed only from an owned confirmed Problem Card whose Raw Input is completed.
- Idea generation does not mutate the Raw Input analysis state.
- AI generation is evidence-grounded and returns 1..3 drafts.
- regeneration is append-only/non-destructive.
- Idea Candidate status lifecycle and history are explicit.
- `first_screen_idea` discrepancy is resolved by retaining the field.
- no project/board/report/ranking scope leaks into Phase 7.
- DB/API/UI/E2E implementation stages are separable and testable.
