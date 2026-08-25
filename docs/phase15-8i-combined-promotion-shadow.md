# Phase 15.8I — Combined Review Promotion Calibration Shadow

## Status

**IMPLEMENTED — pending CI/PIE and read-only live shadow**

Active discovery allocation remains:

```text
source-discovery-allocation-v0.4
```

Phase 15.8I is observational only. It does not activate a new production allocation version.

## Purpose

Phase 15.8D established the first deterministic exact-new Review sample:

```text
sampled: 24
Candidate: 4
Reject: 15
unresolved: 5
conservative promotion: 4 / 24 = 16.67%
```

Phase 15.8F added a disjoint holdout:

```text
sampled: 48
Candidate: 7
Reject: 33
unresolved: 8
conservative promotion: 7 / 48 = 14.58%
```

The combined disjoint one-shot authority is therefore:

```text
sampled: 72
Candidate: 11
Reject: 48
unresolved: 13
conservative promotion: 11 / 72 = 15.28%
```

Phase 15.8G and 15.8H later reran technical unresolved cases to study provider reliability. Those reruns are not replacement labels for the original one-shot calibration samples. In particular, fresh provider outputs changed some technical outcomes on rerun. Replacing the original observations with later provider outputs would silently change the empirical protocol.

Phase 15.8I therefore keeps unresolved cases in the original denominators and asks a narrower question:

```text
If the larger 72-item disjoint evidence set replaces the initial 24-item
calibration baseline, does the promotion-aware shadow materially change
query allocation eligibility relative to active v0.4?
```

## Combined empirical authority

Calibration version:

```text
review-promotion-calibration-v0.2-combined
```

Shadow version:

```text
review-promotion-shadow-v0.2-combined
```

Global:

```text
sampled: 72
Candidate: 11
Reject: 48
unresolved: 13
raw conservative promotion: 15.2778%
```

Family totals are the exact sum of the 15.8D and 15.8F disjoint samples.

### damage

```text
15.8D: 16 / Candidate 1 / Reject 11 / unresolved 4
15.8F: 37 / Candidate 5 / Reject 26 / unresolved 6
combined: 53 / Candidate 6 / Reject 37 / unresolved 10
raw conservative promotion: 6 / 53 = 11.3208%
```

### delay

```text
15.8D: 8 / Candidate 3 / Reject 4 / unresolved 1
15.8F: 11 / Candidate 2 / Reject 7 / unresolved 2
combined: 19 / Candidate 5 / Reject 11 / unresolved 3
raw conservative promotion: 5 / 19 = 26.3158%
```

## Method isolation

Phase 15.8I changes the empirical baseline only.

It deliberately preserves the Phase 15.8E shrinkage method and prior strength:

```text
prior strength: 24
```

This avoids changing both evidence and calibration method in one phase.

Family calibration remains:

```text
calibrated family promotion
= (family Candidate + 24 × global promotion rate)
  / (family sampled + 24)
```

With the combined evidence:

```text
global: 11 / 72 = 0.1527777778

damage calibrated:
(6 + 24 × 11/72) / (53 + 24)
= 0.1255411255

delay calibrated:
(5 + 24 × 11/72) / (19 + 24)
= 0.2015503876
```

For families with no direct full-context sample, the global conservative rate remains the fallback.

## Shadow formula

Active v0.4 remains unchanged:

```text
0.4 × candidate_rate
+ 0.1 × review_rate
+ remaining acquisition-quality terms
```

15.8I shadow:

```text
combined_shadow_score
= base_v0.4_score
- (0.1 × review_rate)
+ (0.4 × review_rate × combined_calibrated_promotion_rate)
```

No active selector imports or consumes the combined shadow module.

## Exact telemetry authority

The live shadow must still observe the exact telemetry authority used by the 15.8D/15.8F calibration work:

```text
query plan: 192
exact telemetry runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

The runner fails closed if these values drift.

This prevents applying the historical 72-item calibration evidence to a silently changed acquisition telemetry population.

## Scope boundary

Promotion calibration applies only to:

```text
telemetry_scope = new_source_exact
```

Legacy run-level telemetry remains:

```text
promotion_applicable = false
shadow_score = base_score
score_delta = 0
```

This preserves the Phase 15.8E authority correction.

## Mutation and privacy boundary

The runner is telemetry-only.

Expected:

```text
DB writes: 0
Blind reads: 0
full source-body fetches: 0
semantic-provider calls: 0
publication mutations: 0
Formation mutations: 0
active allocation mutations: 0
```

It does not inspect or emit Source Signal ids, canonical URLs, author handles, raw source bodies, or semantic payloads.

## Live output

The read-only live shadow reports:

- total / measured / exact-measured queries;
- promotion-applicable queries;
- base versus combined-shadow exploitation eligibility;
- threshold crossings;
- family mean score deltas;
- top changed query keys;
- frozen exact-authority totals;
- active allocation version and mutation assertions.

## Workflow

Temporary execution workflow:

```text
.github/workflows/source-combined-promotion-shadow-pilot.yml
```

Because the connector cannot directly dispatch `workflow_dispatch`, one exact temporary push branch is permitted for the one-shot read-only evaluation:

```text
ops/source-combined-promotion-shadow
```

The workflow checks out authoritative `main`, uses only Supabase server-side credentials, and makes no OpenAI or Naver call.

The push trigger must be removed during closeout.

## Activation boundary

Phase 15.8I does not authorize production activation even if the shadow is stable.

A later explicit activation phase would need to consider at minimum:

1. threshold-crossing behavior under the combined calibration;
2. whether the combined evidence is sufficiently precise for the operational cost of changing allocation;
3. whether provider-incomplete recovery should be separately activated or left diagnostic-only;
4. unchanged Admission, Formation, Incident, Blind, and publication authorities.

Until then:

```text
ACTIVE ALLOCATION = source-discovery-allocation-v0.4
```
