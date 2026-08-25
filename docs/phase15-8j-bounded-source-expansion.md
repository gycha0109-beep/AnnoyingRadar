# Phase 15.8J — Bounded Source Supply Expansion

## Status

**IMPLEMENTED — pending CI/PIE and live 24-request acquisition**

## Purpose

Phase 15.8I closed the Review-promotion calibration question without changing active allocation:

```text
source-discovery-allocation-v0.4
base exploitation eligible: 7
combined-shadow eligible: 7
threshold crossings: 0
```

Further calibration does not currently change source-selection behavior. The active bottleneck returns to Source supply breadth.

Phase 15.8J therefore executes one bounded acquisition batch with the existing active allocation instead of loosening Source Admission or Formation.

## Batch authority

```text
requests: 24
results per request: up to 50
maximum provider opportunities: 1,200
provider: Naver Blog search
allocation: source-discovery-allocation-v0.4
query plan: existing 192-query plan
```

The existing `selectDiscoveryRequestBudget(...)` uses current historical metrics and pagination state. 15.8J does not hardcode query identities or override allocation scoring.

## Why acquisition now

Existing exact telemetry before this phase:

```text
exact discovery runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

The 72-item disjoint full-context evidence estimates Review → Candidate promotion at:

```text
11 / 72 = 15.28% conservative
```

That supports the principle that Review supply has downstream value, but the current product bottleneck is not a lack of another calibration formula. It is the quantity and diversity of new source incidents entering later gates.

## Mutation authority

This is an acquisition phase, so Source supply mutation is expected.

Allowed mutable resources:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

The existing discovery runner also records exact new-source Admission telemetry on completed discovery runs.

Forbidden downstream mutation:

```text
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_source_incidents
```

The runner snapshots those downstream tables before acquisition and asserts exact equality after the batch.

## Classification boundary

Pipeline remains:

```text
Naver search result
→ normalization
→ cheap high-recall discovery prefilter
→ persist continued Source only
→ existing deterministic Source Admission telemetry
```

There is no full-context fetch and no semantic-provider call in this phase.

```text
OpenAI calls: 0
Blind reads: 0
full source-body fetches: 0
publication mutations: 0
```

Admission and Formation thresholds are unchanged.

## Execution workflow

One-shot workflow:

```text
.github/workflows/source-discovery-expansion-15-8j.yml
```

It supports manual dispatch and one exact temporary branch trigger:

```text
ops/source-discovery-expansion-15-8j
```

The workflow always checks out authoritative `main` before executing the live runner.

The historical `.github/workflows/source-discovery-pilot.yml` remains manual-only and unchanged.

## Live readback

The authoritative live result must report at minimum:

- selected request count;
- allocation mode and page start per executed query;
- fetched / normalized counts;
- cheap reject / continue counts;
- new Source count;
- duplicate count;
- exact new-source Candidate / Review / Reject counts;
- provider failure count;
- downstream boundary before/after equality.

After the workflow, independent DB readback should confirm:

- Source Signals / Observations / Runs changed only as explained by the acquisition result;
- Published Problems remain 2;
- Public Evidence remains 5;
- Source Incidents remain 4;
- Blind membership remains 120 = 60 representative + 60 challenge.

## Closeout rule

This phase does not authorize formation or publication from the new supply.

After empirical acquisition:

1. remove the temporary push trigger;
2. preserve the historical manual-only pilot contract;
3. record exact source-supply deltas and query-family distribution;
4. decide the next phase from the measured new Review / new Candidate / duplicate profile.

If acquisition produces meaningful new Review supply, the next useful work is downstream full-context / formation-yield measurement, not lowering admission thresholds.
