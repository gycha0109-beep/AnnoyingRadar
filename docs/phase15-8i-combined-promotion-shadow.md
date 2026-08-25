# Phase 15.8I — Combined Review Promotion Calibration Shadow

## Status

**CLOSED — IMPLEMENTED / CI VERIFIED / PIE VERIFIED / LIVE SHADOW VERIFIED / MERGED IMPLEMENTATION / NOT ACTIVATED**

Active discovery allocation remains:

```text
source-discovery-allocation-v0.4
```

Phase 15.8I is observational only. It does not activate a new production allocation version.

## Implementation authority

Implementation PR:

```text
PR #86
merged main: 0f6cea49d623b830e093de57da96ea83b4ef9020
```

Verification:

```text
CI #358   SUCCESS
PIE #54   SUCCESS
unit      SUCCESS
release   SUCCESS
build     SUCCESS
runtime   SUCCESS
```

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

The combined disjoint one-shot authority is:

```text
sampled: 72
Candidate: 11
Reject: 48
unresolved: 13
conservative promotion: 11 / 72 = 15.28%
```

Phase 15.8G and 15.8H reliability reruns are not replacement labels for those original one-shot observations. The combined calibration therefore preserves unresolved cases in the original denominator.

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
72 / Candidate 11 / Reject 48 / unresolved 13
raw conservative promotion: 0.1527777778
```

Family totals:

```text
damage:
  53 / Candidate 6 / Reject 37 / unresolved 10
  raw promotion: 6 / 53 = 0.1132075472

delay:
  19 / Candidate 5 / Reject 11 / unresolved 3
  raw promotion: 5 / 19 = 0.2631578947
```

## Method isolation

Phase 15.8I changes empirical evidence only. The Phase 15.8E shrinkage method and prior strength remain fixed:

```text
prior strength: 24
```

Calibrated rates:

```text
global: 0.1527777778
damage: 0.1255411255
delay:  0.2015503876
```

This avoids changing evidence and calibration methodology simultaneously.

## Shadow formula

Active v0.4 remains:

```text
0.4 × candidate_rate
+ 0.1 × review_rate
+ remaining acquisition-quality terms
```

Combined shadow:

```text
combined_shadow_score
= base_v0.4_score
- (0.1 × review_rate)
+ (0.4 × review_rate × combined_calibrated_promotion_rate)
```

Only `new_source_exact` telemetry is promotion-applicable. Legacy run-level telemetry remains byte-equivalent to the base score.

## Live shadow

Authoritative run:

```text
workflow: Source Combined Promotion Shadow Pilot
run: 32811565398
artifact: 9549962412
main: 0f6cea49d623b830e093de57da96ea83b4ef9020
conclusion: SUCCESS
```

Frozen exact authority passed:

```text
query plan: 192
exact telemetry runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

Live summary:

```text
total queries:                 192
measured queries:               46
exact measured queries:         19
promotion-applicable queries:   19

base exploitation eligible:      7
combined-shadow eligible:        7
threshold crossings:             0
crossed up:                       0
crossed down:                     0
```

Family readback:

```text
damage:
  measured queries: 16
  exact/applicable: 13
  base eligible: 6
  shadow eligible: 6
  mean base score:   0.3272141008
  mean shadow score: 0.3212905900
  mean delta:       -0.0059235108

delay:
  measured queries: 6
  exact/applicable: 6
  base eligible: 1
  shadow eligible: 1
  mean base score:   0.3213112345
  mean shadow score: 0.3192085033
  mean delta:       -0.0021027311

contact legacy telemetry:
  measured queries: 24
  exact/applicable: 0
  mean delta: 0
```

Largest observed score change:

```text
commerce__damage__1
base:   0.4570479308
shadow: 0.4296943320
delta: -0.0273535988
```

It remained exploitation-eligible.

## Interpretation

The larger combined evidence set reproduces the Phase 15.8E behavioral conclusion:

```text
7 base-eligible queries
→ 7 combined-shadow-eligible queries
→ 0 threshold crossings
```

The Review promotion estimate is therefore no longer based only on the initial 24-item slice, yet the current allocation decision surface is still unchanged.

This does **not** imply that production must activate a new allocation version. It establishes that promotion-aware discounting remains behaviorally stable under the larger disjoint 72-item calibration authority.

Because active selection is unchanged, there is no immediate product benefit that requires an allocation-version mutation in this phase.

## Mutation / privacy boundary

Runner-declared live boundaries:

```text
active allocation mutations: 0
DB writes: 0
Blind reads: 0
full source-body fetches: 0
semantic-provider calls: 0
publication mutations: 0
Formation mutations: 0
```

Independent post-run DB verification:

```text
Source Signals:        2260
Source Observations:   2461
Source Ingestion Runs: 108
Raw Inputs:            10
Pain Evidences:        27
Public Problems:        2
Published Problems:     2
Public Evidence:        5
Source Incidents:       4
Blind membership:     120
  representative:      60
  challenge:           60
```

No Admission, Formation, Incident, Blind, Public Problem, Evidence, or publication authority changed.

## Workflow closeout

The temporary one-shot push trigger:

```text
push → ops/source-combined-promotion-shadow
```

is removed during closeout.

The retained workflow is `workflow_dispatch` only and continues to check out authoritative `main` with `contents: read` permission.

## Closeout decision

Phase 15.8I is closed with:

```text
combined calibration evidence: VERIFIED
shadow behavioral stability:   VERIFIED
threshold crossings:           0
active allocation change:      NO
production activation:         NO
```

Active authority remains:

```text
source-discovery-allocation-v0.4
```

A future activation phase should only be opened if changing the allocation version creates a concrete operational benefit beyond reproducing the same seven-query eligibility set, or if new source-supply telemetry materially changes the decision surface. Source Admission or Formation thresholds must not be loosened to manufacture volume.
