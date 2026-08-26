# Phase 15.8R — Canonical Draft Persistence

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.8R persists exactly one Phase 15.8Q-ready Canonical Problem as a non-public draft.

It does not add Public Evidence, mutate existing published Problems, or publish anything.

---

## 1. Upstream authority

Phase 15.8Q closed with the read-only Canonical Draft Gate result:

```text
problem_signature:
  lodging_reservation_fulfillment_gap

draft_state:
  ready

reason:
  draft_supported_by_independent_incidents

source_count:     2
incident_count:   2
persistence_state: not_persisted
publication_state: not_published
```

The draft is distinct-adjacent to the existing published lodging exception/refund Problem. Merge or mutation of that existing Problem remains unauthorized.

---

## 2. Why a new persistence identity is required

The existing RPC:

```text
ar_create_public_problem(...)
```

always inserts a new draft and the current `ar_public_problems` schema has no Canonical formation identity or uniqueness key.

Therefore rerunning a formation persistence job could create duplicate drafts for one problem mechanism.

Phase 15.8R does not use title text as identity.

Migration 036 adds an internal nullable identity:

```text
problem_signature
```

with a partial unique index applying only to non-null signatures.

Historical/manual Public Problems may remain `NULL`; no forced backfill is performed.

---

## 3. Migration 036

```text
036_canonical_public_problem_draft_identity.sql
```

Adds:

```text
ar_public_problems.problem_signature text NULL
```

and:

```text
UNIQUE(problem_signature)
WHERE problem_signature IS NOT NULL
```

The new governed RPC is:

```text
ar_create_canonical_public_problem_draft(
  p_curator_user_id,
  p_problem_signature,
  p_title,
  p_summary,
  p_target_user,
  p_situation,
  p_category
)
```

Properties:

- Radar curator authority required;
- creates status `draft` only;
- never sets `published_at`;
- same signature + same exact draft content is idempotent;
- same signature + different content fails closed;
- a non-draft existing row for the signature fails closed;
- public/anon/authenticated execution revoked;
- service-role execution only.

The existing `ar_create_public_problem()` remains available for its existing manual compatibility surface.

---

## 4. Persisted draft content

Signature:

```text
lodging_reservation_fulfillment_gap
```

Title:

```text
숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다
```

Category:

```text
travel_booking
```

The exact title/summary/target/situation/category come from the already-ready 15.8Q draft authority. 15.8R does not synthesize or rewrite them during persistence.

---

## 5. Expected live mutation

Before first live persistence:

```text
Public Problems: 2
Published:       2
Public feed:     2
Public Evidence: 5
```

Expected first successful transition:

```text
Public Problems: 2 → 3
New signature rows: 0 → 1
New row status: draft
New row Evidence: 0
Public feed: 2 → 2
Public Evidence: 5 → 5
```

All Source/Incident/full-context tables remain unchanged.

The anonymous feed already filters strictly to `status='published'`, so the new draft must remain absent from public feed readback.

---

## 6. Idempotent rerun behavior

The database unique identity prevents more than one non-null row for the same `problem_signature`.

The runner also checks before calling the write RPC:

```text
0 matching rows → one governed create RPC allowed
1 exact matching draft → no write; report already persisted
1 conflicting/non-draft row → fail closed
>1 rows → invariant failure
```

Thus a manual workflow rerun cannot intentionally create another copy of the same Canonical draft.

---

## 7. Runner boundary

Runner:

```text
scripts/run-canonical-draft-persistence-15-8r.mjs
```

Before persistence it reconstructs current 15.8Q authority from:

```text
persisted approved Incidents
+ persisted Source links
+ existing published lodging Problem
```

It then builds a draft-only persistence plan and permits at most one write RPC:

```text
ar_create_canonical_public_problem_draft
```

No direct insert/update/delete/upsert is present in the runner.

After persistence it verifies:

```text
exactly one row for problem_signature
exact draft content
status = draft
published_at = NULL
archived_at = NULL
Evidence count = 0
public feed rows for draft = 0
```

---

## 8. Privacy and artifact boundary

The one-day aggregate artifact may contain:

```text
problem_signature
source_count / incident_count
status
database counts
write RPC count
Evidence count
public-feed count
```

It does not emit:

```text
Public Problem UUID
Source Signal UUIDs
full source bodies
```

---

## 9. Explicit exclusions

Phase 15.8R does not authorize or perform:

```text
Public Evidence persistence
Evidence excerpt synthesis
existing published Problem edits
merging with the lodging exception/refund Problem
status transition to published
publication
```

After successful draft persistence, a later phase must separately establish publication-grade Evidence lineage before the draft can even become structurally publishable.

---

## 10. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ apply migration 036
→ privilege + identity preflight
→ authoritative one-shot live run
→ independent DB readback
→ closeout removes temporary trigger
→ closeout CI / PIE
→ merge
→ merged-main CI
→ Phase 15.8R CLOSED
```
