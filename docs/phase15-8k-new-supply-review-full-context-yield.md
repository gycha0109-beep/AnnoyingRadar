# Phase 15.8K — New-Supply Review Full-Context Yield

## Status

**CLOSED — IMPLEMENTED / CI VERIFIED / PIE VERIFIED / LIVE FULL-CONTEXT SAMPLE VERIFIED / MERGED**

Active discovery allocation remains:

```text
source-discovery-allocation-v0.4
```

No recovery lane, Formation authority, Incident authority, Blind membership, or publication authority was activated or changed.

## Purpose

Phase 15.8J expanded Source supply with the existing active allocation:

```text
24 requests
1,157 fetched
985 new Sources
3 new Candidate
130 new Review
852 new Reject
```

15.8K measured whether that newly acquired deterministic Review supply promotes to Candidate when the existing semantic Source Admission authority sees full public post context.

This cohort is separate from the historical Phase 15.8D/15.8F calibration samples.

## Frozen 15.8J cohort authority

The runner reconstructed exactly:

```text
completed_at from: 2026-08-25T05:15:33.082Z
completed_at to:   2026-08-25T05:16:33.738Z
exact runs: 24
fetched: 1,157
new Sources: 985
duplicates: 91
new Candidate: 3
new Review: 130
new Reject: 852
```

Run identity fingerprint:

```text
df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df
```

The identity list itself is not committed.

## Sampling authority

Sample version:

```text
new-supply-review-sample-v0.1
```

Live sample:

```text
selected: 48 / 130 Reviews
sample fingerprint:
9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

Selection was deterministic and stratified by `domain:family`.

Family distribution:

```text
damage: 22
delay:  13
error:  13
```

Domain distribution:

```text
account:      9
billing:      6
commerce:     9
delivery:     3
healthcare:   2
housing:      3
lodging:      6
mobility:     2
refund:       2
repair:       2
reservation:  2
support:      2
```

No selected Source identity list is retained in repository authority.

## Implementation authority

Implementation PR:

```text
PR #90
merge: 7c2054b29211569f7c5660ec88eda6d2bf9604af
CI #366: SUCCESS
PIE #58: SUCCESS
```

Unit/contract tests, release hardening, build, and runtime smoke were all successful before live execution.

## Live execution

Authoritative live run:

```text
workflow: Source New-Supply Review 15.8K
run: 32813922410
artifact: 9550886238
authoritative main: 7c2054b29211569f7c5660ec88eda6d2bf9604af
workflow conclusion: SUCCESS
runner status: COMPLETE_WITH_UNRESOLVED
```

The workflow checked out authoritative `main` before reading Supabase or invoking the semantic provider.

## Aggregate outcome

```text
sampled:   48
Candidate:  7
Reject:    28
Review:    13
resolved:  35
unresolved:13
```

Promotion rates:

```text
conservative: 7 / 48 = 14.58%
resolved-only: 7 / 35 = 20.00%
```

The conservative denominator intentionally retains technical unresolved cases.

## Cross-cohort readback

Historical Phase 15.8F disjoint holdout:

```text
7 / 48 = 14.58%
```

15.8K new-supply cohort:

```text
7 / 48 = 14.58%
```

Historical combined Phase 15.8D + 15.8F:

```text
11 / 72 = 15.28%
```

The new source-supply expansion therefore did not show evidence of Review → Candidate quality dilution under this bounded sample. The numerical equality between the two 48-item samples is an observation, not evidence that the underlying true rates are exactly equal.

## Family outcomes

### damage

```text
total: 22
Candidate: 2
Reject: 15
unresolved: 5
resolved: 17
conservative promotion: 9.09%
```

### delay

```text
total: 13
Candidate: 2
Reject: 9
unresolved: 2
resolved: 11
conservative promotion: 15.38%
```

### error

```text
total: 13
Candidate: 3
Reject: 4
unresolved: 6
resolved: 7
conservative promotion: 23.08%
```

`error` has the highest observed Candidate proportion but also the highest unresolved proportion; subgroup sizes are too small to authorize family-specific production policy from this phase.

## Allocation-mode outcomes

### Exploitation-origin Reviews

```text
total: 14
Candidate: 2
Reject: 9
unresolved: 3
resolved: 11
conservative Candidate rate: 14.29%
resolved-only Candidate rate: 18.18%
```

### Exploration-origin Reviews

```text
total: 34
Candidate: 5
Reject: 19
unresolved: 10
resolved: 24
conservative Candidate rate: 14.71%
resolved-only Candidate rate: 20.83%
```

This clarifies the role of active allocation v0.4:

```text
15.8J acquisition-level Candidate+Review yield
exploitation: 25.36%
exploration:   8.89%

15.8K conditional Review→Candidate yield
exploitation: 14.29%
exploration:  14.71%
```

Under the observed sample, v0.4's major advantage is concentration of requests onto queries that produce more promising snippet-level Candidate/Review supply. Once a Source is already in Review, this sample does not show materially higher Candidate conversion for exploitation-origin records.

This does not authorize removing exploration; exploration remains necessary for query-space coverage.

## Semantic reason readback

```text
full_context_first_hand_external_friction:   7
full_context_informational_content:          18
full_context_nonorganic_or_borrowed:          7
full_context_not_first_hand:                  3
full_context_url_invalid:                     2
source_full_context_invalid_evidence_quote:   1
source_full_context_provider_incomplete:     10
```

Fetch-status readback:

```text
resolved:    46
unavailable:  2
```

The 13 unresolved outcomes consist principally of semantic-provider reliability rather than acquisition failure:

```text
provider incomplete: 10
invalid evidence quote: 1
URL invalid / unavailable: 2
```

This phase intentionally did not activate Phase 15.8G recovery or Phase 15.8H quote isolation, so the unresolved rate reflects the current base resolution lane.

## Reliability conclusion

The largest remaining technical bottleneck is now:

```text
source_full_context_provider_incomplete: 10 / 48
```

Phase 15.8G previously found bounded provider-incomplete retry useful in its pilot, while invalid-quote recovery remained unestablished.

15.8K therefore supports a narrowly scoped next evaluation of **provider-incomplete recovery only**. It does not justify activating quote isolation or weakening quote validation.

## Mutation and privacy boundary

The live runner reported exact before/after equality:

```text
Source Signals:       3,245 → 3,245
Source Observations:  3,537 → 3,537
Source Ingestion Runs:  132 →   132
Raw Inputs:              10 →    10
Pain Evidences:          27 →    27
Public Problems:          2 →     2
Public Evidence:          5 →     5
Source Incidents:         4 →     4
```

Independent post-run live DB readback confirmed:

```text
Source Signals:       3,245
Source Observations:  3,537
Source Ingestion Runs:  132
Raw Inputs:              10
Pain Evidences:          27
Public Problems:          2
Published Problems:       2
Public Evidence:          5
Source Incidents:         4
Blind membership:       120
  representative:        60
  challenge:             60
```

A first independent readback query used an incorrect table name and failed read-only with `relation does not exist`; no mutation occurred. The corrected authority table is `ar_source_signal_evaluation_samples`.

Declared boundaries:

```text
DB writes: 0
Blind reads by runner: 0
full source bodies persisted: 0
Formation authority granted: false
Incident mutations: 0
publication mutations: 0
active allocation mutations: 0
recovery lane activated: false
```

## Closeout workflow authority

The one-shot live run used:

```text
ops/source-new-supply-review-15-8k
```

During closeout the automatic push trigger is removed. Retained workflow authority is:

```text
workflow_dispatch only
```

## Phase conclusion

Phase 15.8K closes with these conclusions:

1. the exact 15.8J 985-Source / 130-Review cohort reconstructed successfully;
2. a deterministic 48-item new-Review sample produced 7 Candidates, 28 Rejects, and 13 technical unresolved Reviews;
3. conservative Review → Candidate promotion was 14.58%, matching the prior 48-item holdout and remaining close to the historical combined 15.28% rate;
4. the new source expansion did not show evidence of admission-quality dilution;
5. v0.4's observed benefit is primarily acquisition-stage concentration, not higher conditional Review → Candidate conversion;
6. 10/48 provider-incomplete outcomes are now the dominant technical reliability bottleneck;
7. no Formation, Incident, Blind, publication, active-allocation, or recovery authority changed.

## Next-stage boundary

Recommended next phase:

```text
Phase 15.8L — Provider-Incomplete Recovery Reproduction
```

It should reconstruct the exact 15.8K sample and target only the ten records whose base-run terminal reason was:

```text
source_full_context_provider_incomplete
```

The phase should:

- use the already implemented bounded recovery lane;
- leave the invalid-quote target and two URL-invalid targets untouched;
- retain aggregate-only authority;
- persist no full source bodies;
- perform zero DB / Formation / Incident / publication mutation;
- distinguish fresh first-attempt variation from actual retry recovery;
- not activate recovery in the product path merely because the evaluation succeeds.

Only after reproduction should a separately versioned activation phase consider integrating **provider-incomplete bounded retry only** into the active resolver.
