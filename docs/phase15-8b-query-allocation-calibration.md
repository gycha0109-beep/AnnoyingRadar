# Phase 15.8B — Query Allocation Calibration

## Status

**CLOSED — 2026-08-25**

Phase 15.8B changed provider request allocation only. It did not alter Discovery Prefilter, Source Admission, Formation, Incident, Gold, Blind-120, Public Problem, or publication authority.

## Baseline from Phase 15.8A

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

This proved that Source supply could be expanded without touching downstream authority, but it exposed request-budget inefficiency.

## Allocation v0.2

Version:

```text
source-discovery-allocation-v0.2
```

v0.2 fixed two allocation-v0.1 defects:

1. completed zero-result queries stopped masquerading as unexplored queries;
2. Source Admission Reject rate began penalizing exploitation score.

It also introduced:

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

Rates:

```text
new Source / fetched:      2.00%
duplicate / continued:   97.87%
```

The 1 Candidate and 21 Reviews were run-level Admission classifications over continued signals, including duplicates. They are not 22 newly discovered useful Sources.

The failure was exact provider-window replay:

```text
sort=date
start=1
limit=50
```

for already measured queries.

Phase 15.8B therefore remained open after v0.2.

## Allocation v0.3

Version:

```text
source-discovery-allocation-v0.3
```

v0.3 added provider-window authority to allocation.

`listDiscoveryQueryMetrics()` retains per semantic query key:

```text
requested_limit
max_start
max_start_fetched_count
```

A measured query can be exploited only when:

```text
score >= 0.32
max_start_fetched_count >= requested_limit
next provider window remains within Naver's 1..1000 bound
```

A partial or empty highest page is treated as exhausted for immediate sequential acquisition. A productive full page advances to the next page instead of replaying the same page.

Selected requests record:

```text
discovery_allocation_version
discovery_allocation_mode = exploration | exploitation
discovery_page_start
```

## Third bounded empirical batch

Authoritative main:

```text
afd040378cbbf12474eb8e3b16fceb16a51552ef
```

GitHub Actions:

```text
run: 32797010101
job: 97656701961
status: PASS
```

Every selected request was a previously unmeasured query:

```text
allocation_mode = exploration
page_start = 1
```

There was no measured `start=1` replay.

Third-batch totals:

```text
requests: 12
fetched: 355
continued: 334
cheap rejected: 21
new Sources: 330
duplicates: 4
Candidates: 0
Reviews: 49
Admission Rejects: 285
```

Rates:

```text
new Source / fetched:      92.96%
duplicate / continued:      1.20%
```

This removed the material exact-page replay observed under v0.2:

```text
duplicate / continued
v0.2 batch: 97.87%
v0.3 batch:  1.20%
```

This comparison is evidence that the replay defect was removed. It is not a claim that one batch proves general semantic quality improvement.

## Protected authority readback

After the third batch:

```text
Source Signals:       1,299
Source Observations:  1,452
Discovery Runs:          36
Published Problems:       2
Public Evidence:          5
Source Incidents:         4
Blind membership:       120
```

Runner boundaries remained:

```text
Blind reads:          0
full source fetches:  0
publication writes:   0
```

## Close decision

Phase 15.8B close criterion was:

> a live batch must demonstrate that allocation no longer spends material budget on exact-page replay while preserving downstream authority boundaries.

The v0.3 batch satisfied that criterion.

Therefore:

```text
Phase 15.8B = CLOSED
```

## Subsequent boundary

The remaining telemetry issue is different from request-window allocation.

Run-level fields:

```text
admission_candidate_count
admission_review_count
admission_reject_count
```

classify all continued signals, including duplicates. They therefore cannot be treated as exact yield for newly acquired Source identities.

That semantic correction belongs to Phase 15.8C — New-Source Yield Telemetry. It does not reopen Phase 15.8B and does not change Source Admission thresholds.
