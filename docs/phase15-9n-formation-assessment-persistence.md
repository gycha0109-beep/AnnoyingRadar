# Phase 15.9N — Durable Formation Assessment Persistence

## Status

**CLOSED**

Phase 15.9N establishes a durable, private, append-only Formation assessment authority between Source Admission Candidate outcomes and any future curator Incident decision flow.

It does **not** create Incident identity, Source→Incident links, problem signatures, Public Evidence, Canonical Problems, or publication state.

---

## 1. Authority introduced

Phase 15.9M left curator Formation assessment intentionally ephemeral:

```text
curator_read_only_formation_assessment_not_persistence
```

Phase 15.9N adds the missing durable boundary:

```text
Durable Source Admission Candidate
        ↓
server-side Formation observation
        ↓ exact context-integrity binding
private append-only Formation assessment
        ↓
future curator Incident decision packet
```

The last arrow remains outside this phase.

A persisted `eligible` result is still **Formation authority only**. It is not an Incident decision and does not authorize publication.

---

## 2. Implementation authority

Implementation PR:

```text
PR #150
```

Initial implementation head:

```text
82c6c1c0a26aaf16d62defd9ebe2e2d4e996f937
```

Initial gates:

```text
CI #500 = FAILURE
PIE #134 = SUCCESS
```

CI #500 did not expose a production implementation defect. The failing unit assertion expected the downstream durable-Admission drift error, while the helper correctly failed earlier on a stricter fetch-integrity invariant: the changed `content_text` no longer matched the declared `content_hash`.

The test was corrected to freeze both independent fail-closed boundaries:

```text
1. fetched content_text ↔ declared content_hash mismatch → reject
2. internally consistent fetched context ↔ durable Source Admission drift → reject
```

Production helper/service/migration code was unchanged by this correction.

Corrected exact PR head:

```text
59d3dd9e7c7f80b687b69ad2deb7140e93607e09
```

Corrected gates:

```text
CI #501 = SUCCESS
PIE #135 = SUCCESS
```

Expected-head merge succeeded.

Implementation main:

```text
d2b9fd17e360801569ea5af08cb84b6c87bf20d0
```

Merged-main gate:

```text
CI #502 = SUCCESS
```

---

## 3. Migration 039 production authority

Repository migration:

```text
039_source_formation_assessments.sql
```

Supabase production migration version:

```text
20260827090327 source_formation_assessments
```

Table:

```text
public.ar_source_formation_assessments
```

Independent post-migration verification before the controlled live write proved:

```text
table exists = true
row count = 0
guard trigger exists = true
RLS enabled = true
service_role SELECT = true
service_role INSERT = true
service_role UPDATE = false
service_role DELETE = false
```

The table remains private and append-only.

---

## 4. Integrity and data-minimization contract

Every durable Formation row is bound to an explicit durable Source Admission outcome by:

```text
source_signal_id
source_admission_outcome_id
Source Admission schema version
Source Admission batch version
full-context SHA-256
full-context JS character count
full-context truncation state
```

Before source URL/body loading, the server requires:

1. Source exists;
2. Source is outside Blind;
3. exactly one durable Source Admission outcome exists for that Source;
4. that outcome is `resolved / candidate`;
5. its context is resolved, full-post and untruncated;
6. the requested assessment batch does not already contain that Source;
7. no downstream Incident/Public Evidence assignment already exists.

Before the model call, the freshly acquired context must exactly match the durable Source Admission hash and character count. The row builder validates the same invariant again, and migration 039 repeats the lineage/context checks in PostgreSQL.

The durable row does **not** persist:

```text
full source body
canonical/fetched URL
author identity
provider request ID
raw evidence quote
```

Evidence grounding is stored only as:

```text
evidence_quote_sha256
evidence_quote_char_count
evidence_quote_start
evidence_quote_end
evidence_quote_grounded
```

Offsets are JavaScript UTF-16 offsets into the exact integrity-bound context.

---

## 5. Controlled production live run

Temporary execution branch:

```text
agent/phase15-9n-live-execution
```

The workflow checked out authoritative `main`, not the temporary branch contents.

Workflow:

```text
Source Formation Assessment Persistence 15.9N
```

Live run:

```text
run #1 = 33057599171
execution SHA = d2b9fd17e360801569ea5af08cb84b6c87bf20d0
status = SUCCESS
```

Disposable artifact:

```text
artifact id = 9640308569
sha256:469d2588fb663e8254b003bb29abf0be97dffef82e3a884c5c889d65c98c9bdc
```

Controlled target:

```text
baseline ordinal = 9
Blind member = false
assessment batch = phase15.9n-ordinal9-persistence-v0.1
```

Execution budget/result:

```text
source network requests = 1 / max 8
model calls = 2 / max 2
database write statements = 1
Formation assessments = 0 → 1
```

The first Formation provider attempt was incomplete and the existing bounded recovery policy performed exactly one retry:

```text
recovery attempted = true
recovery recovered = true
recovery attempt count = 2
trigger = source_formation_provider_incomplete
```

No broader retry policy was introduced.

---

## 6. Live Formation result

The durable assessment observed:

```text
status = resolved
formation_state = eligible
reason = formation_grounded_external_friction
```

Semantic facts:

```text
problem_claim = yes
experience_actor = self
friction_specificity = concrete
pain_centrality = central
content_kind = organic
source_origin = original
friction_responsibility = external_process_or_policy
```

Context authority:

```text
context SHA-256 = 4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463
context char count = 3407
context truncated = false
```

Evidence grounding metadata:

```text
evidence quote SHA-256 = fafd5798cf5e8cc9ffb82507d550163fd84202f4d9430c053906727cef4a775c
evidence quote char count = 44
evidence quote start = 2361
evidence quote end = 2405
evidence quote grounded = true
```

Provider authority:

```text
prompt = source-problem-formation-semantic-v0.1
provider = openai
model = gpt-5-mini-2025-08-07
```

---

## 7. Independent production readback

Independent Supabase readback after the live workflow confirmed exactly one row in the controlled batch with the same `eligible / resolved` state, semantic facts, context hash/length, evidence-grounding metadata and recovery metadata recorded by the artifact.

Protected production counts after the write:

```text
ar_source_signals = 3562
ar_source_signal_observations = 3892
ar_source_ingestion_runs = 144
ar_raw_inputs = 10
ar_pain_evidences = 27
ar_public_problems = 3
ar_public_problem_evidence_snapshots = 7
ar_public_problem_feed = 3
ar_source_incidents = 6
ar_source_incident_links = 7
ar_source_full_context_resolution_outcomes = 85
ar_source_formation_assessments = 1
```

The artifact's before/after snapshots independently showed all pre-existing Source/Incident/Public/Admission domains unchanged.

Only the new Formation assessment table changed:

```text
0 → 1
```

---

## 8. Runtime/API boundary remains unchanged

Phase 15.9N does not convert the Phase 15.9M route into a persistence endpoint:

```text
POST /api/radar/admin/source-signals/:signalId/formation
```

That route remains read-only.

15.9N persistence remains a controlled server-side primitive. There is no curator/client write endpoint and no client-submitted model payload is accepted as persistence authority.

The temporary live push trigger has been removed at closeout. The workflow is manual-only via `workflow_dispatch`.

---

## 9. Explicitly unauthorized after closeout

Phase 15.9N still does not authorize:

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

In particular:

```text
Formation eligible ≠ Incident approved
Formation persisted ≠ Source linked to Incident
Formation persisted ≠ Public Evidence
Formation persisted ≠ publication
```

---

## 10. Closeout conclusion

Phase 15.9N is closed because:

1. private append-only Formation persistence landed through exact-head CI/PIE;
2. the only initial CI failure was a stricter fail-closed test expectation mismatch and was corrected without weakening production code;
3. implementation merged and merged-main CI passed;
4. migration 039 was applied and independently verified in production;
5. the table was empty before the controlled run;
6. one exact authoritative live run persisted exactly one integrity-bound Formation assessment;
7. independent DB readback matched the disposable artifact;
8. all pre-existing protected domains remained unchanged;
9. the temporary live push trigger was removed;
10. the resulting `eligible` row remains explicitly outside Incident/Public Evidence/publication authority.

**PHASE 15.9N = CLOSED**
