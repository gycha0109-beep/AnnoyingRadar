# Phase 15.8F — Disjoint Review Promotion Holdout

## Status

**CLOSED — IMPLEMENTED / CI VERIFIED / PIE VERIFIED / LIVE HOLDOUT VERIFIED / MERGED**

Active discovery allocation remains:

```text
source-discovery-allocation-v0.4
```

No production allocation activation occurred in this phase.

## Purpose

Phase 15.8D measured the first deterministic exact-new Review sample:

```text
sampled: 24
Candidate: 4
Reject: 15
unresolved: 5
conservative promotion: 4 / 24 = 16.67%
```

Phase 15.8E showed that promotion-aware Review discounting was stable in shadow, but 24 observations were not enough to justify activation.

Phase 15.8F therefore measured a second, disjoint 48-item holdout before any production allocation decision.

## Frozen authority window

The Phase 15.8D exact-new discovery window is frozen at:

```text
completed_at <= 2026-08-25T02:29:36.982Z
exact runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

The runner hard-fails if those historical counts no longer reconstruct exactly.

## Holdout identity boundary

Original selector:

```text
exact-new-review-sample-v0.1
sample size: 24
```

Holdout selector:

```text
exact-new-review-holdout-v0.1
requested size: 48
```

The original identities are reconstructed from the frozen window and excluded in memory. They are not committed as an identity list.

Final live manifest:

```text
frozen exact runs: 24
frozen exact-new Sources: 961
frozen exact-new Reviews: 166
excluded original sample: 24
eligible holdout pool: 142
selected holdout: 48
overlap count: 0

original sample fingerprint:
cd2f11ecb6430ce9408bafc360a15605f8867b0b0db2a6b4d9c2d386beb73a37

holdout sample fingerprint:
30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7
```

## Live run

Authoritative run:

```text
workflow run: 32807308702
artifact: 9548700358
main: e52abfd1cdda7d886482a9f791f52df1d03f7988
workflow conclusion: SUCCESS
runner status: COMPLETE_WITH_UNRESOLVED
```

The workflow checked out authoritative `main` before consuming repository secrets.

## Holdout result

```text
sampled: 48
Candidate: 7
Reject: 33
unresolved Review: 8
resolved: 40

conservative promotion:
7 / 48 = 14.58%

resolved-only promotion:
7 / 40 = 17.50%
```

The conservative rate intentionally keeps unresolved cases in the denominator.

### Family result

```text
damage:
  total: 37
  Candidate: 5
  Reject: 26
  unresolved: 6
  conservative promotion: 13.51%

delay:
  total: 11
  Candidate: 2
  Reject: 7
  unresolved: 2
  conservative promotion: 18.18%
```

The holdout does not reproduce the extreme raw family split from the first 24-sample slice. Family-level production authority remains unjustified because subgroup sizes are still small.

## Initial versus holdout

```text
Phase 15.8D initial:
4 / 24 = 16.67%

Phase 15.8F holdout:
7 / 48 = 14.58%

combined disjoint evidence:
11 / 72 = 15.28%
```

Approximate Wilson 95% intervals for the conservative promotion rate:

```text
initial 4/24:   6.68% – 35.85%
holdout 7/48:  7.25% – 27.17%
combined 11/72: 8.75% – 25.32%
```

The holdout is directionally consistent with the initial estimate and does not indicate that 16.67% was purely an initial-sample spike. The interval is still broad enough that activation remains a separate decision.

Resolved-only combined evidence:

```text
initial resolved: 4 / 19 = 21.05%
holdout resolved: 7 / 40 = 17.50%
combined resolved: 11 / 59 = 18.64%
```

Conservative counts remain the primary calibration input because unresolved technical failures must not inflate apparent yield.

## Unresolved diagnostics

All 48 public full-context fetches completed:

```text
fetch status resolved: 48 / 48
```

The eight unresolved outcomes occurred after fetch, at semantic-provider validation:

```text
source_full_context_provider_incomplete: 5
source_full_context_invalid_evidence_quote: 3
```

This separates the remaining technical problem from acquisition/fetch reliability. The next reliability work should address bounded semantic-provider completion/validation recovery without changing admission semantics.

Other aggregate outcome reasons:

```text
full_context_first_hand_external_friction: 7
full_context_informational_content: 30
full_context_nonorganic_or_borrowed: 1
full_context_not_first_hand: 2
```

## Output/privacy boundary

The holdout artifact records aggregate diagnostics only. It does not retain:

- Source Signal ids;
- canonical URLs;
- author handles;
- full source bodies;
- individual semantic payloads;
- provider request ids.

The committed repository retains fingerprints and aggregate evidence, not an identity-level holdout label store.

## Mutation verification

The live runner's before/after snapshots were identical:

```text
Source Signals: 2260 → 2260
Source observations: 2461 → 2461
Source ingestion runs: 108 → 108
Raw Inputs: 10 → 10
Pain Evidence: 27 → 27
Public Problems: 2 → 2
Public Evidence: 5 → 5
Source Incidents: 4 → 4
```

Runner-declared boundaries:

```text
DB writes: 0
Blind reads: 0
full source bodies persisted: 0
publication mutations: 0
active allocation mutations: 0
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

## Implementation verification

PR #80 implementation:

```text
CI #345: SUCCESS
PIE #47: SUCCESS
unit: SUCCESS
release hardening: SUCCESS
build: SUCCESS
runtime smoke: SUCCESS
```

## Closeout decision

Phase 15.8F is closed with these conclusions:

1. the holdout is disjoint from the original 24 by construction and live manifest assertion;
2. the initial Review → Candidate signal reproduced: 16.67% initial versus 14.58% holdout;
3. combined conservative evidence is 11/72 = 15.28%;
4. 8/48 unresolved cases are semantic-provider completion/quote-validation failures, not full-context fetch failures;
5. Public Problem, Evidence, Incident, and Blind authorities remained unchanged;
6. active allocation remains `source-discovery-allocation-v0.4`.

15.8F strengthens the empirical basis for promotion-aware scoring but does not itself authorize production activation.

## Workflow closeout

`.github/workflows/source-review-holdout-pilot.yml` remains as manual `workflow_dispatch` diagnostics only.

The temporary:

```text
push → ops/source-review-holdout-pilot
```

trigger is removed during closeout.

## Next-stage boundary

The next phase should address the semantic-provider technical unresolved rate before production allocation activation:

```text
8 / 48 = 16.67% unresolved
5 provider incomplete
3 invalid evidence quote
0 full-context fetch failures
```

Any remediation must preserve the existing semantic schema and deterministic Source Admission mapping. Bounded retry/recovery may be evaluated, but policy thresholds or decision semantics must not be loosened.

After provider reliability is measured, a separately versioned combined-evidence calibration shadow may be evaluated. Production activation remains explicit and separate.
