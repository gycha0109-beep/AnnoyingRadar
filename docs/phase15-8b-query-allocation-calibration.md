# Phase 15.8B — Query Allocation Calibration

## Status

IMPLEMENTED — pending CI/PIE and second bounded empirical batch

## Why this phase exists

Phase 15.8A closed with a real 12-request pilot:

```text
150 fetched
6 cheap rejected
144 continued
137 new Sources
1 Candidate
22 Reviews
121 Admission Rejects
```

The empirical issue is not insufficient Source volume. It is request-budget efficiency.

Two defects were observed in allocation v0.1:

1. a completed query with `fetched_count = 0` remained `exploration=true` and could be selected repeatedly;
2. the scorer rewarded novelty and Candidate yield but did not penalize downstream Source Admission Reject rate.

The result is that a query such as:

```text
수리 연락 안됨
50 fetched → 0 Candidate / 1 Review / 49 Reject
```

could still score as attractive because it produced 50 new Source rows.

## Authority

Phase 15.8B changes **request allocation only**.

It does not change:

- Discovery Prefilter decisions;
- Source Admission policy or thresholds;
- full-context Formation;
- Incident identity;
- Gold membership;
- Blind-120 membership;
- Public Problem creation/publication;
- public evidence semantics.

The allocation scorer is an API-budget mechanism, not an evidence classifier.

## Allocation version

```text
source-discovery-allocation-v0.2
```

The underlying query space remains:

```text
source-discovery-plan-v0.1
192 deterministic queries
```

New runs record the allocation version inside `request_metadata.discovery_allocation_version` without a schema migration.

## Scoring changes

### Measured empty queries

Old behavior:

```text
completed_runs >= 1
fetched_count = 0
→ exploration = true
```

New behavior:

```text
completed_runs >= 1
fetched_count = 0
→ exploration = false
→ score = 0
```

A measured empty query is evidence about provider yield and must not masquerade as unexplored space.

### Admission Reject penalty

Allocation v0.2 incorporates:

```text
Candidate rate
Review rate
new Source rate
result density
Admission Reject rate
duplicate rate
cheap-reject rate
```

Candidate yield remains the strongest positive semantic signal.

Review yield receives a smaller positive weight because Review is potentially useful but carries downstream resolution cost.

Admission Reject rate directly reduces allocation score.

### Low-score exploitation gate

```text
DISCOVERY_MIN_EXPLOITATION_SCORE = 0.32
```

Measured queries below this score are deferred behind unmeasured exploration.

They are not permanently banned; they are fallback budget only when higher-value exploitation and unmeasured exploration cannot fill the requested batch.

## Pilot-anchored expectations

The frozen first-pilot telemetry must produce these relative outcomes:

```text
refund__contact__1 > repair__contact__1
repair__contact__1 < exploitation threshold
billing__contact__1 = measured zero-result, not exploration
```

For a 12-request next batch:

- `환불 연락 안됨` remains eligible for exploitation;
- `수리 연락 안됨` is not replayed while unmeasured query space remains;
- zero-result contact queries are not replayed as exploration;
- at least five requests remain reserved for previously unmeasured query space.

## Second empirical gate

After CI/PIE and merge, execute another bounded 12-request pilot from authoritative `main`.

Report separately from the Phase 15.8A baseline:

```text
selected query keys
exploration vs exploitation composition
fetched
cheap rejected
continued
new Sources
duplicates
Candidates
Reviews
Rejects
per-query yield
```

Compare batch 2 with batch 1, but do not claim causal improvement from one batch alone.

Protected boundaries must remain:

```text
Published Problems = 2
Public Evidence = 5
Source Incidents = 4
Blind membership = 120
full source-body fetches = 0
publication mutations = 0
```

## Decision after batch 2

If allocation v0.2 avoids measured-empty and high-reject replay while maintaining or improving useful Candidate/Review yield per request, Phase 15.8B may close.

If it does not, calibration continues at the allocation layer. Source Admission and publication thresholds remain out of scope.
