# Phase 15.8R — Canonical Draft Persistence

## Status

**LIVE VERIFIED / CLOSEOUT READY**

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

source_count:      2
incident_count:    2
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

always inserts a new draft and the pre-15.8R `ar_public_problems` schema had no Canonical formation identity or uniqueness key.

Therefore rerunning a formation persistence job could create duplicate drafts for one problem mechanism.

Phase 15.8R does not use title text as identity.

Migration 036 adds an internal nullable identity:

```text
problem_signature
```

with a partial unique index applying only to non-null signatures.

Historical/manual Public Problems remain `NULL`; no forced backfill was performed.

---

## 3. Migration 036 — live applied

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

The governed RPC is:

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

Live preflight after migration 036 confirmed:

```text
problem_signature column: present
partial unique index:     present
service_role execute:     true
anon execute:             false
authenticated execute:    false
legacy Problems:          2 rows, both problem_signature = NULL
target signature rows:    0
public feed:              2
Public Evidence:          5
```

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

The exact title/summary/target/situation/category came from the already-ready 15.8Q draft authority. 15.8R did not synthesize or rewrite them during persistence.

---

## 5. Authoritative live run

Authoritative main at live execution:

```text
a146231c57be3f695c90b4a56953abfdac1c1b2e
```

Implementation authority:

```text
PR #107
exact-head CI #403: SUCCESS
PIE #78:           SUCCESS
merged-main CI #404: SUCCESS
```

Live workflow:

```text
Source Canonical Draft Persistence 15.8R
run: 32918855367
result: SUCCESS
```

Artifact:

```text
id: 9589115880
name: source-canonical-draft-persistence-15-8r
digest: sha256:783dc4249010b56e15e815e26d5a9dc59455a7de50484eff6d9ab40ffd15a72a
retention: 1 day
```

Artifact result:

```text
status: CANONICAL_DRAFT_PERSISTED
version: canonical-draft-only-persistence-v0.1
problem_signature: lodging_reservation_fulfillment_gap
source_count: 2
incident_count: 2
public_problem_status: draft
canonical_draft_rows_for_signature: 1
canonical_draft_evidence_count: 0
canonical_draft_public_feed_rows: 0
write_rpc_calls: 1
public_problem_id_emitted: false
source_signal_ids_emitted: false
public_evidence_write_count: 0
existing_problem_mutation_count: 0
publication_count: 0
```

---

## 6. Exact live mutation

Workflow snapshot before:

```text
source_signals:          3245
source_observations:     3537
source_ingestion_runs:   132
raw_inputs:              10
pain_evidences:          27
public_problems:         2
public_evidence:         5
public_feed:             2
source_incidents:        6
source_incident_links:   7
full_context_outcomes:   82
```

Workflow snapshot after:

```text
source_signals:          3245
source_observations:     3537
source_ingestion_runs:   132
raw_inputs:              10
pain_evidences:          27
public_problems:         3
public_evidence:         5
public_feed:             2
source_incidents:        6
source_incident_links:   7
full_context_outcomes:   82
```

Only one new `ar_public_problems` draft row was created.

---

## 7. Independent database post-readback

An independent Supabase readback after the workflow confirmed:

```text
Public Problems:             3
Published Problems:          2
Draft Problems:              1
Public feed:                 2
Public Evidence:             5

target signature rows:       1
target active draft rows:    1
target Evidence rows:        0
target public-feed rows:     0

Source Signals:              3245
Source Observations:         3537
Source Ingestion Runs:       132
Raw Inputs:                  10
Pain Evidences:              27
Source Incidents:            6
Source Incident Links:       7
Full-context Outcomes:       82
```

The independent readback therefore matches the workflow artifact exactly.

---

## 8. Idempotent rerun behavior

The database unique identity prevents more than one non-null row for the same `problem_signature`.

The runner checks before calling the write RPC:

```text
0 matching rows → one governed create RPC allowed
1 exact matching draft → no write; report already persisted
1 conflicting/non-draft row → fail closed
>1 rows → invariant failure
```

Thus a manual workflow rerun cannot intentionally create another copy of the same Canonical draft.

---

## 9. Runner boundary

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

## 10. Privacy and artifact boundary

The one-day aggregate artifact contains only governed metadata and counts.

It does not emit:

```text
Public Problem UUID
Source Signal UUIDs
full source bodies
```

---

## 11. Explicit exclusions

Phase 15.8R did not authorize or perform:

```text
Public Evidence persistence
Evidence excerpt synthesis
existing published Problem edits
merging with the lodging exception/refund Problem
status transition to published
publication
```

The persisted row is a draft only.

A later phase must separately establish publication-grade Evidence lineage before the draft can even become structurally publishable.

---

## 12. Closeout

The temporary live branch trigger is removed in the closeout changeset.

Retained workflow trigger:

```text
workflow_dispatch only
```

Closeout condition:

```text
closeout exact-head CI = SUCCESS
PIE = SUCCESS
closeout merge = SUCCESS
merged-main CI = SUCCESS
```

When those conditions hold:

```text
Phase 15.8R = CLOSED
```
