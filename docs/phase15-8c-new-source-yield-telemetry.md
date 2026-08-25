# Phase 15.8C — New-Source Yield Telemetry

## Status

**IMPLEMENTED — pending CI/PIE, migration 033 live application, and bounded empirical validation**

## Why this phase exists

Phase 15.8B removed material exact-page replay, but the second batch exposed a telemetry semantics problem.

Existing run-level fields:

```text
admission_candidate_count
admission_review_count
admission_reject_count
```

classify every Source Signal that survives Discovery Prefilter in that run. This includes identities that already existed in `ar_source_signals`.

Therefore:

```text
run-level Candidate/Review/Reject
!= newly acquired Candidate/Review/Reject
```

A duplicate replay can legitimately classify as Candidate or Review again, but it must not be credited as new acquisition yield.

Phase 15.8C separates those meanings without deleting historical telemetry.

## Authority

This phase changes acquisition telemetry and allocation scoring only.

It does not change:

- Discovery Prefilter decisions;
- Source Admission policy or thresholds;
- full-context Formation;
- Incident identity;
- Gold calibration membership;
- Blind-120 membership;
- Public Problem formation;
- Public Problem publication authority.

## Exact new-source identity

`persistSourceSignals()` already resolves existing Source identities before upsert.

Phase 15.8C defines:

```text
newSignals
= unique continued signals
- identities already present in ar_source_signals before this run
```

Only `newSignals` feed exact new-source Admission yield telemetry.

The historical run-level Admission summary remains preserved for continuity and debugging.

## Telemetry version

```text
new-source-admission-yield-v0.1
```

Service constant:

```text
NEW_SOURCE_ADMISSION_TELEMETRY_VERSION
```

## Migration 033

Migration:

```text
033_new_source_admission_yield_telemetry.sql
```

Adds nullable fields to `ar_source_ingestion_runs`:

```text
new_admission_telemetry_version
new_admission_candidate_count
new_admission_review_count
new_admission_reject_count
```

Historical rows remain null and are not retroactively reinterpreted as exact telemetry.

For a versioned exact row, the database requires:

```text
new Candidate
+ new Review
+ new Reject
= inserted_count
```

This prevents partial or internally inconsistent exact-yield telemetry.

No public view or anonymous grant is added.

## Allocation v0.4

Version:

```text
source-discovery-allocation-v0.4
```

The query scorer follows this precedence:

```text
exact new-source telemetry exists
→ score from exact new-source admission outcomes

otherwise
→ retain legacy run-level scoring for historical compatibility
```

The exact admission denominator is:

```text
new_telemetry_inserted_count
```

not all continued signals.

A versioned exact window with:

```text
inserted_count = 0
```

receives score `0`.

This is deliberate. A provider page containing only already-known identities has no immediate acquisition value even if those duplicates classify as useful under the historical run-level summary.

## Query metric aggregation

`listDiscoveryQueryMetrics()` retains both scopes:

### Historical scope

```text
completed_runs
fetched_count
inserted_count
duplicate_count
discovery_continue_count
discovery_reject_count
admission_candidate_count
admission_review_count
admission_reject_count
```

### Exact new-source scope

```text
new_telemetry_runs
new_telemetry_fetched_count
new_telemetry_continue_count
new_telemetry_discovery_reject_count
new_telemetry_inserted_count
new_telemetry_duplicate_count
new_admission_candidate_count
new_admission_review_count
new_admission_reject_count
```

The scorer exposes which scope it used through:

```text
telemetry_scope = new_source_exact | legacy_run_level | unmeasured
```

## Runner diagnostics

The bounded discovery runner now reports both:

```text
historical run-level Candidate/Review/Reject
```

and:

```text
new_admission_candidate_count
new_admission_review_count
new_admission_reject_count
```

It also emits selected query allocation mode and page start so acquisition yield can be interpreted together with pagination behavior.

## Empirical validation gate

After CI/PIE and merge:

1. apply migration 033 live before executing code that writes exact telemetry;
2. run one bounded 12-request discovery batch from authoritative `main`;
3. verify every completed versioned run satisfies exact-count integrity;
4. report new-only Candidate/Review/Reject separately from historical run-level counts;
5. verify allocation scorer subsequently sees `new_source_exact` for those query keys;
6. verify downstream authority remains unchanged.

Required boundary readback:

```text
Published Problems = 2
Public Evidence = 5
Source Incidents = 4
Blind membership = 120
full source-body fetches = 0
publication mutations = 0
```

## Close criterion

Phase 15.8C may close when a live bounded batch proves that:

```text
new Candidate + new Review + new Reject = new inserted Sources
```

for all exact-telemetry runs, and adaptive scoring consumes this exact scope without changing any Source Admission or publication authority.
