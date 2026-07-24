# Phase 5 — Problem Candidate Review & Confirmation

## 1. Goal

Turn AI-generated `draft` Problem Candidates into user-reviewed Problem Cards without losing Evidence traceability.

Pipeline boundary:

```text
reviewing_candidates -> completed
```

A Problem Card is not a separate table in v0.1. It is an `ar_problem_candidates` row with `status = 'confirmed'`.

## 2. P0 scope

- Candidate list and detail views
- Edit title, summary, target user, situation, metrics, and order
- Confirm Candidate as Problem Card
- Discard and restore Candidate
- Move Evidence between draft Candidates
- Merge two draft Candidates
- Split one draft Candidate into two Candidates
- Complete review only when no draft Candidate remains and at least one confirmed Problem Card exists
- Preserve discarded records for audit; do not hard-delete reviewed Candidates

## 3. State and mutation rules

### Raw Input

- Candidate mutations are allowed only while `analysis_status = reviewing_candidates`.
- `completed` is read-only in Phase 5.
- Completion requires:
  - at least one confirmed Candidate
  - zero draft Candidates
  - every confirmed Candidate has at least one linked Evidence
  - stored `evidence_count` equals the actual link count

### Candidate

```text
draft -> confirmed | discarded
confirmed -> draft | discarded
discarded -> draft
```

- Confirmation requires a non-empty title, non-empty summary, and at least one linked Evidence.
- Merge, split, and Evidence movement accept only draft Candidates.
- Merge preserves the source row as `discarded` with a merge audit reason and removes its links.
- Split requires at least one Evidence to remain on the source and at least one Evidence to move to the new Candidate.
- Evidence cannot be left unassigned or linked to multiple active Candidates by Phase 5 operations.

## 4. Database design

Migration `009_candidate_review.sql` adds service-role-only RPCs:

- `ar_update_problem_candidate`
- `ar_set_problem_candidate_status`
- `ar_move_candidate_evidence`
- `ar_merge_problem_candidates`
- `ar_split_problem_candidate`
- `ar_complete_candidate_review`

A link-count trigger keeps `problem_candidates.evidence_count` synchronized after insert, delete, or link movement.

All RPCs:

- lock the owning Raw Input and affected Candidates with `FOR UPDATE`
- verify user ownership and same Raw Input boundaries
- reject mutations outside `reviewing_candidates`
- execute each multi-row operation atomically
- expose execution only to `service_role`

## 5. API design

```text
GET   /api/problem-candidates/[candidateId]
PATCH /api/problem-candidates/[candidateId]
PATCH /api/problem-candidates/[candidateId]/confirm
PATCH /api/problem-candidates/[candidateId]/discard
PATCH /api/problem-candidates/[candidateId]/restore
PATCH /api/problem-candidates/[candidateId]/evidence
POST  /api/problem-candidates/[candidateId]/merge
POST  /api/problem-candidates/[candidateId]/split
PATCH /api/raw-inputs/[rawInputId]/complete
```

The existing Raw Input Candidate list API accepts `include_discarded=1` for review history.

## 6. UI design

### Candidate list

- Distinguish `Problem Candidate`, `Problem Card`, and discarded Candidate
- Show Evidence count, metrics, and `근거 부족` when count is one
- Link each active Candidate to the detail page
- Hide discarded items by default; provide a review-history toggle
- Enable review completion only when all draft Candidates are resolved

### Candidate detail

- Editable Candidate fields
- Full Evidence text and source context
- Move each Evidence to another draft Candidate
- Select Evidence to split into a new Candidate
- Merge current Candidate into another draft Candidate
- Confirm, discard, or restore
- Read-only display after Raw Input completion

## 7. Design review findings and corrections

1. **Hard delete was rejected.** It would erase the decision trail. Discarded rows remain auditable.
2. **Direct table writes were rejected.** Candidate status and link changes must use guarded RPCs.
3. **Stored Evidence count without synchronization was rejected.** A DB trigger is required.
4. **Allowing completion with unresolved drafts was rejected.** It creates ambiguous final state.
5. **Allowing free Evidence removal was rejected.** It would create unassigned confirmed Evidence. Phase 5 supports move, merge, split, or Candidate discard instead.
6. **Mutating completed analyses was rejected.** v0.1 treats completed output as immutable; revision starts from a new Raw Input or a later explicit reopen feature.

## 8. Verification plan

- Static contract tests for routes, RPC names, and UI controls
- Unit tests for payload normalization and allowed state transitions
- Rollback-based DB integration verification:
  - edit
  - confirm validation
  - discard/restore
  - Evidence movement
  - merge audit preservation
  - split partition
  - count synchronization
  - cross-user/cross-input rejection
  - completion gate
  - atomic rollback
- GitHub Actions lint, tests, build, and runtime smoke
- Manual browser flow after CI
