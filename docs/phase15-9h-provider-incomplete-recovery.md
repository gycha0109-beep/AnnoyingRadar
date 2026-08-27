# Phase 15.9H — Provider-Incomplete Recovery Reproduction

## Status

**CLOSED**

Phase 15.9H followed the closed Phase 15.9G read-only semantic rejection diagnostic.

15.9G left eight semantic-unavailable Sources inside the deterministic sixteen-Source external-web sample:

```text
source_full_context_provider_incomplete = 6
source_full_context_invalid_evidence_quote = 2
```

15.9H reused the already validated provider-incomplete-only recovery authority from Phase 15.8L and asked whether a fresh semantic attempt plus at most one provider-incomplete recovery attempt would resolve those eight Sources without quote recovery or any durable Source Admission mutation.

The answer exposed confirmed false negatives:

```text
targets = 8
stable body pairs = 8/8
candidate = 3
reject = 4
review = 0
unavailable = 1

false_negative_confirmed = 3
false_negative_possible = 0
policy_consistent = 4
```

Phase 15.9H therefore closes with:

```text
diagnostic_conclusion = source_admission_false_negative_detected
```

The three Candidate findings remain diagnostic findings only. Phase 15.9H did not durably recover them.

---

## 1. Release authority

Implementation:

```text
PR #136
initial implementation head = 275ff9cf3a7f3ff8e40ec0a69d68f1b2e82582b4
CI #469 = FAILURE
  cause = closeout/static test false-positive on Node crypto createHash().update()
  implementation mutation boundary itself was not violated
PIE #117 = SUCCESS

corrected exact implementation head = f6412dce56590e40f1bf49faaca203b493a4f636
CI #470 = SUCCESS
PIE #118 = SUCCESS
merge/main = 9e997ba6d46b07207be4c517cf7b23ecb951602c
merged-main CI #471 = SUCCESS
```

The failed CI #469 was caused by an overly broad test regex matching `createHash("sha256").update(...)` as though it were a database mutation. The test was narrowed to the Supabase mutation surface. The recovery runner itself was unchanged by that correction.

One-shot live reproduction:

```text
workflow = Source Provider-Incomplete Recovery 15.9H
run #1
Actions run id = 33041740366
execution head = 9e997ba6d46b07207be4c517cf7b23ecb951602c
result = SUCCESS
artifact id = 9634167089
artifact retention = 1 day
```

The temporary `agent/phase15-9h-live-execution` push trigger is removed by the Phase 15.9H closeout. The workflow remains manual-only through `workflow_dispatch`.

---

## 2. Baseline reconstruction authority

Phase 15.9H reconstructed the same Phase 15.9C campaign and exact Phase 15.9G deterministic external-web sample.

Frozen campaign authority:

```text
8 ingestion runs
351 observations
313 newly inserted Sources
blind overlap = 0 before canonical URL/body read
origin authority = 5 naver_blog / 308 external_web
```

Exact Phase 15.9G sample:

```text
sample size = 16
sample fingerprint = 2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e
```

The fingerprint was independently recomputed from the retained Phase 15.9G live artifact and matched the frozen Phase 15.9H authority exactly.

Phase 15.9G unresolved sample ordinals:

```text
1, 4, 5, 7, 8, 9, 10, 16
```

Aggregate baseline reasons:

```text
source_full_context_provider_incomplete = 6
source_full_context_invalid_evidence_quote = 2
```

Phase 15.9H intentionally froze unresolved ordinals and aggregate reason counts rather than asserting a permanent identity-to-reason mapping, because provider behavior is not deterministic across runs.

---

## 3. Recovery authority reused

Phase 15.9H did not create a retry policy.

It reused:

```text
source-full-context-recovery-v0.1
runSourceFullContextJudgeWithRecovery()
createSourceFullContextRecoveryFetch()
```

and narrowed recovery eligibility to exactly:

```text
source_full_context_provider_incomplete
```

Provider recovery retained the existing contract:

```text
maximum semantic attempts per stable target = 2
recovery max_output_tokens = 1600
structured schema = unchanged
semantic prompt/version = unchanged
store = false
semantic decision mapping = unchanged
```

Explicitly not retry-eligible in Phase 15.9H:

```text
source_full_context_invalid_evidence_quote
provider timeout/network/rejected errors
invalid JSON / missing output
full-context acquisition failures
semantic uncertainty
all other reason codes
```

---

## 4. Stable-body gate

Each of the eight targets was fetched twice under the closed external-web acquisition contract.

Semantic work was allowed only when both acquisitions were:

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
fetch_pair_stable = 8
fetch_pair_unstable = 0
source_network_requests = 16
maximum authorized = 64
```

All eight targets therefore entered semantic evaluation on stable full context.

---

## 5. Fresh attempt versus recovery effect

Live result:

```text
fresh_first_attempt_resolved = 3
provider_recovery_attempted = 5
provider_recovered_after_retry = 4
provider_recovery_exhausted = 1
quote_recovery_attempted = 0
```

Conditional provider recovery efficacy for the fresh provider-incomplete reproductions was:

```text
4 / 5 = 80%
```

This value is distinct from the total eight-target resolution rate because fresh first-attempt resolution is not attributed to the retry mechanism.

The five fresh attempts that reproduced provider-incomplete were baseline ordinals:

```text
1, 4, 7, 8, 10
```

Recovery outcomes:

```text
ordinal 1  -> recovered -> reject
ordinal 4  -> recovered -> candidate
ordinal 7  -> exhausted -> invalid evidence quote
ordinal 8  -> recovered -> reject
ordinal 10 -> recovered -> reject
```

The three targets that resolved on the fresh first attempt were:

```text
ordinal 5  -> reject
ordinal 9  -> candidate
ordinal 16 -> candidate
```

Thus two Candidate findings appeared without recovery intervention and one Candidate finding appeared after provider-incomplete recovery.

---

## 6. Final semantic result

Aggregate result:

```text
total = 8
candidate = 3
review = 0
reject = 4
unavailable = 1

false_negative_confirmed = 3
false_negative_possible = 0
policy_consistent = 4
unavailable = 1
```

Decision reasons:

```text
full_context_first_hand_external_friction = 3
full_context_no_problem_claim = 3
full_context_informational_content = 1
source_full_context_invalid_evidence_quote = 1
```

Confirmed false-negative ordinals and original rejection strata:

```text
ordinal 4
  original stratum = title_no_complaint_signal
  full-context decision = candidate

ordinal 9
  original stratum = title_truncated_no_complaint_signal
  full-context decision = candidate

ordinal 16
  original stratum = title_information_or_guide
  full-context decision = candidate
```

The three confirmed false negatives span three different snippet-level rejection strata. The live evidence therefore does not support treating this as one isolated reject-reason defect.

The remaining unavailable target is:

```text
ordinal 7
terminal reason = source_full_context_invalid_evidence_quote
```

Phase 15.9H did not retry that terminal quote-validation failure.

---

## 7. Interpretation boundary

Phase 15.9H supports the following claims:

```text
- full-context acquisition remained stable for all 8 targets
- provider-incomplete reproduced on 5 fresh attempts
- the existing bounded provider recovery resolved 4/5 reproductions
- three current Source Admission rejects are confirmed semantic false negatives
- two of the three false negatives resolve as Candidate without retry
- one false negative required the existing provider-incomplete recovery attempt
- four targets are policy-consistent rejects
- one target remains semantically unavailable
```

Phase 15.9H does not authorize these claims/actions:

```text
- automatically rewrite Source Admission policy
- automatically promote all Sources in the affected rejection strata
- treat ordinal 7 as reject
- enable quote recovery
- activate provider recovery in the production admission path
- create Incidents or public evidence from the three Candidate findings
```

The next governed work, if pursued, must distinguish exact confirmed-false-negative recovery from broader policy/product activation.

---

## 8. Actual origin authority

The semantic prompt received actual content origin:

```text
Source platform: external_web
```

Stored Source identity remained unchanged.

The three Candidate Source rows were independently resolved back to the production Source table after the live diagnostic to verify that the H ordinals correspond to real extant Sources. That readback did not mutate those rows and is not used to broaden the diagnostic sample.

---

## 9. Cost boundary

Actual live use:

```text
targets = 8
source-network requests = 16 / max 64
semantic-provider calls = 13 / max 16
```

No replay beyond the exact eight unresolved Phase 15.9G ordinals occurred.

---

## 10. Read-only boundary

Artifact DB snapshots before and after were identical:

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

Therefore:

```text
database writes = 0
Blind writes = 0
full source bodies persisted = 0
full-context outcome persistence = 0
Source Admission mutation = 0
Source Admission recovery = 0
Incident creation/linking = 0
problem signature assignment = 0
Public Problem creation = 0
Public Evidence persistence = 0
publication = 0
provider recovery product activation = false
```

Candidate findings remain diagnostic evidence only.

---

## 11. Artifact privacy

The disposable Phase 15.9H artifact contains ordinal-based diagnostic metadata, hashes, semantic categories, reason codes, recovery metadata, usage counts, and aggregate DB snapshots.

It excludes:

```text
Source UUID
canonical URL
author handle
raw source body
exact evidence quote
provider request id
Incident UUID
Public Problem UUID
```

The closeout preserves the ordinal/result mapping needed for governed follow-up without promoting raw identity-bearing material into repository authority.

---

## 12. Closeout

Phase 15.9H is closed because its bounded reliability reproduction was implemented, exact-head gated, merged, executed once against authoritative main, inspected, independently read back, and verified read-only.

It closes with a substantive diagnostic finding:

```text
PHASE 15.9H = CLOSED

baseline unresolved = 8
stable acquisition = 8/8
fresh first-attempt resolved = 3
provider retry attempted = 5
provider recovered = 4
provider recovery exhausted = 1
quote recovery attempted = 0
candidate / confirmed false negative = 3
reject / policy consistent = 4
unavailable = 1
DB writes = 0
```

The three Candidate findings require a separately governed recovery decision. Phase 15.9H itself does not grant that authority.
