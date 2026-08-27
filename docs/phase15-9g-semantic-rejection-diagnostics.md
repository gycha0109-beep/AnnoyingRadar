# Phase 15.9G — Resolved External Context Semantic Rejection Diagnostics

## Status

**CLOSED**

Phase 15.9G follows the closed Phase 15.9F external-web full-context acquisition pilot.

The phase asked one bounded question only:

> Do the stable full contexts of the same deterministic sixteen external-web Sources support the existing Source Admission rejections, or do they expose false negatives hidden by search snippets?

The answer is partial:

```text
8 Sources  -> policy_consistent reject
8 Sources  -> semantic diagnostic unavailable
0 Sources  -> false_negative_confirmed
0 Sources  -> false_negative_possible
```

Therefore Phase 15.9G does **not** establish that all sixteen Source Admission rejections are policy-consistent. It establishes that eight are policy-consistent under the existing semantic authority, while eight remain unresolved because the one-shot semantic provider/output contract did not produce an admissible structured result.

No durable classification or downstream authority changed.

---

## 1. Release authority

Implementation:

```text
PR #134
exact implementation head = 96f540f840466953658881c580d8ea3a1034fbb7
exact-head CI #465 = SUCCESS
PIE #115 = SUCCESS
merge/main = 8c95f49846b3cf7625d45f24b2b0cd5286c5faf4
merged-main CI #466 = SUCCESS
```

One-shot live diagnostic:

```text
workflow = Source External Semantic Rejection Diagnostics 15.9G
run #1
Actions run id = 33040344776
execution head = 8c95f49846b3cf7625d45f24b2b0cd5286c5faf4
result = SUCCESS
artifact id = 9633646012
artifact retention = 1 day
```

The temporary push trigger used for the one-shot execution is removed by the Phase 15.9G closeout. The workflow remains manual-only through `workflow_dispatch`.

---

## 2. Frozen sample authority

15.9G reconstructed the same Phase 15.9C campaign and reused the same deterministic external sample used in 15.9F:

```text
8 ingestion runs
351 observations
313 newly inserted Sources
blind overlap = 0 before canonical URL/body read
actual origins = 5 naver_blog / 308 external_web
```

The diagnostic sample remained exactly sixteen external-web Sources:

```text
4 x title_no_complaint_signal
4 x snippet_information_only
4 x title_truncated_no_complaint_signal
4 x title_information_or_guide
```

Selection reused `selectPhase15_9FExternalPilot()` so Phase 15.9G could not silently select a different or more favorable sample.

---

## 3. Stable-body gate

Each sampled Source was fetched twice under the closed Phase 15.9F public HTML acquisition contract.

The semantic judge was permitted only when both acquisitions were:

```text
resolved
not truncated
same content_hash
same original_char_count
same extraction_scope
same title
```

Live result:

```text
fetch_pair_stable = 16
fetch_pair_unstable = 0
```

Therefore the eight semantic unavailable outcomes are **not acquisition failures**. All sixteen pages passed the double-fetch stability gate.

Actual source-network use:

```text
32 requests
maximum authorized = 128
```

The 32 requests correspond to two successful acquisitions per Source with no redirect-driven expansion beyond the first HTTP request.

---

## 4. Semantic authority reuse

15.9G did not define a new semantic policy.

It reused:

```text
source-full-context-semantic-v0.1
resolveFullContextSemantic()
```

The semantic judge received the actual content origin:

```text
Source platform: external_web
```

rather than the historical acquisition identity `source_platform = naver_blog`.

Stored Source identity was not changed.

Existing resolver interpretation remained:

```text
candidate -> false_negative_confirmed
review    -> false_negative_possible
reject    -> policy_consistent
```

Maximum model calls were sixteen, one per stable Source.

Live result:

```text
model_call_attempted = 16
model_calls = 16
maximum authorized = 16
```

---

## 5. Live diagnostic result

Aggregate result:

```text
total = 16
candidate = 0
review = 0
reject = 8
unavailable = 8

false_negative_confirmed = 0
false_negative_possible = 0
policy_consistent = 8
```

Reason distribution:

```text
source_full_context_provider_incomplete = 6
source_full_context_invalid_evidence_quote = 2
full_context_informational_content = 6
full_context_nonorganic_or_borrowed = 1
full_context_no_problem_claim = 1
```

The eight decisive rejects were:

```text
6 x full_context_informational_content
1 x full_context_nonorganic_or_borrowed
1 x full_context_no_problem_claim
```

The eight unresolved Sources were:

```text
6 x source_full_context_provider_incomplete
2 x source_full_context_invalid_evidence_quote
```

No candidate or review result was observed.

The authoritative diagnostic conclusion is therefore:

```text
diagnostic_inconclusive_for_some_sources
```

This must not be simplified to `sample_supports_current_source_admission_rejections`, because half of the sample did not receive a valid resolver decision.

---

## 6. Interpretation boundary

Phase 15.9G supports the following claims:

```text
- the external-web acquisition path is stable for all 16 sampled Sources
- 8/16 existing rejects are policy-consistent under the current full-context semantic authority
- no confirmed or possible false negative was observed among the 8 decisive semantic results
- the remaining 8 cannot be classified from this one-shot diagnostic
```

Phase 15.9G does **not** support the following claims:

```text
- all 16 rejects are correct
- the remaining 8 are rejects
- there are no Source Admission false negatives in the external-web cohort
- provider/output failure should be interpreted as rejection
```

The next investigation, if pursued, should target semantic completion/validation reliability for the unresolved eight. It should not reopen Phase 15.9F acquisition, because acquisition stability was already 16/16.

---

## 7. Artifact privacy

The disposable artifact contains only bounded diagnostic metadata such as:

```text
rejection stratum
external identity hash
source content hash
origin-host hash
first/second context hashes and lengths
stable/unstable status
extraction scope
title SHA-256
semantic categorical observations
evidence excerpt length and SHA-256 only
existing resolver decision/reason codes
model identifier and token usage
aggregate DB counts
```

It excludes:

```text
Source Signal UUID
canonical URL
author handle
raw search snippet
full body text
exact evidence quote
provider request ID
Incident UUID
Public Problem UUID
```

---

## 8. Read-only boundary

Phase 15.9G authorized no writes.

```text
database writes = 0
full-context outcome persistence = 0
Source Admission mutation = 0
origin backfill = 0
Incident creation = 0
Source->Incident linking = 0
problem_signature assignment = 0
Canonical Problem creation = 0
Public Evidence persistence = 0
publication = 0
```

Artifact DB snapshots were identical before and after:

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
full_context_outcomes = 82
```

An independent production Supabase readback after the live run returned the same counts.

Candidate results would have remained diagnostic findings only even if any had appeared. Phase 15.9G created no durable Source Admission recovery, Incident, or publication authority.

---

## 9. Closeout

Phase 15.9G is closed because its bounded diagnostic was implemented, independently gated, executed once against authoritative main, inspected, and verified read-only.

The phase closes with an intentionally inconclusive semantic result for eight Sources rather than converting provider/output incompleteness into a policy verdict.

```text
PHASE 15.9G = CLOSED

acquisition stability = 16/16
semantic decisive = 8/16
policy_consistent = 8
false_negative_confirmed = 0
false_negative_possible = 0
semantic unavailable = 8
DB writes = 0
```
