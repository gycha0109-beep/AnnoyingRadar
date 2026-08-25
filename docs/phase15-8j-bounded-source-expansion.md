# Phase 15.8J — Bounded Source Supply Expansion

## Status

**CLOSED — IMPLEMENTED / CI VERIFIED / PIE VERIFIED / LIVE ACQUISITION VERIFIED / MERGED**

Active discovery allocation remains:

```text
source-discovery-allocation-v0.4
```

No Source Admission, Formation, Incident, Blind, or publication authority changed in this phase.

## Purpose

Phase 15.8I closed the Review-promotion calibration question without changing active allocation:

```text
source-discovery-allocation-v0.4
base exploitation eligible: 7
combined-shadow eligible: 7
threshold crossings: 0
```

Further calibration did not change source-selection behavior. The active bottleneck therefore returned to Source supply breadth.

Phase 15.8J executed one bounded acquisition batch with the existing active allocation instead of loosening Source Admission or Formation.

## Batch authority

```text
requests: 24
results per request: up to 50
maximum provider opportunities: 1,200
provider: Naver Blog search
allocation: source-discovery-allocation-v0.4
query plan: existing 192-query plan
```

The existing `selectDiscoveryRequestBudget(...)` consumed current historical metrics and pagination state. 15.8J did not hardcode query identities or override allocation scoring.

## Implementation authority

Implementation PR:

```text
PR #88
merge: a09dcdaaa89aa273c065ec2635a8f1ca00f02524
CI #362: SUCCESS
PIE #56: SUCCESS
```

Unit/contract tests, release hardening, build, and runtime smoke all passed before live execution.

## Live execution

Authoritative one-shot workflow:

```text
workflow: Source Discovery Expansion 15.8J
run: 32812102364
artifact: 9550167854
authoritative main: a09dcdaaa89aa273c065ec2635a8f1ca00f02524
result: PASS
provider failures: 0
```

The workflow checked out authoritative `main` before consuming repository secrets.

## Live funnel

```text
requests:                    24
fetched:                  1,157
normalized:               1,157
cheap-filter continue:    1,076
cheap reject:                81

new Sources:                985
duplicates:                  91

new Candidate:                3
new Review:                 130
new Reject:                 852
```

The batch therefore added meaningful downstream-reviewable supply without lowering admission thresholds.

## Source table deltas

Independent post-run readback:

```text
Source Signals:       2,260 → 3,245   (+985)
Source Observations:  2,461 → 3,537 (+1,076)
Source Ingestion Runs:  108 →   132    (+24)
```

Observation growth matches the 1,076 prefilter-continued records; Source growth matches the 985 newly inserted records.

## Allocation-mode readback

### Exploitation

```text
runs:            7
fetched:       350
new Sources:   276
duplicates:     51
new Candidate:   2
new Review:      68
new Reject:     206
```

New Candidate + Review yield:

```text
70 / 276 = 25.36%
```

### Exploration

```text
runs:           17
fetched:       807
new Sources:   709
duplicates:     40
new Candidate:   1
new Review:      62
new Reject:     646
```

New Candidate + Review yield:

```text
63 / 709 = 8.89%
```

This batch therefore provides empirical evidence that active v0.4 exploitation concentrated requests on materially higher-yield Source Admission supply than exploration under the observed conditions.

This does not imply that exploration should be removed. Exploration remains necessary for coverage and discovery of unmeasured query families.

## Family readback

### damage

```text
runs:           11
fetched:       550
new Sources:   454
duplicates:     56
new Candidate:   2
new Review:      83
new Reject:     369
```

### delay

```text
runs:            8
fetched:       375
new Sources:   323
duplicates:     23
new Candidate:   1
new Review:      28
new Reject:     294
```

### error

```text
runs:            5
fetched:       232
new Sources:   208
duplicates:     12
new Candidate:   0
new Review:      19
new Reject:     189
```

The current 15.8J batch was concentrated in `damage`, `delay`, and newly explored `error`; no claim is made for families that were not selected in this batch.

## Notable query-level readback

Examples from the live runner:

```text
commerce__delay__1
49 new Sources
1 Candidate
14 Review

refund__damage__2
43 new Sources
1 Candidate
6 Review

commerce__damage__2
47 new Sources
1 Candidate
11 Review
```

These are acquisition telemetry observations, not Formation or publication authority.

## Mutation authority

This was an acquisition phase, so Source supply mutation was expected.

Allowed mutable resources:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

Forbidden downstream resources remained unchanged inside the runner's before/after assertion:

```text
ar_raw_inputs:                          10 → 10
ar_pain_evidences:                      27 → 27
ar_public_problems:                      2 → 2
ar_public_problem_evidence_snapshots:    5 → 5
ar_source_incidents:                     4 → 4
```

Independent post-run readback additionally confirmed:

```text
Published Problems:      2
Public Evidence:         5
Source Incidents:        4
Blind membership:      120
  representative:       60
  challenge:            60
```

## Classification boundary

Pipeline remained:

```text
Naver search result
→ normalization
→ cheap high-recall discovery prefilter
→ persist continued Source only
→ existing deterministic Source Admission telemetry
```

No full-context or semantic-provider work occurred:

```text
OpenAI calls:             0
Blind reads:              0
full source-body fetches: 0
publication mutations:    0
```

Admission and Formation thresholds remained unchanged.

## Closeout workflow authority

The one-shot live run used the exact temporary branch trigger:

```text
ops/source-discovery-expansion-15-8j
```

During closeout the push trigger is removed. Retained workflow authority is:

```text
workflow_dispatch only
```

The historical `.github/workflows/source-discovery-pilot.yml` remains manual-only and unchanged.

## Phase conclusion

Phase 15.8J is closed with these conclusions:

1. 24 bounded Naver requests completed with zero provider failures;
2. 985 new Sources were added from 1,157 fetched results;
3. 130 new Reviews and 3 deterministic Candidates entered the operational Source pool;
4. exploitation produced materially higher Candidate+Review yield than exploration in this batch: 25.36% versus 8.89%;
5. downstream Problem/Evidence/Incident and Blind authorities remained unchanged;
6. active allocation remains `source-discovery-allocation-v0.4`;
7. no threshold was loosened to manufacture volume.

## Next-stage boundary

The next information bottleneck is downstream quality of the newly acquired Review supply, not another immediate acquisition batch.

Recommended next phase:

```text
Phase 15.8K — New-Supply Review Full-Context Yield
```

It should:

- reconstruct exactly the 15.8J batch from completed ingestion-run authority;
- select a deterministic bounded sample from the 130 exact-new Reviews;
- fetch public full context ephemerally;
- apply existing semantic Source Admission authority;
- record Candidate / Reject / unresolved outcomes in aggregate only;
- keep DB writes at 0;
- keep Blind reads at 0;
- persist no full source bodies;
- perform no Formation, Incident, or publication mutation.

The purpose is to measure:

```text
15.8J new Source
→ deterministic Review
→ full-context Candidate
```

Only after this yield is measured should a separate phase decide whether to run broader full-context resolution, acquire more supply, or begin controlled Formation analysis on eligible Candidates.
