# Phase 15.9I — Confirmed False-Negative Candidate Outcome Persistence

## Status

**CLOSED**

Phase 15.9I follows the closed Phase 15.9H provider-incomplete recovery reproduction.

Phase 15.9H confirmed three snippet-level Source Admission false negatives at deterministic sample ordinals 4, 9, and 16. Phase 15.9I preserved only those already-confirmed Candidate outcomes in the existing append-only full-context outcome table.

The phase did **not** rerun the semantic provider and did **not** alter Source Admission, Incident, or Public Problem authority.

Final result:

```text
targets = 3
context integrity verified = 3/3
semantic-provider calls = 0
DB write statements = 1 bulk INSERT
outcome rows = 82 -> 85
Phase 15.9I batch rows = 3
all 3 = resolved / candidate
protected domains = unchanged
```

---

## 1. Release authority

Implementation:

```text
PR #138
exact implementation head = 7aa6d4d2c5d6342913a64ebd1b649da4e0e0bd3b
CI #474 = SUCCESS
PIE #120 = SUCCESS
merge/main = 26f1db7eb5a2eed95724d6a08ad916824b3df7e8
merged-main CI #475 = SUCCESS
```

One-shot live persistence:

```text
workflow = Source Confirmed False-Negative Outcome Persistence 15.9I
run #1
Actions run id = 33042653519
execution head = 26f1db7eb5a2eed95724d6a08ad916824b3df7e8
result = SUCCESS
artifact id = 9634450429
artifact retention = 1 day
```

The temporary `agent/phase15-9i-live-execution` push trigger is removed by the Phase 15.9I closeout. The workflow remains manual-only through `workflow_dispatch`.

---

## 2. Existing durable authority reused

Phase 15.9I created no new table, schema, semantic policy, or retry policy.

It reused:

```text
ar_source_full_context_resolution_outcomes
source-full-context-outcome-v0.1
buildSourceFullContextOutcomeRow()
persistSourceFullContextOutcomeRows()
resolveFullContextSemantic()
```

Batch version:

```text
phase15.9i-confirmed-false-negative-candidates-v0.1
```

The existing outcome table remains the private append-only authority for full-context resolution results.

---

## 3. Frozen Phase 15.9H Candidate authority

Exact Phase 15.9G/H deterministic sample fingerprint:

```text
2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e
```

Confirmed Candidate ordinals:

```text
4, 9, 16
```

All three frozen semantic observations were:

```text
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
```

The existing pure resolver continued to map each observation to:

```text
decision = candidate
reason = full_context_first_hand_external_friction
```

Original snippet-level rejection strata were:

```text
ordinal 4  -> title_no_complaint_signal
ordinal 9  -> title_truncated_no_complaint_signal
ordinal 16 -> title_information_or_guide
```

Phase 15.9I did not place Source UUIDs, canonical URLs, author handles, raw bodies, exact evidence quotes, or provider request identifiers into repository authority.

---

## 4. No semantic redraw

Phase 15.9I intentionally made no semantic-provider request.

```text
model_calls = 0
OpenAI credential supplied to workflow = false
```

The provider/model fields stored in the durable outcome rows describe the already-observed Phase 15.9H semantic authority. They are not evidence of a new model call in Phase 15.9I.

Likewise, Phase 15.9I did not freeze or persist the exact Phase 15.9H `evidence_quote`. The durable Candidate authority consists of the six semantic facts, resolver result, context integrity metadata, prompt/provider/model metadata, and bounded recovery metadata allowed by the existing outcome schema.

---

## 5. Reconstruction boundary

The live runner reconstructed the same Phase 15.9C campaign and exact Phase 15.9G/H sample before accessing target bodies.

Verified live authority:

```text
8 ingestion runs
351 observations
313 newly inserted Sources
blind overlap before canonical URL/body read = 0
origin authority = 5 naver_blog / 308 external_web
sample fingerprint = exact Phase 15.9G/H fingerprint
target ordinals = 4, 9, 16
```

All three selected targets remained:

```text
actual content origin = external_web
Blind membership = false
existing durable full-context outcomes before Phase 15.9I = 0
```

---

## 6. Context-integrity bridge

Each target was fetched twice under the closed external-web acquisition authority.

All three pairs passed the existing Phase 15.9G stability contract and then matched the frozen Phase 15.9H context authority exactly on:

```text
content SHA-256
original character count
untruncated content length
content_scope = full_post
extraction scope
title SHA-256
```

Live result:

```text
context_integrity_verified = true
targets verified = 3/3
successful source acquisitions = 6
source_network_requests = 6
maximum authorized = 24
```

Because all integrity checks completed before persistence, the durable rows refer to the same extracted public contexts on which Phase 15.9H made its Candidate observations.

---

## 7. Persistence result

Immediately before persistence the runner required:

```text
Phase 15.9I batch rows = 0
full-context outcome total = 82
all 3 safe rows built in memory
all 3 Source identities unique
protected domains unchanged
```

Exactly one existing bulk INSERT call was then used.

Live result:

```text
database_write_statements = 1
outcome_rows_before = 82
outcome_rows_inserted = 3
outcome_rows_after = 85
```

Batch readback:

```text
batch rows = 3
status = resolved for 3/3
decision = candidate for 3/3
reason = full_context_first_hand_external_friction for 3/3
```

The persisted semantic fields for all three rows are:

```text
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
context_status = resolved
context_scope = full_post
context_truncated = false
prompt_version = source-full-context-semantic-v0.1
model_name = gpt-5-mini-2025-08-07
```

Recovery metadata also preserved the Phase 15.9H distinction:

```text
ordinal 4:
  recovery_attempted = true
  recovery_recovered = true
  recovery_attempt_count = 2
  trigger = source_full_context_provider_incomplete

ordinals 9 and 16:
  recovery_attempted = false
  recovery_attempt_count = 1
```

---

## 8. Independent production DB readback

After the workflow completed, an independent Supabase readback returned:

```text
source_signals = 3562
source_observations = 3892
source_ingestion_runs = 144
raw_inputs = 10
pain_evidences = 27
public_problems = 3
public_evidence = 7
public_feed = 3
source_incidents = 6
source_incident_links = 7
full_context_outcomes = 85
Phase 15.9I batch rows = 3
```

The protected-domain counts are identical to the Phase 15.9H poststate. Only the authorized outcome table increased, by exactly three rows.

---

## 9. Mutation boundary

Authorized production mutation:

```text
ar_source_full_context_resolution_outcomes
+ exactly 3 append-only rows
```

Not mutated:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
ar_source_incidents
ar_source_incident_links
```

Not authorized or exercised:

```text
Source row update
snippet-level Source Admission policy change
Source Admission recovery overlay
Incident creation
Source -> Incident linking
problem_signature assignment
Canonical/Public Problem creation
Public Evidence persistence
publication
```

A persisted Candidate means only:

```text
Candidate under the exact full-context batch authority
```

It is not yet an Incident and is not automatically publishable evidence.

---

## 10. Privacy boundary

The durable outcome schema excludes:

```text
full source body
raw search snippet
canonical URL
fetched URL
author handle
evidence quote
provider request ID
provider payload
```

The disposable artifact likewise records only bounded ordinal/hash/semantic/recovery metadata needed to audit the persistence operation.

---

## 11. Closeout

Phase 15.9I is closed because:

```text
implementation exact-head CI = SUCCESS
PIE prospective shadow = SUCCESS
implementation merged-main CI = SUCCESS
exact H sample reconstruction = PASS
Blind exclusion = PASS
context integrity = 3/3 PASS
model calls = 0
one bulk INSERT = SUCCESS
outcome rows = 82 -> 85
protected domains = unchanged
independent production DB readback = PASS
live artifact inspection = PASS
temporary live push trigger = removed
```

Final authority:

```text
PHASE 15.9I = CLOSED

durable confirmed false-negative Candidate outcomes = 3
full_context_outcomes = 85
Source Admission policy mutation = 0
Incident mutations = 0
publication mutations = 0
```

---

## 12. Next decision boundary

Phase 15.9I preserves the confirmed false-negative Candidate identities durably but deliberately leaves future policy unchanged.

A later governed phase may separately evaluate:

```text
A. exact Candidate -> Incident formation for these three rows only
B. broader calibration of the three affected snippet-level reject strata
C. a selective external-web full-context rescue path for future Sources
D. no activation until additional calibration exists
```

Phase 15.9I itself grants none of those authorities.
