# Phase 15.9H — Provider-Incomplete Recovery Reproduction

## Status

**IMPLEMENTED — pending PR / CI / PIE / one-shot live reproduction**

Phase 15.9H follows the closed Phase 15.9G read-only semantic rejection diagnostic.

15.9G established:

```text
sample = 16 deterministic external-web Sources
stable double-fetch = 16/16
semantic reject / policy_consistent = 8
semantic unavailable = 8
  source_full_context_provider_incomplete = 6
  source_full_context_invalid_evidence_quote = 2
candidate = 0
review = 0
DB writes = 0
```

The acquisition layer is therefore not the remaining gap. Phase 15.9H asks only whether the already-validated provider-incomplete bounded recovery mechanism can reduce the semantic unavailable remainder without enabling quote recovery or changing Source Admission authority.

---

## 1. Existing authority reused

Phase 15.9H does not invent a retry policy.

It reuses:

```text
source-full-context-recovery-v0.1
runSourceFullContextJudgeWithRecovery()
createSourceFullContextRecoveryFetch()
```

The provider-incomplete-only scope was already isolated and live-tested in Phase 15.8L.

15.8L authority:

```text
fresh provider-incomplete reproduced = 4
provider recovery attempted = 4
provider recovered after retry = 3
provider recovery exhausted = 1
conditional recovery efficacy = 3/4 = 75%
quote recovery attempted = 0
```

15.9H therefore explicitly narrows recovery eligibility to:

```text
source_full_context_provider_incomplete
```

It does not authorize retry for:

```text
source_full_context_invalid_evidence_quote
source_full_context_provider_timeout
source_full_context_provider_network_error
source_full_context_provider_rejected
source_full_context_provider_invalid_json
source_full_context_provider_missing_output
full_context fetch failures
semantic uncertainty
any other reason code
```

The underlying generic recovery helper remains unchanged.

---

## 2. Baseline reconstruction

Phase 15.9H reconstructs the same Phase 15.9C campaign and exact Phase 15.9G deterministic sample.

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

The fingerprint is an aggregate SHA-256 over the already privacy-safe external identity values in the deterministic sample. Individual identities are not emitted as Phase 15.9H repository authority.

Phase 15.9G unresolved sample ordinals:

```text
1, 4, 5, 7, 8, 9, 10, 16
```

Aggregate baseline reasons:

```text
source_full_context_provider_incomplete = 6
source_full_context_invalid_evidence_quote = 2
```

Phase 15.9H intentionally freezes the unresolved ordinals and aggregate reason counts, not a permanent identity→reason mapping.

This matters because semantic-provider behavior is transient. A Source that returned provider-incomplete in 15.9G may resolve on a fresh first attempt in 15.9H.

---

## 3. Stable body gate remains mandatory

For each of the eight targets:

```text
external body fetch #1
external body fetch #2
```

Semantic work is allowed only when both are:

```text
resolved
not truncated
same content_hash
same original_char_count
same extraction_scope
same title
```

If the pair is unavailable or changed:

```text
semantic provider calls = 0 for that target
result = unavailable
```

This preserves the Phase 15.9G acquisition-stability boundary.

---

## 4. Attempt semantics

For each stable target:

```text
fresh semantic attempt
  ↓
resolved
  → stop

source_full_context_provider_incomplete
  → exactly one bounded recovery attempt

any other semantic error
  → stop unavailable without retry
```

Provider recovery retains the existing authority:

```text
maximum semantic attempts per target = 2
recovery max_output_tokens = 1600
structured schema = unchanged
semantic prompt/version = unchanged
store = false
semantic decision mapping = unchanged
```

The recovery instruction only asks the provider to complete concisely and return the required structured fields.

It does not alter the semantic facts being requested.

---

## 5. Invalid quote boundary

Phase 15.9H does not retry invalid evidence quotes.

The semantic validator continues to require:

```text
evidence_quote is null
OR
evidence_quote is an exact contiguous substring of fetched source body
```

If a fresh attempt returns:

```text
source_full_context_invalid_evidence_quote
```

then:

```text
retry = false
result = unavailable
```

A runtime assertion requires:

```text
quote_recovery_attempted = 0
```

Quote recovery, if ever reconsidered, requires separate authority.

---

## 6. Actual origin authority

The semantic prompt continues to receive the actual content origin:

```text
Source platform: external_web
```

for these targets.

The historical stored acquisition identity is not rewritten.

```text
stored Source identity = unchanged
origin classification = read-only input to diagnostic
```

---

## 7. Interpretation

Phase 15.9H distinguishes:

```text
fresh_first_attempt_resolved
provider_recovery_attempted
provider_recovered_after_retry
provider_recovery_exhausted
final unavailable
```

A Source resolving on the fresh first attempt is evidence of provider variability, not recovery efficacy.

Only a Source that reproduces provider-incomplete on the fresh attempt and then resolves on attempt two counts as:

```text
provider_recovered_after_retry
```

Final semantic decisions remain diagnostic only:

```text
candidate -> false_negative_confirmed
review    -> false_negative_possible
reject    -> policy_consistent
```

Unavailable remains unavailable. It is never converted to reject.

---

## 8. Cost boundary

Target count:

```text
8
```

Maximum source-network requests:

```text
8 Sources
x 2 body acquisitions
x max 4 redirect/request hops
= 64
```

Maximum semantic-provider calls:

```text
8 fresh attempts
+ maximum 8 provider-incomplete recovery attempts
= 16
```

No broader replay of the 16-Source sample or 308-source external cohort is authorized.

---

## 9. Mutation / privacy boundary

Phase 15.9H is read-only.

Before and after live execution the runner snapshots:

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
ar_source_full_context_resolution_outcomes
```

Exact equality is required.

Not authorized:

```text
DB writes
Blind writes
full body persistence
full-context outcome persistence
Source Admission mutation
Source Admission recovery
Incident creation/linking
problem signature assignment
Canonical/Public Problem creation
Public Evidence persistence
publication
provider recovery product activation
```

Artifact output contains ordinal-based diagnostic metadata and hashes only. It excludes canonical URL, Source UUID, author handle, raw body, exact evidence quote, and provider request id.

---

## 10. Workflow

Implementation workflow:

```text
.github/workflows/source-provider-incomplete-recovery-15-9h.yml
```

One-shot live execution supports the temporary branch:

```text
agent/phase15-9h-live-execution
```

The workflow always checks out authoritative `main` before DB reads, source fetches, or paid provider calls.

The temporary push trigger must be removed in closeout.

---

## 11. Close criterion

Phase 15.9H may close after:

1. implementation diff review passes;
2. exact-head CI passes;
3. PIE prospective shadow passes;
4. implementation merges using expected-head protection;
5. merged-main CI passes;
6. exact 15.9G sample fingerprint reconstructs;
7. exact eight baseline unresolved ordinals reconstruct;
8. stable-body gate is applied before semantic work;
9. one-shot bounded live reproduction completes;
10. `quote_recovery_attempted = 0`;
11. DB before/after is unchanged and independently read back;
12. live artifact is inspected without converting unavailable into reject;
13. temporary push trigger is removed;
14. closeout PR exact-head CI/PIE and merged-main CI pass.

---

## 12. Decision boundary

Phase 15.9H is a reliability reproduction only.

It does not activate retry behavior in the production Source Admission path.

Possible interpretations after live execution:

```text
provider-incomplete reproduces and retry materially recovers
→ recovery mechanism remains technically useful;
  product activation still requires separate governed authority

most targets resolve on fresh first attempt
→ provider-incomplete is substantially transient;
  do not misattribute fresh recovery to retry

retry frequently exhausts
→ do not activate;
  inspect provider/schema/token behavior separately

candidate/review appears
→ false-negative diagnostic finding only;
  no durable Source Admission recovery authority exists in 15.9H
```
