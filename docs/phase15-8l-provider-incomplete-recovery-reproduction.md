# Phase 15.8L — Provider-Incomplete Recovery Reproduction

## Status

**CLOSED**

Implementation PR #92 was merged to authoritative `main` before the live reproduction.

```text
implementation merge: 74456cc0737b9d10fa309d84537c42f614b1cc84
CI #370: SUCCESS
PIE #60: SUCCESS
live workflow run: 32815533647
artifact: 9551287039
```

The temporary `ops/source-provider-recovery-15-8l` push trigger was removed during closeout. The workflow remains manual-only.

## Purpose

Phase 15.8K measured the full-context yield of the exact new Review supply created by Phase 15.8J.

Its bounded 48-record sample ended with:

```text
Candidate: 7
Reject: 28
unresolved Review: 13
resolved: 35
unresolved: 13
```

Baseline unresolved aggregate reasons were:

```text
source_full_context_provider_incomplete: 10
source_full_context_invalid_evidence_quote: 1
full_context_url_invalid: 2
```

15.8L tested whether the existing bounded semantic recovery mechanism can reduce provider-incomplete failures without activating quote recovery, changing Source Admission semantics, or mutating production data.

## Baseline authority

Phase 15.8K live authority:

```text
run: 32813922410
artifact: 9550886238
sample size: 48
sample fingerprint: 9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

The deterministic sample ordinals that were unresolved in 15.8K were:

```text
5, 8, 10, 15, 17, 19, 20, 26, 28, 29, 41, 44, 45
```

15.8K intentionally did not persist an identity-bearing reason mapping. Therefore 15.8L did **not** claim which ten identities corresponded to the original provider-incomplete aggregate.

Instead it reconstructed all 13 unresolved ordinals and allowed a second semantic attempt only when the fresh first attempt itself returned `source_full_context_provider_incomplete`.

## Frozen reconstruction authority

The runner successfully reconstructed the exact 15.8J authority:

```text
completed_at from: 2026-08-25T05:15:33.082Z
completed_at to:   2026-08-25T05:16:33.738Z
exact runs: 24
exact new Sources: 985
exact new Reviews: 130
run fingerprint: df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df
```

It then reconstructed the exact 15.8K sample:

```text
sample size: 48
sample fingerprint: 9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

All fail-closed reconstruction checks passed before paid provider work began.

## Recovery authority

15.8L explicitly narrowed retry eligibility to:

```text
source_full_context_provider_incomplete
```

Excluded retry reasons included:

```text
source_full_context_invalid_evidence_quote
full_context_url_invalid
provider network errors
semantic uncertainty
all other codes
```

The historical 15.8G default behavior remains backward compatible when no narrowed reason scope is supplied.

15.8L changed no semantic decision thresholds and did not activate the recovery resolver in product behavior.

## Live result

The bounded live reproduction completed successfully on authoritative `main`.

### Final outcomes across the 13 baseline-unresolved targets

```text
Candidate: 1
Reject: 7
Review: 5
resolved: 8
unresolved: 5
unresolved reduction: 13 → 5 (-8)
```

### Attribution of the reduction

```text
fresh first-attempt resolved: 5
provider recovery attempted: 4
provider recovered after retry: 3
provider recovery exhausted: 1
quote recovery attempted: 0
```

Therefore the eight-record reduction must be split as:

```text
5 = fresh base-attempt resolution
3 = recovery-caused resolution after reproduced provider_incomplete
```

It would be incorrect to attribute all eight reductions to retry.

### Provider-incomplete reproducibility

The 15.8K baseline had ten aggregate provider-incomplete failures, but only four of the 13 replayed targets produced provider-incomplete again on the fresh 15.8L base attempt.

This demonstrates substantial run-to-run instability in this failure class.

The exact identity overlap with the original ten cannot be asserted because 15.8K intentionally did not persist identity→reason authority.

### Retry efficacy when provider-incomplete reproduced

Of the four fresh provider-incomplete events:

```text
retry recovered: 3
retry did not produce a valid final semantic resolution: 1
conditional recovery rate: 3 / 4 = 75%
```

The exhausted retry did not remain provider-incomplete; its terminal recovery reason was an invalid evidence quote. This means the second provider attempt completed far enough to move into quote validation but still did not produce an admissible final result.

### Final unresolved reasons

After 15.8L:

```text
full_context_url_invalid: 2
source_full_context_invalid_evidence_quote: 3
source_full_context_provider_incomplete: 0 final unresolved
```

Three invalid-quote terminal reasons were observed. No quote-specific retry was permitted.

This is an important separation:

```text
provider-incomplete retry behavior: tested
quote-isolation recovery behavior: not activated by 15.8L
```

## Interpretation

15.8L supports two conclusions simultaneously.

### 1. Provider incomplete is materially transient

Five previously unresolved targets resolved on the fresh first attempt without any recovery. Only four fresh attempts reproduced provider-incomplete despite ten such aggregate failures in 15.8K.

Therefore raw provider-incomplete counts should not be interpreted as deterministic semantic-policy failures.

### 2. One bounded retry is useful when provider incomplete actually occurs

When provider-incomplete did reproduce, three of four retry attempts reached a valid final semantic decision.

This is evidence that a one-retry provider-only reliability path is technically useful, but 15.8L itself does **not** authorize product activation.

Any activation must remain separately governed because it changes runtime provider-call behavior and cost, even though it does not change Source Admission semantics.

## Family / allocation observations

Final outcomes over the 13 replay targets:

```text
family error:  6 total / 3 resolved / 3 unresolved
family delay:  2 total / 1 resolved / 1 unresolved
family damage: 5 total / 4 resolved / 1 unresolved
```

Allocation provenance:

```text
exploration:  10 total / 6 resolved / 4 unresolved
exploitation: 3 total / 2 resolved / 1 unresolved
```

These counts are diagnostic only. The sample is too small and conditioned on prior unresolved status, so they do not authorize query-allocation tuning.

## Cost boundary

Authorized maximum:

```text
public full-context fetches: <= 13
semantic-provider calls: <= 26
```

The run stayed inside this bounded authority. No broad 48-record or 130-record replay was performed.

## Mutation and privacy boundary

Live before/after snapshots were exactly equal:

```text
Source Signals: 3245 → 3245
Source Observations: 3537 → 3537
Source Ingestion Runs: 132 → 132
Raw Inputs: 10 → 10
Pain Evidences: 27 → 27
Public Problems: 2 → 2
Public Evidence: 5 → 5
Source Incidents: 4 → 4
```

Independent DB readback also confirmed:

```text
Published Problems: 2
Blind membership: 120
representative: 60
challenge: 60
```

Additional invariants remained:

```text
DB writes: 0
Blind reads by runner: 0
full source bodies persisted: 0
Formation authority granted: false
Incident mutations: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
provider recovery product activation: false
```

No Source Signal identity list, canonical URL, author handle, full source body, provider payload, or provider request id was promoted into repository authority.

## Close decision

Phase 15.8L is **CLOSED**.

The empirical result justifies evaluating a separately governed provider-incomplete-only product activation path, because:

```text
provider-incomplete is transient
AND
when it reproduces, one retry recovered 3/4 cases
AND
quote retry can remain disabled
```

However, activation is **not** implied by this closeout. Any next phase must explicitly define runtime call-site authority, one-retry cost bounds, observability, and fail-closed behavior.

Quote recovery remains a separate decision surface.