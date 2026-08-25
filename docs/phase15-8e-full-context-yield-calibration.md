# Phase 15.8E — Full-Context Yield Calibration Shadow

## Status

**IMPLEMENTED — pending CI/PIE and bounded live shadow readback**

## Why this phase exists

Phase 15.8C established exact new-source snippet-level yield:

```text
new Sources: 961
snippet Candidate: 0
snippet Review: 166
snippet Reject: 795
```

Phase 15.8D then resolved a deterministic bounded sample of 24 exact-new Reviews with full public post context:

```text
Candidate: 4
Reject: 15
unresolved: 5
Review → Candidate promotion: 4 / 24 = 16.67%
```

The active allocation v0.4 currently credits every Review equally:

```text
0.1 × review_rate
```

The 15.8D result shows that Review has nonzero acquisition value but is not equivalent to Candidate.

Phase 15.8E tests a promotion-aware interpretation in shadow only.

## Authority boundary

Active production acquisition remains:

```text
source-discovery-allocation-v0.4
```

Phase 15.8E does not modify:

- query plan generation;
- active request selection;
- exploitation threshold;
- exploration slot ratio;
- Source Admission thresholds;
- full-context semantic authority;
- Formation / Incident identity;
- Gold / Blind membership;
- Public Problem formation;
- publication authority.

The shadow cannot cause a discovery request to be selected or rejected.

## Aggregate-only empirical authority

Calibration version:

```text
review-promotion-calibration-v0.1
```

Shadow version:

```text
review-promotion-shadow-v0.1
```

The repository stores only aggregate Phase 15.8D counts and provenance metadata.

It does not persist:

- full source bodies;
- evidence quotes;
- individual semantic payloads;
- new Candidate decisions to Supabase.

Global bounded sample:

```text
sampled: 24
Candidate: 4
Reject: 15
unresolved: 5
```

Family observations:

```text
damage: sampled 16 / Candidate 1 / Reject 11 / unresolved 4
delay:  sampled  8 / Candidate 3 / Reject  4 / unresolved 1
```

Unresolved remains in the denominator. This deliberately prevents technical failures from inflating apparent promotion yield.

## Shrinkage

A 24-observation global empirical prior is used as a strong shrinkage anchor.

```text
global promotion rate = 4 / 24 = 0.1667
prior strength = 24
```

For observed families:

```text
calibrated family promotion
= (family Candidate + 24 × global promotion rate)
  / (family sampled + 24)
```

This produces:

```text
damage raw:       1 / 16 = 0.0625
 damage calibrated: 5 / 40 = 0.1250
 empirical weight: 16 / 40 = 0.40

delay raw:        3 / 8 = 0.3750
 delay calibrated: 7 / 32 = 0.21875
 empirical weight: 8 / 32 = 0.25
```

Unobserved families use only the global fallback `4/24` and receive no invented family evidence.

This deliberately prevents the small `delay` sample from receiving a 37.5% production promotion rate.

## Shadow scoring

Active v0.4 uses:

```text
0.4 × candidate_rate
+ 0.1 × review_rate
+ remaining acquisition-quality terms
```

The Phase 15.8E shadow replaces only the Review credit conceptually:

```text
0.4 × candidate_rate
+ 0.4 × review_rate × calibrated_promotion_rate
+ the same remaining acquisition-quality terms
```

Implementation computes this as a delta from the unchanged active v0.4 score:

```text
shadow_score
= base_v0.4_score
- (0.1 × review_rate)
+ (0.4 × review_rate × calibrated_promotion_rate)
```

No active allocation code consumes `shadow_score`.

## Read-only shadow runner

Runner:

```text
scripts/run-discovery-promotion-shadow.mjs
```

It reads existing discovery query metrics, builds the unchanged 192-query plan, computes base v0.4 and promotion-aware shadow scores side by side, and reports:

```text
measured query count
exact-measured query count
base exploitation-eligible count
shadow exploitation-eligible count
threshold crossings
crossed-up / crossed-down query keys
family-level mean score deltas
top changed queries
```

Expected scope:

```text
DB writes: 0
Blind reads: 0
full source-body fetches: 0
publication mutations: 0
active allocation mutations: 0
```

## Pilot workflow

Workflow:

```text
.github/workflows/source-promotion-shadow-pilot.yml
```

It checks out authoritative `main` before using Supabase secrets.

A temporary dedicated ops push trigger exists solely because the current connector cannot dispatch `workflow_dispatch` directly. It must be removed during closeout after the empirical shadow run.

## Empirical decision criteria

The shadow is safe to continue toward a later activation phase only if the live readback shows all of the following:

1. no active allocation mutation;
2. no DB / Blind / publication mutation;
3. score deltas are interpretable from promotion calibration;
4. threshold crossings are bounded rather than broad destabilization;
5. no family receives strong preference solely from tiny sample size;
6. exploration remains untouched in active v0.4.

Phase 15.8E itself does not activate promotion-aware allocation even if the shadow looks favorable.

## Next-stage boundary

If shadow behavior is acceptable, a separate later phase may decide whether to activate promotion-aware Review credit with explicit versioning and additional safeguards.

If shadow behavior is unstable, calibration must be revised or more full-context samples collected. The solution is not to lower Source Admission thresholds.
