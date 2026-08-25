# Phase 15.8F — Disjoint Review Promotion Holdout

## Status

**IMPLEMENTED — pending CI/PIE and bounded live holdout**

## Purpose

Phase 15.8D measured a first deterministic exact-new Review sample:

```text
sampled: 24
Candidate: 4
Reject: 15
unresolved: 5
conservative promotion: 4 / 24 = 16.67%
```

Phase 15.8E showed that a promotion-aware shadow does not currently change exploitation eligibility, but the empirical basis is too small and concentrated in `damage` and `delay` to activate a production allocation change.

Phase 15.8F therefore measures an additional **disjoint 48-item holdout** before any allocation activation decision.

## Frozen authority window

The original exact-new discovery telemetry used by Phase 15.8D is frozen at:

```text
completed_at <= 2026-08-25T02:29:36.982Z
exact runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

The holdout runner fails closed if any of these frozen counts no longer reconstruct exactly.

This protects historical sample reproducibility even if later discovery runs add new exact-new Sources.

## Original sample reconstruction

The original 24 identities are **not committed as a list**.

Instead, Phase 15.8F reconstructs the frozen 166-Review queue and replays the existing historical selector:

```text
selectDeterministicReviewSample(...)
version = exact-new-review-sample-v0.1
sample size = 24
```

Those 24 identities become an in-memory exclusion set only.

The committed repository retains only aggregate counts and sample fingerprints, not the individual identities.

## Holdout selection

Holdout version:

```text
exact-new-review-holdout-v0.1
```

Selection:

```text
frozen 166 Review queue
- original deterministic 24
= 142 eligible holdout records

select up to 48
with a new holdout hash seed
and domain:family round-robin balancing
```

Hard invariant:

```text
original ∩ holdout = ∅
```

If fewer than 48 eligible records remain, all remaining records are selected and the smaller size is reported transparently.

## Resolution authority

The holdout reuses the existing Phase 15.5F / 15.8D authority:

```text
resolveSourceAdmissionWithFullContext(...)
```

It does not add a new semantic policy and does not change Source Admission thresholds.

Full-context fetch or provider failures remain unresolved; they are never converted into implicit Rejects.

## Output policy

The live artifact intentionally omits:

- Source Signal ids;
- canonical URLs;
- author handles;
- full source bodies;
- individual semantic payloads;
- provider request ids.

It records only:

```text
sample fingerprints
sample distribution
Candidate / Reject / Review totals
resolved / unresolved totals
conservative promotion rate
resolved-only promotion rate
outcomes by domain
outcomes by family
aggregate reason-code counts
aggregate fetch-status counts
boundary snapshots
```

This prevents the holdout artifact from becoming a new identity-level calibration store.

## Mutation boundary

Phase 15.8F is read-only.

Expected:

```text
DB writes: 0
Blind reads: 0
full source bodies persisted: 0
publication mutations: 0
active allocation mutations: 0
```

The runner snapshots relevant database counts before and after and fails if they differ.

The Blind 120 table is intentionally not queried by the runner.

## Paid-call boundary

Live execution requires both:

```text
--live
ALLOW_PAID_SOURCE_FULL_CONTEXT=true
OPENAI_API_KEY present
```

Maximum intended holdout:

```text
48 public full-context fetches
48 external model calls
```

## Workflow

Temporary pilot workflow:

```text
.github/workflows/source-review-holdout-pilot.yml
```

The current connector cannot dispatch `workflow_dispatch` directly, so the implementation phase includes one exact temporary trigger:

```text
push → ops/source-review-holdout-pilot
```

Security boundary:

- workflow checks out authoritative `main`, never the ops branch contents;
- repository secrets are consumed only after authoritative-main checkout;
- permissions are `contents: read`;
- no pull-request trigger exists.

The temporary push trigger must be removed at closeout.

## Interpretation

15.8F does not activate v0.5.

The holdout will be compared with the first 24-sample result on:

- conservative Candidate promotion rate;
- unresolved rate;
- family distribution;
- direction and magnitude consistency;
- whether the initial 16.67% estimate persists outside the original sample.

No single family will receive production authority merely because of a small holdout subgroup.

## Next-stage boundary

After live holdout completion:

1. record aggregate holdout evidence;
2. remove the temporary ops push trigger;
3. verify Public Problem / Evidence / Incident / Blind baselines remain unchanged;
4. close Phase 15.8F;
5. only then decide whether a new calibration shadow version is justified.

Production activation remains a separate explicit phase.
