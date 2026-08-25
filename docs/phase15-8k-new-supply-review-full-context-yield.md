# Phase 15.8K — New-Supply Review Full-Context Yield

## Status

**IMPLEMENTED — pending CI/PIE and bounded live full-context sample**

## Purpose

Phase 15.8J expanded Source supply using active discovery allocation `source-discovery-allocation-v0.4`:

```text
24 requests
1,157 fetched
985 new Sources
3 new Candidate
130 new Review
852 new Reject
```

The next information bottleneck is whether the newly acquired deterministic Review supply promotes to Candidate when the existing semantic Source Admission authority sees full public post context.

15.8K measures only this new cohort. It does not reuse or relabel the historical Phase 15.8D/15.8F calibration samples.

## Frozen 15.8J cohort authority

The runner reconstructs exactly the completed 15.8J batch from ingestion-run telemetry:

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

Run identity is additionally frozen by a SHA-256 fingerprint over the sorted run ids:

```text
df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df
```

The identity list itself is not committed.

The runner fails closed if any frozen telemetry or run fingerprint drifts.

## Exact-new reconstruction

For the 24 frozen runs:

```text
run observations
+ Source first_seen_at inside that run's started_at/completed_at window
→ exact newly inserted Source records
```

Expected exact-new reconstruction:

```text
985 Source records
```

The existing deterministic Source Admission classifier is then reapplied to those exact-new records.

Expected Review queue:

```text
130 records
```

The live phase stops if either count fails to reconstruct exactly.

## Sampling authority

Sample version:

```text
new-supply-review-sample-v0.1
```

Default sample size:

```text
48
```

Selection is deterministic and stratified by:

```text
domain : family
```

Within each stratum, rows are ordered by a stable SHA-256 key derived from:

```text
sample version
+ stratum
+ query key
+ Source Signal id
```

Round-robin stratum selection prevents the largest single query or family from monopolizing the bounded sample.

The committed repository does not retain the selected Source Signal identity list. The runner emits only a sample fingerprint and aggregate distribution.

## Semantic authority

For each selected Review record:

```text
existing public full-context fetch
→ existing resolveSourceAdmissionWithFullContext(...)
→ existing deterministic final mapping
```

15.8K does **not** activate the 15.8G recovery lane or 15.8H quote-isolation lane.

Therefore:

```text
active semantic policy: unchanged
technical recovery activation: none
quote validator: unchanged
Source Admission thresholds: unchanged
```

This isolates new-supply quality from later reliability experiments.

## Live metrics

The live run reports aggregate-only:

- Candidate / Reject / unresolved Review;
- resolved and unresolved counts;
- conservative promotion rate = Candidate / all selected;
- resolved-only promotion rate = Candidate / resolved selected;
- outcomes by domain;
- outcomes by family;
- outcomes by 15.8J allocation mode (`exploration` / `exploitation`);
- semantic reason-code distribution;
- full-context fetch-status distribution;
- sample fingerprint and stratum distribution.

No individual Source identity, canonical URL, author handle, full body, semantic payload, or provider request id is emitted as authority.

## Mutation boundary

15.8K is read-only.

Before and after the live sample, the runner snapshots:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_source_incidents
```

Exact equality is required.

Additional declared boundaries:

```text
DB writes: 0
Blind reads: 0
full source bodies persisted: 0
Formation authority granted: false
Incident mutations: 0
publication mutations: 0
active allocation mutations: 0
recovery lane activated: false
```

Full source context may be fetched ephemerally and sent to the configured semantic provider for the bounded selected sample only.

## Cost boundary

Default bounded maximum:

```text
public full-context fetches: <= 48
paid semantic-provider calls: <= 48 base attempts
```

No broad 130-record semantic sweep is authorized by this phase.

## Workflow

One-shot workflow:

```text
.github/workflows/source-new-supply-review-15-8k.yml
```

It supports manual dispatch plus one temporary execution branch:

```text
ops/source-new-supply-review-15-8k
```

The workflow always checks out authoritative `main` before reading Supabase or invoking the provider.

The temporary push trigger must be removed during closeout.

## Decision boundary

15.8K does not itself authorize Formation or publication.

The live result should decide among later options:

```text
high/credible promotion yield
→ consider broader governed full-context resolution of remaining new Reviews
→ then separately evaluate Formation eligibility

low promotion yield
→ improve query/source supply strategy rather than loosening Admission

material unresolved technical rate
→ reliability lane remains separate from semantic-policy changes
```

A Candidate result in this sample is an Admission outcome only. It is not automatically an independent incident, repeated mechanism, canonical Problem, or publishable Problem.
