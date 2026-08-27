# Phase 15.9N — Durable Formation Assessment Persistence

## Status

**IMPLEMENTATION IN PROGRESS / MIGRATION NOT APPLIED / LIVE NOT RUN**

Phase 15.9N adds the missing durable authority between the closed Phase 15.9M curator read-only Formation handoff and any future curator Incident decision flow.

It does **not** create Incident identity, Source→Incident links, problem signatures, Public Evidence, Canonical Problems, or publication state.

---

## 1. Why this phase exists

Phase 15.9M made Formation callable from the curator runtime, but its authority is deliberately ephemeral:

```text
curator_read_only_formation_assessment_not_persistence
```

A future Incident decision cannot safely trust a client-submitted Formation payload, and rerunning the model at approval time can redraw a nondeterministic observation.

Historical Phase 15.8O/P cannot fill this gap because those tools are frozen to a specific 82-row cohort and hard-coded curator decisions.

Therefore the missing authority is:

```text
Durable Source Admission Candidate
        ↓
server-side Formation observation
        ↓ exact context-integrity binding
private append-only Formation assessment
        ↓
future curator Incident decision packet
```

The last arrow is explicitly outside 15.9N.

---

## 2. New private table

Migration:

```text
039_source_formation_assessments.sql
```

Table:

```text
ar_source_formation_assessments
```

The table is private, RLS-enabled, and service-role `SELECT/INSERT` only.

There is no application grant for update or delete. Assessments are append-only observations; a later observation does not silently replace an earlier one.

Each row is bound to:

```text
source_signal_id
source_admission_outcome_id
Source Admission schema + batch version
Formation assessment schema/version
observer version
Formation deterministic mapper version
Formation state/status/reasons
seven Formation semantic axes
full-context integrity metadata
prompt/provider/model identity
provider recovery metadata
```

A unique `(assessment_batch_version, source_signal_id)` constraint prevents duplicate writes inside one governed assessment batch while still allowing a later separately identified assessment batch.

No consumer may infer that the newest row is automatically authoritative. A later curator decision must reference an explicit Formation assessment ID.

---

## 3. Evidence grounding without raw quote persistence

Formation requires an exact grounded `evidence_quote` during evaluation.

15.9N does not store the quote text itself. Instead it stores:

```text
evidence_quote_sha256
evidence_quote_char_count
evidence_quote_start
evidence_quote_end
evidence_quote_grounded
```

The offsets are JavaScript UTF-16 string offsets into the exact full-context text whose SHA-256 and length are stored on the row.

If a future curator flow can refetch the same context hash, it can reconstruct the exact excerpt from the stored offsets and verify its SHA-256 without keeping the raw quote in the durable assessment table.

The table also does not store:

```text
full source body
canonical/fetched URL
author identity
provider request ID
```

The bounded non-authoritative `problem_mechanism_proposal` and `incident_summary_proposal` are retained because they are model output required to reproduce the Formation assessment packet; they do not assign Incident or Problem identity.

---

## 4. Context integrity is mandatory before persistence

A durable Formation assessment is allowed only when the currently fetched full context exactly matches the upstream durable Source Admission authority:

```text
context_status = resolved
context_scope = full_post
context_truncated = false
current SHA-256 = Source Admission context SHA-256
current JS char count = Source Admission context char count
```

The persistence service validates this inside the Formation fetch adapter, before the Formation model call occurs.

Therefore source drift does not consume a model call and does not create a new durable row.

The row builder revalidates the same invariant before insert.

Migration 039 adds a database trigger that independently validates the Source Admission FK and context identity again at write time.

---

## 5. Blind and downstream authority boundary

Before URL/body access, the service requires:

1. Source exists;
2. Source is outside Blind;
3. exactly one durable Source Admission outcome exists;
4. that outcome is `resolved / candidate`;
5. its full context is complete and untruncated;
6. the requested assessment batch does not already contain the Source;
7. no existing Source→Incident or Public Evidence assignment exists.

Migration 039 repeats defense-in-depth checks for:

```text
Blind membership
Source Admission Source/FK/version/batch identity
Source Admission Candidate status
Source Admission ↔ Formation context hash/length identity
existing Incident/Public Evidence assignment
```

A race between application preflight and insert therefore fails closed in PostgreSQL.

---

## 6. Formation authority persisted

The persisted semantic axes are:

```text
problem_claim
experience_actor
friction_specificity
pain_centrality
content_kind
source_origin
friction_responsibility
```

Formation states remain the existing deterministic authority:

```text
eligible
provenance_review
review
reject
```

The existing `source-problem-formation-v0.1` mapper is not changed.

The existing observer v0.2 and provider-incomplete-only recovery policy are not changed.

A persisted `eligible` row is still only Formation authority. It is **not** an Incident or repeated Problem decision.

---

## 7. Runtime/API boundary

Phase 15.9N does not change the closed Phase 15.9M endpoint:

```text
POST /api/radar/admin/source-signals/:signalId/formation
```

That endpoint remains read-only.

15.9N also does not add a public or curator write endpoint yet. The new persistence service is a server-side primitive verified through a controlled one-shot workflow.

A later phase may expose an explicit curator persistence action only after this primitive and its database guard are live-verified.

Client-submitted model/Formation result payloads are not accepted as persistence authority.

---

## 8. Controlled live verification

The first live write will reuse the frozen ordinal 9 Source Admission Candidate without committing its Source UUID to Git.

Pre-live authority:

```text
full-context outcomes = 85
Formation assessments = 0
Blind overlap = 0
```

Expected execution budget:

```text
target = 1
source network requests <= 8
model calls <= 2
Formation assessment inserts = exactly 1
all protected Source/Incident/Public tables = unchanged
```

The controlled batch is:

```text
phase15.9n-ordinal9-persistence-v0.1
```

The resulting Formation state is not predetermined. `eligible`, `provenance_review`, `review`, and `reject` are all model-observation/deterministic-mapper outcomes permitted by the existing Formation contract. The live gate verifies integrity and authority boundaries, not a desired semantic label.

---

## 9. Explicitly unauthorized

Phase 15.9N does not authorize:

```text
automatic Formation persistence on ingestion
client-submitted Formation persistence
latest-row-wins Formation authority
Incident identity creation
Source→Incident linking
problem_signature assignment
repeated-problem clustering
Public Evidence persistence
Canonical Problem persistence
publication
automatic retry beyond provider-incomplete once
Blind evaluation access
```

---

## 10. Closeout requirements

15.9N closes only after:

1. migration/schema/helper/service/tests/workflow land through exact-head CI and PIE;
2. expected-head merge succeeds;
3. merged-main CI succeeds;
4. migration 039 is applied to production and independently verified;
5. the table is empty before the controlled run;
6. one-shot live persistence succeeds from exact authoritative main;
7. exactly one Formation assessment row is independently read back;
8. all pre-existing Source/Incident/Public/Admission counts remain unchanged;
9. temporary live push trigger is removed;
10. live SHA/artifact/DB authority is frozen in docs/tests;
11. closeout exact-head CI/PIE and merged-main CI succeed.
