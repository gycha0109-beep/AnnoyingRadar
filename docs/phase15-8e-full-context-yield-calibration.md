# Phase 15.8E — Full-Context Yield Calibration Shadow

## Status

**CLOSED — IMPLEMENTED / CI VERIFIED / PIE VERIFIED / LIVE SHADOW VERIFIED / MERGED**

Active discovery allocation remains:

```text
source-discovery-allocation-v0.4
```

Phase 15.8E did **not** activate a new production allocation version.

## Why this phase existed

Phase 15.8C established exact new-source snippet-level yield:

```text
new Sources: 961
snippet Candidate: 0
snippet Review: 166
snippet Reject: 795
```

Phase 15.8D resolved a deterministic bounded sample of 24 exact-new Reviews using full public post context:

```text
Candidate: 4
Reject: 15
unresolved: 5
Review → Candidate promotion: 4 / 24 = 16.67%
```

The active v0.4 scorer credits Review directly:

```text
0.1 × review_rate
```

15.8E tested whether Review credit should instead reflect empirically observed full-context Candidate promotion.

## Authority boundary

Phase 15.8E never changed:

- the 192-query plan;
- active request selection;
- exploitation threshold;
- exploration ratio;
- Source Admission thresholds;
- full-context semantic authority;
- Formation / Incident identity;
- Gold membership;
- Blind 120 membership;
- Public Problem formation;
- publication authority.

The shadow score was observational only.

## Calibration authority

Calibration version:

```text
review-promotion-calibration-v0.1
```

Shadow version:

```text
review-promotion-shadow-v0.1
```

Empirical authority is aggregate-only:

```text
global:
  sampled: 24
  Candidate: 4
  Reject: 15
  unresolved: 5

damage:
  sampled: 16
  Candidate: 1
  Reject: 11
  unresolved: 4

delay:
  sampled: 8
  Candidate: 3
  Reject: 4
  unresolved: 1
```

Unresolved remains in the denominator so technical failures cannot inflate promotion yield.

The repository does not store Phase 15.8D full bodies or individual semantic outputs as calibration data.

## Shrinkage

Global bounded promotion rate:

```text
4 / 24 = 0.1666667
```

Prior strength:

```text
24
```

Observed-family calibration:

```text
calibrated family promotion
= (family Candidate + 24 × global promotion rate)
  / (family sampled + 24)
```

Result:

```text
damage raw:        1 / 16 = 0.0625
damage calibrated: 5 / 40 = 0.1250

delay raw:         3 / 8 = 0.3750
delay calibrated:  7 / 32 = 0.21875
```

This prevents the small delay sample from becoming a 37.5% production assumption.

## Shadow formula

Active v0.4:

```text
0.4 × candidate_rate
+ 0.1 × review_rate
+ remaining acquisition-quality terms
```

Promotion-aware shadow:

```text
shadow_score
= base_v0.4_score
- (0.1 × review_rate)
+ (0.4 × review_rate × calibrated_promotion_rate)
```

No active selector consumes `shadow_score`.

## Critical authority correction

The first live shadow run exposed an authority leak: legacy run-level telemetry was also receiving the global promotion fallback even though the 15.8D evidence came only from exact-new Review samples.

Pre-correction run:

```text
workflow run: 32804810085
artifact: 9547757728
main: 8601e6d5d5af0ded8fc767168e350bdec1bc67e5
```

It still produced zero threshold crossings, but some `legacy_run_level` rows received negative shadow deltas.

That was not accepted as final authority.

PR #78 corrected the scope:

```text
calibration_authority_scope = new_source_exact_only
```

Rules after correction:

```text
new_source_exact
→ promotion calibration may apply

legacy_run_level
→ promotion_applicable = false
→ calibrated_promotion_rate = null
→ shadow_score = base_score
→ score_delta = 0
```

Active v0.4 remained unchanged throughout.

## Final live shadow readback

Authoritative exact-only run:

```text
workflow run: 32806513404
artifact: 9548323124
main: 4da500b4f754670995d195be22f4205969879569
status: SUCCESS
```

Summary:

```text
total queries:                 192
measured queries:               46
exact measured queries:         19
promotion-applicable queries:   19

base exploitation eligible:      7
shadow exploitation eligible:    7
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
  mean shadow score: 0.3212648356
  mean delta:       -0.0059492652

delay:
  measured queries: 6
  exact/applicable: 6
  base eligible: 1
  shadow eligible: 1
  mean base score:   0.3213112345
  mean shadow score: 0.3199549729
  mean delta:       -0.0013562616

contact legacy telemetry:
  measured queries: 24
  exact/applicable: 0
  mean base score = mean shadow score
  mean delta: 0
```

Largest observed exact-query delta:

```text
commerce__damage__1
0.4570479308 → 0.4295754033
Δ -0.0274725275
```

It remained exploitation-eligible.

## Boundary verification

Final live shadow runner reported:

```text
active allocation mutations: 0
DB writes: 0
Blind reads: 0
full source-body fetches: 0
publication mutations: 0
```

Independent post-run live DB verification:

```text
Public Problems: 2
Published Problems: 2
Public Problem feed: 2
Public Evidence snapshots: 5
Public Evidence feed: 5
Source Incidents: 4
Blind evaluation samples: 120
```

No public/incident/Blind authority changed during 15.8E.

## Verification

PR #78 exact-scope correction:

```text
CI #341: SUCCESS
PIE #45: SUCCESS
unit: SUCCESS
release hardening: SUCCESS
build: SUCCESS
runtime smoke: SUCCESS
```

## Closeout decision

Phase 15.8E is closed with the following conclusion:

1. Review has measurable downstream value; the 15.8D sample produced 4/24 Candidate promotion.
2. Promotion-aware discounting is behaviorally stable on current exact telemetry; 7/7 exploitation eligibility remained unchanged.
3. Legacy telemetry must not inherit exact-new promotion calibration. That boundary is now enforced.
4. The current 24-sample empirical basis is too small and too concentrated in `damage` and `delay` to justify activating a production allocation v0.5.
5. Therefore active allocation remains `source-discovery-allocation-v0.4`.

This is a **defer activation**, not a rejection of promotion-aware scoring.

## Workflow closeout

`.github/workflows/source-promotion-shadow-pilot.yml` remains available only as explicit `workflow_dispatch` diagnostics.

The temporary:

```text
push → ops/source-promotion-shadow-pilot
```

trigger is removed during closeout.

## Next-stage boundary

The next calibration stage should obtain additional deterministic holdout full-context observations before any production activation.

Recommended next target:

```text
additional exact-new Review holdout: up to 48
exclude the original Phase 15.8D 24 samples
reuse existing full-context authority
aggregate-only result retention
DB writes: 0
Blind reads: 0
```

The purpose is to reduce uncertainty and test whether promotion yield persists beyond the initial 24-sample development slice.

A later activation phase may create a separately versioned allocation only after that evidence exists. Source Admission or Formation thresholds must not be loosened to manufacture volume.
