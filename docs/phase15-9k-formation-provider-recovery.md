# Phase 15.9K — Formation Provider-Incomplete Recovery Reproduction

## Status

**CLOSED**

Phase 15.9K reproduced the Phase 15.9J Formation provider-incomplete issue on the two frozen-context targets and tested one bounded output-budget recovery without changing Formation policy or granting downstream authority.

Final empirical conclusion:

```text
formation_provider_incomplete_recoverable_with_bounded_output_budget
```

This conclusion means the provider completion failure was recoverable for at least one target under the bounded diagnostic retry. It does **not** mean any Source became Formation eligible or Incident-authorized.

## 1. Closed baseline

```text
Phase 15.9J final main = 6a7bfb80cfa9e0281d7daf473d6193e538599524
merged-main CI #484 = SUCCESS
full-context outcomes = 85
Phase 15.9I durable Candidate batch rows = 3
target ordinals = 9, 16
```

Ordinal 4 remained excluded because its current body hash had drifted from frozen H/I authority.

## 2. Implementation release lineage

Implementation PR:

```text
PR #143
exact head = 22838cf5d98e2df3f23ac62bdf76488cdffa445c
CI #485 = SUCCESS
PIE #126 = SUCCESS
implementation main = 75ebfc331cbc5712c7a7bc788c6e98ef614385e1
merged-main CI #486 = SUCCESS
```

No production Formation policy was modified.

The phase-local diagnostic recovery contract remained:

```text
attempt 1:
  max_output_tokens = 1200
  existing source-problem-formation-semantic-v0.1 prompt/schema

attempt 2 only after retryable source_formation_provider_incomplete:
  max_output_tokens = 2400
  same source body/title/origin/schema/policy
  + concise recovery instruction
```

No invalid-quote retry or other terminal-error retry was authorized.

## 3. Authoritative live reproduction

```text
workflow = Source Formation Provider Recovery 15.9K
run #1 = 33046626749
execution SHA = 75ebfc331cbc5712c7a7bc788c6e98ef614385e1
result = SUCCESS
artifact = 9635910441
artifact digest = sha256:49b6c19fb3b29274f23ce55890ffc05ff2df40949a8ece570c5b7b411291274b
```

Global execution:

```text
targets = 2
Blind overlap before URL/body read = 0
context integrity passed = 2
context drift = 0
source network requests = 4 / max 16
model calls = 3 / max 4
database writes = 0
actual semantic source platform = external_web
```

Summary:

```text
baseline_resolved = 1
provider_recovery_attempted = 1
provider_recovered_after_budgeted_retry = 1
provider_recovery_exhausted = 0
eligible = 0
provenance_review = 0
review = 1
reject = 1
unresolved = 1
```

Observed provider incomplete detail:

```text
max_output_tokens = 1 occurrence
```

## 4. Ordinal 9 — provider output-budget failure reproduced and recovered

Prior snippet rejection stratum:

```text
title_truncated_no_complaint_signal
```

Frozen context integrity remained exact H/I authority.

Attempt 1:

```text
requested max_output_tokens = 1200
HTTP status = 200
provider status = incomplete
incomplete_details.reason = max_output_tokens
output_tokens = 1152
reasoning_tokens = 1152
```

This directly identifies the provider-incomplete mechanism observed in this run as output-budget exhaustion.

Bounded recovery attempt:

```text
requested max_output_tokens = 2400
HTTP status = 200
provider status = completed
output_tokens = 1308
reasoning_tokens = 1088
recovery = SUCCESS
```

Recovered semantic facts were grounded by the same frozen full context and existing Formation authority:

```text
problem_claim = yes
experience_actor = self
friction_specificity = concrete
pain_centrality = incidental
content_kind = organic
source_origin = original
friction_responsibility = external_process_or_policy
evidence quote grounded = true
```

Existing deterministic Formation result:

```text
formation_state = reject
resolved = true
reason = formation_incidental_friction
```

Therefore ordinal 9 is **not** a Formation-eligible Source. The provider failure had hidden a deterministic Formation reject.

## 5. Ordinal 16 — provider failure did not reproduce on the fresh baseline call

Prior snippet rejection stratum:

```text
title_information_or_guide
```

Frozen context integrity remained exact H/I authority.

Fresh attempt:

```text
requested max_output_tokens = 1200
HTTP status = 200
provider status = completed
output_tokens = 1118
reasoning_tokens = 896
recovery attempted = false
```

Thus the Phase 15.9J provider-incomplete outcome was not reproduced for ordinal 16 on this run.

Observed semantic facts:

```text
problem_claim = yes
experience_actor = self
friction_specificity = concrete
pain_centrality = central
content_kind = organic
source_origin = original
friction_responsibility = mixed
evidence quote grounded = true
```

Existing deterministic Formation result:

```text
formation_state = review
resolved = false
reason = formation_semantic_uncertain
```

Ordinal 16 remains unresolved, but the remaining issue is now semantic Formation uncertainty rather than a provider completion failure in this run.

## 6. Provider reliability finding

Phase 15.9K supports the following bounded conclusion:

```text
The existing 1200-token Formation response budget can produce
source_formation_provider_incomplete via max_output_tokens exhaustion.
A one-shot 2400-token recovery completed the same structured task for ordinal 9.
```

It does not establish that every historical provider-incomplete result was caused by the same mechanism.

It also does not automatically authorize changing the production observer. A separate implementation/policy-promotion phase is required before the 2400-token recovery behavior can become runtime authority.

## 7. Privacy / artifact boundary

The artifact stores privacy-safe provider metadata only:

```text
attempt number
recovery boolean
requested max_output_tokens
HTTP status
provider status
incomplete reason
output token count
reasoning token count
semantic category fields
hashed evidence-quote metadata
```

It does not emit:

```text
Source UUID
canonical URL
fetched URL
raw snippet
full source body
provider request body
provider response text
provider request ID
exact evidence quote
```

## 8. Independent production DB readback

Artifact before/after and independent Supabase readback agree:

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

All protected domains remained unchanged.

Authorized DB writes:

```text
0
```

## 9. Closed authority boundary

Phase 15.9K establishes only:

```text
ordinal 9:
  provider incomplete cause observed = max_output_tokens
  bounded 2400 recovery = successful
  final Formation = reject / formation_incidental_friction

ordinal 16:
  fresh 1200 provider call = completed
  final Formation = review / formation_semantic_uncertain
```

It does **not** establish:

```text
Formation eligibility for any target
Incident identity
Incident persistence
Source -> Incident linking
problem_signature
Canonical/Public Problem
Public Evidence
publication
current-context replacement for ordinal 4
production activation of the 2400-token recovery policy
```

## 10. Next governed work

No curator/Incident phase is justified because `eligible = 0`.

The remaining work is now split cleanly:

1. **Formation recovery-policy promotion decision** — whether the empirically successful provider-incomplete-only 1200→2400 retry should become reusable runtime Formation recovery authority.
2. **Ordinal 16 semantic uncertainty** — determine whether `friction_responsibility = mixed` should remain review or can be resolved by an existing deterministic/curator authority without changing policy.
3. **Ordinal 4 current-context revalidation** — separate because its current body no longer matches frozen H/I authority.

These must not be collapsed into Incident creation.

The Phase 15.9K workflow is manual-only after closeout.
