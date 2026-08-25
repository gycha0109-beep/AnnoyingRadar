# Phase 15.8B — Query Allocation Calibration

## Status

**CALIBRATION CONTINUES — allocation v0.3 implemented, pending CI/PIE and third bounded batch**

Phase 15.8B changes provider request allocation only. It does not alter Discovery Prefilter, Source Admission, Formation, Incident, Gold, Blind-120, Public Problem, or publication authority.

## Phase 15.8A baseline

First empirical batch:

```text
requests: 12
fetched: 150
continued: 144
cheap rejected: 6
new Sources: 137
duplicates: 7
Candidates: 1
Reviews: 22
Admission Rejects: 121
```

The baseline proved Source-supply expansion, but exposed a request-budget problem.

## Allocation v0.2

Version:

```text
source-discovery-allocation-v0.2
```

v0.2 fixed two allocation-v0.1 defects:

1. completed zero-result queries stopped masquerading as unexplored queries;
2. Source Admission Reject rate began penalizing exploitation score.

It also introduced a minimum exploitation score:

```text
DISCOVERY_MIN_EXPLOITATION_SCORE = 0.32
```

### Second bounded empirical batch

Authoritative main:

```text
90ebbaf4b6632391da9fcb1aa357406ecc2cae9e
```

GitHub Actions:

```text
run: 32797010101
job: 97655224496
status: PASS
```

Observed selection behavior was partly correct:

- `수리 연락 안됨` was not replayed;
- first-batch zero-result queries were not replayed as exploration;
- six previously unmeasured query keys were explored;
- `환불 연락 안됨` remained exploitation-eligible under v0.2.

Second-batch totals:

```text
requests: 12
fetched: 100
continued: 94
cheap rejected: 6
new Sources: 2
duplicates: 92
Candidates: 1
Reviews: 21
Admission Rejects: 72
```

Observed rates:

```text
new Source / fetched:       2.00%
duplicate / continued:    97.87%
```

Post-batch live state:

```text
Source Signals:        969
Source Observations:  1,118
Discovery Runs:         24
Published Problems:      2
Public Evidence:          5
Source Incidents:         4
Blind membership:       120
```

Protected runner boundaries remained unchanged:

```text
Raw Inputs:        10
Pain Evidence:     27
Public Problems:    2
Public Evidence:    5
Source Incidents:   4
Blind reads:        0
full-body fetches:  0
publication writes: 0
```

## Empirical defect exposed by v0.2

The scorer was no longer the only bottleneck.

Exploitation still called the exact same provider window:

```text
sort = date
start = 1
limit = 50
```

for already measured queries.

That produced near-total replay of previously observed rows. The 1 Candidate and 21 Reviews in batch 2 are run-level Admission classifications over continued signals, including duplicates. They must not be described as 22 newly discovered useful signals.

Therefore Phase 15.8B was not closed after batch 2.

## Allocation v0.3

Version:

```text
source-discovery-allocation-v0.3
```

v0.3 adds provider-window authority to allocation.

### Historical page state

`listDiscoveryQueryMetrics()` now retains, per semantic query key:

```text
requested_limit
max_start
max_start_fetched_count
```

No schema migration is required. Existing `requested_limit` and `request_metadata.start` are reused.

### Exploitation eligibility

A measured query may be exploited only when all are true:

```text
score >= 0.32
max_start_fetched_count >= requested_limit
next provider window is within Naver's 1..1000 bound
```

If the highest observed page returned fewer rows than requested, that query is considered exhausted for immediate sequential acquisition.

Example:

```text
환불 연락 안됨
start=1, limit=50, fetched=13
→ useful Candidate observed
→ page is nevertheless exhausted
→ do not replay start=1
```

A high-scoring full page advances instead of replaying:

```text
start=1, limit=50, fetched=50
→ next exploitation start=51
```

### Allocation provenance

Selected requests now record:

```text
discovery_allocation_version
discovery_allocation_mode   = exploration | exploitation
discovery_page_start
```

Exploration begins at the plan's initial page. Exploitation advances only to a new provider window.

### Low-score and exhausted queries

Measured low-score queries are not selected while unexplored query space remains.

Measured partial/empty pages are not exact-page replay fallbacks.

This intentionally allows a bounded batch to contain fewer than the requested maximum if the query space eventually becomes exhausted rather than spending provider calls on known replay.

## Third empirical gate

After CI/PIE and merge, run another 12-request bounded batch from authoritative `main`.

The gate must verify:

```text
no exact start=1 replay for measured queries
no measured-empty replay
no low-score repair replay
pagination uses start=51 only for eligible full-page queries
unmeasured exploration remains the dominant budget when no productive full page exists
```

Report:

```text
selected query key + start
allocation mode
fetched
continued
cheap rejected
new Sources
duplicates
Candidates
Reviews
Rejects
```

Compare new-source and duplicate rates with both prior batches, but do not claim general causal superiority from one batch.

Protected boundaries remain mandatory:

```text
Published Problems = 2
Public Evidence = 5
Source Incidents = 4
Blind membership = 120
full source-body fetches = 0
publication mutations = 0
```

## Close criterion

Phase 15.8B may close only after a live batch demonstrates that allocation no longer spends material budget on exact-page replay while preserving the downstream authority boundaries.

Any remaining quality problem after that is evaluated at the acquisition/query layer first. Source Admission, Formation, Incident, Blind, and publication thresholds remain out of scope.
