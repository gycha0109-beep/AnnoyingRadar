# Phase 15.8C — New-Source Yield Telemetry

## Status

**CLOSED — 2026-08-25**

## Why this phase existed

Phase 15.8B removed material exact-page replay, but the acquisition telemetry still mixed newly inserted Source identities with duplicates.

Historical fields:

```text
admission_candidate_count
admission_review_count
admission_reject_count
```

classify all continued signals in a run. Therefore:

```text
run-level Candidate/Review/Reject
!= newly acquired Candidate/Review/Reject
```

Phase 15.8C separates exact new-source yield without changing Source Admission or publication authority.

## Authority preserved

Phase 15.8C changed acquisition telemetry and allocation scoring only.

It did not change:

- Discovery Prefilter decisions;
- Source Admission policy or thresholds;
- full-context Formation;
- Incident identity;
- Gold calibration membership;
- Blind-120 membership;
- Public Problem formation;
- Public Problem publication authority.

## Implementation

Telemetry version:

```text
new-source-admission-yield-v0.1
```

Allocation version:

```text
source-discovery-allocation-v0.4
```

Exact new Source identity is defined before upsert:

```text
newSignals
= unique continued signals
- identities already present in ar_source_signals before this run
```

Only `newSignals` feed exact new-source Admission telemetry.

Historical run-level Admission telemetry remains preserved.

## Migration 033

Migration:

```text
033_new_source_admission_yield_telemetry.sql
```

Live applied before PR #70 merge.

Added to `ar_source_ingestion_runs`:

```text
new_admission_telemetry_version
new_admission_candidate_count
new_admission_review_count
new_admission_reject_count
```

Historical rows remain null.

For each versioned exact row the live database requires:

```text
new Candidate
+ new Review
+ new Reject
= inserted_count
```

No public view or anonymous grant was added.

## Allocation v0.4

The scorer uses:

```text
exact new-source telemetry exists
→ telemetry_scope = new_source_exact
→ score from exact new-source Admission outcomes

otherwise
→ telemetry_scope = legacy_run_level
→ preserve historical compatibility
```

Exact Candidate/Review/Reject rates use `new_telemetry_inserted_count` as their denominator.

A versioned exact window with zero newly inserted Sources receives score `0`; duplicate-only pages therefore cannot gain exploitation value merely because previously known Sources classify well.

## PR / verification

Implementation PR:

```text
PR #70
head: a569314691338aa84ede90742e1064262e49d332
merge: c1cfaa89ef64451965edc45e0eb7c465861ae2fe
```

Verification:

```text
CI #324: SUCCESS
PIE Prospective Shadow #36: SUCCESS
unit/contract: SUCCESS
release hardening: SUCCESS
build: SUCCESS
runtime smoke: SUCCESS
```

## Fourth bounded empirical batch — exact telemetry write

GitHub Actions:

```text
run: 32797010101
job: 97662496437
status: PASS
main: c1cfaa89ef64451965edc45e0eb7c465861ae2fe
```

Allocation composition:

```text
exploration: 9
exploitation: 3
```

Totals:

```text
requests: 12
fetched: 554
continued: 523
cheap rejected: 31
inserted new Sources: 496
duplicates: 27
```

Historical run-level Admission summary:

```text
Candidate: 0
Review: 95
Reject: 428
```

Exact new-source Admission summary:

```text
new Candidate: 0
new Review: 89
new Reject: 407
```

Exact identity integrity:

```text
0 + 89 + 407 = 496 inserted Sources
12 exact runs
12 integrity pass
0 integrity fail
```

Downstream product boundaries remained unchanged.

## Fifth bounded empirical batch — exact telemetry consumption

A second v0.4 batch was executed specifically to verify that exact telemetry participates in subsequent allocation.

GitHub Actions:

```text
run: 32797010101
job: 97663035604
status: PASS
main: c1cfaa89ef64451965edc45e0eb7c465861ae2fe
```

The allocator selected previously exact-measured queries for later provider windows, including:

```text
account__damage__2
  prior exact page: start=1
  subsequent exploitation: start=51

commerce__damage__2
  prior exact page: start=1
  subsequent exploitation: start=51

commerce__damage__1
  prior exact page: start=51
  subsequent exploitation: start=101

housing__damage__1
  prior exact page: start=51
  subsequent exploitation: start=101
```

This is live evidence that versioned exact history is consumed by the allocation path rather than remaining write-only telemetry.

Fifth-batch totals:

```text
requests: 12
fetched: 543
continued: 486
cheap rejected: 57
inserted new Sources: 465
duplicates: 21

new Candidate: 0
new Review: 77
new Reject: 388
```

Exact identity integrity again holds:

```text
0 + 77 + 388 = 465 inserted Sources
```

## Final exact-telemetry live state

Across the two Phase 15.8C empirical batches:

```text
exact telemetry runs: 24
integrity pass: 24
integrity fail: 0
inserted new Sources: 961
new Candidates: 0
new Reviews: 166
new Rejects: 795
```

Final Source supply state:

```text
Source Signals:       2,260
Source Observations:  2,461
Discovery Runs:          60
```

Protected authority state:

```text
Published Problems: 2
Public Evidence:     5
Source Incidents:    4
Blind membership:  120
```

Runner boundary assertions for both empirical batches remained:

```text
Blind reads:           0
full source-body fetches: 0
publication mutations: 0
```

## Close decision

Phase 15.8C close criterion required:

1. exact new-source Candidate/Review/Reject counts to equal inserted Source count for every versioned run;
2. adaptive allocation to consume exact new-source telemetry;
3. Source Admission and downstream publication authority to remain unchanged.

All three conditions were verified live.

Therefore:

```text
Phase 15.8C = CLOSED
```

## Next boundary

The current acquisition bottleneck is no longer duplicate replay or ambiguous yield accounting.

Exact empirical result:

```text
961 newly inserted Sources
0 exact Candidates
166 exact Reviews
795 exact Rejects
```

The next question is whether the 166 exact Reviews contain meaningful full-context Candidates or are primarily ambiguous/noisy search matches.

That question must be resolved through bounded Review-resolution evidence. It must not be answered by lowering Source Admission thresholds.
