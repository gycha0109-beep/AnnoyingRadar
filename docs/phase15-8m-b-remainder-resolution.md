# Phase 15.8M-B — Exact New-Review Remainder Resolution

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

This phase resolves only the deterministic unsampled remainder of the exact Phase 15.8J new-Review cohort.

```text
15.8J exact-new Reviews = 130
15.8K calibration sample = 48
15.8M-B remainder        = 82
```

No Formation or publication authority is granted by this phase.

## Frozen cohort authority

Phase 15.8M-B reconstructs Phase 15.8J fail-closed using:

```text
completed window:
2026-08-25T05:15:33.082Z .. 2026-08-25T05:16:33.738Z

exact completed runs: 24
run fingerprint:
df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df

fetched: 1,157
exact-new Sources: 985
duplicates: 91
exact-new Candidate: 3
exact-new Review: 130
exact-new Reject: 852
```

The Phase 15.8K deterministic 48-record sample must reconstruct to:

```text
sample fingerprint:
9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

The runner then proves:

```text
sample ∩ remainder = 0
sample ∪ remainder = exact Review 130
remainder unique Source count = 82
```

A new aggregate-only remainder fingerprint is emitted at runtime. Individual Source identities are never emitted to logs or artifacts.

## Batch authority

Durable batch version:

```text
phase15.8m-b-remainder-v0.1
```

Before any paid call, the runner requires the durable table to contain zero rows for this batch version.

A rerun under the same batch version is forbidden. If a future rerun is governed and required, it must use a new batch version rather than overwrite or append to this authority.

## Resolution method

Each of the exact 82 remainder Sources is evaluated with the current full-context v0.1 semantic resolver plus the Phase 15.8L bounded recovery helper.

Recovery eligibility is narrowed to exactly:

```text
source_full_context_provider_incomplete
```

Therefore:

```text
base semantic attempt: max 1
provider-incomplete retry: max 1
semantic attempts per Source: max 2
```

The following do not trigger retry in this phase:

```text
source_full_context_invalid_evidence_quote
URL invalid/unavailable
fetch failure
other semantic/provider errors
```

Quote recovery attempts must remain exactly zero.

## Cost bound

```text
public full-context fetches <= 82
paid semantic-provider attempts <= 164
```

The live runner requires explicit paid-call opt-in and provider configuration.

## Ephemeral full body boundary

Fetched full source bodies exist only inside the current evaluation call.

The runner does not keep `{ record, result }` evaluation objects in a results array.

Immediately after each Source resolves, it calls:

```text
buildSourceFullContextOutcomeRow(...)
```

and retains only the safe durable row in memory.

The durable row contains the SHA-256 and length/scope/truncation metadata for the judged full text but not the full body itself.

## Forbidden durable data

The batch persistence layer fails closed if any row contains fields such as:

```text
content_text
raw_text
canonical_url
fetched_url
author_handle
evidence_quote
provider_request_id
provider_payload
```

Only the schema already authorized by Phase 15.8M-A may be inserted.

## Atomic persistence rule

No outcome row is inserted during the 82-item evaluation loop.

Required sequence:

```text
resolve Source 1
→ build safe row in memory
...
resolve Source 82
→ build safe row in memory
→ verify 82 unique safe rows
→ verify protected DB domains unchanged
→ verify batch rows still 0
→ one bulk INSERT of all 82 rows
```

The application performs one Supabase/PostgREST multi-row INSERT request. PostgreSQL treats the request as one statement/transaction boundary for the batch: if a row violates unique/FK/check/Blind protection, the authoritative batch does not partially persist.

Expected durable poststate is therefore:

```text
0 rows before final insert
82 rows after successful final insert
```

Partial authoritative states such as 17, 43, or 81 rows are not an accepted successful run.

## Independent readback

After the bulk insert, the runner independently reloads the batch and verifies:

```text
batch rows = 82
distinct source_signal_id = 82
candidate + reject + review = 82
resolved = candidate + reject
unresolved = review
reason distribution = in-memory safe-row distribution
```

The workflow output remains aggregate-only.

## Protected mutation boundaries

The live runner snapshots these domains before resolution and verifies equality both before and after persistence:

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

The only intended durable mutation is:

```text
ar_source_full_context_resolution_outcomes
+82 rows for phase15.8m-b-remainder-v0.1
```

No explicit Blind evaluation read is performed by the runner. Migration 034's DB trigger remains the defense-in-depth write guard against accidental Blind membership.

## Authority boundaries

A durable `decision = candidate` means only:

```text
Source Admission Candidate under phase15.8m-b-remainder-v0.1
```

It does not establish:

```text
independent incident support
repeated mechanism support
Problem Formation authority
canonical Problem authority
publication authority
```

Those remain separate governed phases.

## Release flow

```text
implementation branch
→ deterministic contracts
→ exact-head CI / PIE
→ merge implementation to main
→ authoritative-main estimate/preflight
→ bounded live 82 execution
→ independent DB readback
→ closeout PR removes temporary live push trigger
→ merged-main CI / PIE
→ CLOSED
```

The temporary autonomous live trigger is restricted to:

```text
agent/phase15-8m-b-live-execution
```

and the workflow itself checks out authoritative `main`. The trigger must be removed during closeout.
