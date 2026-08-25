# Phase 15.8M-B — Exact New-Review Remainder Resolution

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.8M-B resolved the deterministic unsampled remainder of the exact Phase 15.8J new-Review cohort and durably persisted the resulting Source Admission outcomes under the authority introduced by Phase 15.8M-A.

```text
15.8J exact-new Reviews = 130
15.8K calibration sample = 48
15.8M-B exact remainder  = 82
```

No Formation, Incident, canonical Problem, or publication authority is granted by this phase.

## Implementation authority

Implementation PR:

```text
PR #97
exact head:
c8d67f2998a6a413e867339558acd37834894090

PR CI #380: SUCCESS
PIE #65: SUCCESS
```

Implementation merged to authoritative main as:

```text
37ce24b8c4742abd8d425798f848648e3f41fa89
```

Merged-main CI:

```text
CI #381: SUCCESS
```

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

The Phase 15.8K deterministic calibration sample reconstructs to:

```text
sample size: 48
sample fingerprint:
9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

The remainder proof is:

```text
sample ∩ remainder = 0
sample ∪ remainder = exact Review 130
remainder unique Source count = 82
```

Authoritative live remainder fingerprint:

```text
6dc5ecd06e8ba78258ee5e89e28d415992430d1cdf687e9397c34d4e9ee89fcc
```

Individual Source identities were not emitted to workflow logs or artifacts.

## Batch authority

Durable batch version:

```text
phase15.8m-b-remainder-v0.1
```

Preflight required zero existing rows under that batch version before paid execution. Independent preflight confirmed:

```text
batch rows before = 0
outcome table rows before = 0
```

The batch version is now authoritative and must not be reused for another evaluation run.

## Resolution method

Each of the exact 82 remainder Sources was evaluated with the current full-context semantic resolver plus the Phase 15.8L bounded recovery helper.

Recovery eligibility was narrowed to exactly:

```text
source_full_context_provider_incomplete
```

Therefore:

```text
base semantic attempt: max 1
provider-incomplete retry: max 1
semantic attempts per Source: max 2
```

The following did not trigger retry:

```text
source_full_context_invalid_evidence_quote
URL invalid/unavailable
fetch failure
other semantic/provider errors
```

Observed quote recovery attempts:

```text
0
```

## Live execution

Authoritative live workflow:

```text
run: 32820158024
workflow: Source New-Supply Remainder 15.8M-B
head SHA: 37ce24b8c4742abd8d425798f848648e3f41fa89
conclusion: SUCCESS
```

Aggregate artifact:

```text
artifact id: 9553271643
name: source-new-supply-remainder-15-8m-b
digest:
sha256:b9c07d4d7c7c982e2c81899e3ecf94c9ec76e67a3b01cd880cf46d4c14b64e2b
```

The workflow completed all 82 evaluations before performing the one durable batch write.

## Live outcome

```text
total:      82
Candidate:   8
Reject:     66
Review:      8
resolved:   74
unresolved:  8
```

Promotion rates:

```text
conservative: 8 / 82 = 9.7561%
resolved-only: 8 / 74 = 10.8108%
```

Outcome by family:

```text
damage: 61 total / 5 Candidate / 50 Reject / 6 Review
delay:  15 total / 2 Candidate / 12 Reject / 1 Review
error:    6 total / 1 Candidate /  4 Reject / 1 Review
```

Outcome by allocation mode:

```text
exploitation: 54 total / 5 Candidate / 43 Reject / 6 Review
exploration:  28 total / 3 Candidate / 23 Reject / 2 Review
```

Outcome by domain:

```text
account:      5 / 0 Candidate /  4 Reject / 1 Review
billing:      3 / 1 Candidate /  1 Reject / 1 Review
commerce:    27 / 3 Candidate / 23 Reject / 1 Review
housing:     11 / 0 Candidate /  9 Reject / 2 Review
lodging:     17 / 3 Candidate / 11 Reject / 3 Review
mobility:     2 / 1 Candidate /  1 Reject / 0 Review
refund:       4 / 0 Candidate /  4 Reject / 0 Review
repair:       1 / 0 Candidate /  1 Reject / 0 Review
reservation: 11 / 0 Candidate / 11 Reject / 0 Review
support:      1 / 0 Candidate /  1 Reject / 0 Review
```

## Reason distribution

Independent DB readback reproduced the live artifact exactly:

```text
full_context_first_hand_external_friction     8
full_context_informational_content           55
full_context_nonorganic_or_borrowed           5
full_context_not_first_hand                   6
full_context_url_invalid                      1
source_full_context_invalid_evidence_quote    5
source_full_context_provider_missing_output   1
source_full_context_provider_network_error    1
```

## Provider recovery result

```text
provider recovery attempted: 18
recovered after retry:       16
recovery exhausted:           2
quote recovery attempted:     0
```

Conditional recovery rate for attempted provider recovery:

```text
16 / 18 = 88.8889%
```

This is an observed Phase 15.8M-B operational result. It does not activate recovery as an independent product authority beyond the bounded runner contract used by this phase.

## Ephemeral full-body boundary

Fetched full source bodies existed only inside each current evaluation call.

The runner did not keep `{ record, result }` evaluation objects across the batch. Immediately after each Source resolved, it built the M-A safe durable row and retained only that row in memory.

Forbidden durable fields remained outside the outcome schema, including:

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

Observed durable full-source-body writes:

```text
0
```

## Atomic persistence result

The live run demonstrated the intended zero-or-82 behavior.

During the live evaluation loop, independent DB checks repeatedly observed:

```text
M-B batch rows = 0
outcome rows total = 0
```

Only after all 82 safe rows were built and validated did the runner perform the final multi-row INSERT.

Workflow result:

```text
database write statements: 1
outcome rows inserted: 82
```

Independent DB poststate:

```text
batch rows: 82
distinct source_signal_id: 82
Candidate: 8
Reject: 66
Review: 8
resolved: 74
unresolved: 8
recovery attempted: 18
recovery recovered: 16
recovery exhausted: 2
```

No accepted partial authoritative state occurred.

## Protected mutation boundaries

Before live execution:

```text
ar_source_signals                         3245
ar_source_signal_observations             3537
ar_source_ingestion_runs                   132
ar_raw_inputs                               10
ar_pain_evidences                           27
ar_public_problems                           2
ar_public_problem_evidence_snapshots         5
ar_source_incidents                          4
ar_source_full_context_resolution_outcomes   0
```

Independent post-live DB readback:

```text
ar_source_signals                         3245
ar_source_signal_observations             3537
ar_source_ingestion_runs                   132
ar_raw_inputs                               10
ar_pain_evidences                           27
ar_public_problems                           2
ar_public_problem_evidence_snapshots         5
ar_source_incidents                          4
ar_source_full_context_resolution_outcomes  82
```

Therefore the only intended durable mutation was:

```text
ar_source_full_context_resolution_outcomes
0 → 82
```

The workflow reported:

```text
explicit Blind evaluation reads: 0
incident mutations: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
```

Migration 034's DB trigger remains the defense-in-depth write guard against accidental Blind membership.

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

The 8 durable Candidate outcomes are therefore inputs available to a future separately governed phase, not automatically formed or published Problems.

## Trigger closeout

The autonomous live push trigger used only for the authoritative run was:

```text
agent/phase15-8m-b-live-execution
```

The closeout changeset removes that push trigger from the workflow. After closeout, the workflow retains `workflow_dispatch` only and continues to check out authoritative `main`.

No second M-B live execution is authorized under `phase15.8m-b-remainder-v0.1`.

## Closeout condition

Phase 15.8M-B is ready to close when this closeout changeset passes exact-head CI/PIE, merges to main, and merged-main CI succeeds.

After that point:

```text
Phase 15.8M-B = CLOSED
Formation = NOT AUTHORIZED
Publication = NOT AUTHORIZED
```

The next governed decision must be based on the durable M-B outcome distribution rather than automatically promoting the 8 Candidate outcomes into Formation.
