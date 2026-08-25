# Phase 15.8H — Admission Quote Isolation

## Status

**CLOSED — SAFE / INCONCLUSIVE / NOT ACTIVATED**

Implementation and contract verification are complete, and the bounded two-target live pilot completed successfully as an execution. However, the live run did **not** exercise the quote-isolation retry. Therefore Phase 15.8H does not establish empirical recovery effectiveness and does not activate quote isolation in the base resolver.

## Closeout authority

Implementation PR:

```text
PR #84
merged main: 6d765dd51ba82335db0d70a7649a558422b76582
```

Pre-merge verification:

```text
CI #354   SUCCESS
PIE #52   SUCCESS
unit      SUCCESS
release   SUCCESS
build     SUCCESS
runtime   SUCCESS
```

Bounded live pilot:

```text
run: 32809838923
main: 6d765dd51ba82335db0d70a7649a558422b76582
target holdout ordinals: 10, 17
```

Aggregate result:

```text
candidate: 0
reject: 2
review: 0
resolved: 2
unresolved: 0
baseline unresolved: 2
unresolved reduction: 2

fresh first-attempt resolved: 2
quote-isolation attempted: 0
quote-isolation recovered: 0
quote-isolation exhausted: 0
resolved with null Admission quote: 0
formation quote authority granted: 0

decision reasons:
  full_context_informational_content: 2
```

## Interpretation

Phase 15.8G ended with two live cases whose terminal technical failure was:

```text
source_full_context_invalid_evidence_quote
```

Phase 15.8H reconstructed those exact frozen holdout identities and reran them. On this later live run, both model calls produced complete semantic outputs that the existing Admission mapper rejected as informational content on the **first** attempt.

Therefore:

```text
The two previous invalid-quote failures were not reproduced.
The quote-isolation retry path was not exercised.
No live quote-isolation recovery was observed.
```

The correct conclusion is not “quote isolation fixed both cases.” The observed conclusion is that the previous invalid-quote terminal state is provider-output-sensitive / non-deterministic under repeated live evaluation.

Phase 15.8H establishes that the isolated lane can be implemented without weakening Formation provenance, but it does **not** provide empirical evidence sufficient for active integration.

## Purpose

Phase 15.8H evaluated a narrow architectural response to Admission-only quote failures: do not repair or fuzzy-match an invalid Admission quote. Instead, on one quote-specific retry only, force the Admission semantic response to return:

```text
evidence_quote = null
```

while preserving all classification semantics.

## Why this is allowed at Admission

The existing Admission semantic schema already defines:

```text
evidence_quote: string | null
```

The final Admission mapper `resolveFullContextSemantic(...)` does not use `evidence_quote` to decide Candidate / Reject / Review. It uses:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
```

Therefore the quote is not Admission decision authority.

Phase 15.8H does not silently fuzzy-repair, normalize, infer, or substitute a quote. Its isolated retry asks the structured provider to emit a schema-valid null.

## Formation provenance remains separate

Problem Formation has a separate semantic authority and separate evidence-provenance requirements.

Formation independently requires an exact evidence quote from source context before formation eligibility and uses additional semantic fields such as:

```text
friction_responsibility
source_origin
```

The Admission full-context resolution runners do not invoke Formation and do not hand the Admission quote forward as Formation provenance authority.

Every Phase 15.8H result therefore carries:

```text
formation_quote_authority = not_granted
```

If a Source later reaches Formation, Formation must independently establish and validate its own exact quote under the existing Formation gate.

The live pilot confirmed:

```text
formation_quote_authority_granted = 0
formation_authority_mutations = 0
```

## Version and lane separation

Quote-isolation version:

```text
source-full-context-quote-isolation-v0.1
```

Base semantic resolver remains:

```text
source-full-context-resolution-v0.1
```

Evaluation lane:

```text
resolveSourceAdmissionWithFullContextQuoteIsolation(...)
```

The active/base resolver was not modified.

## Exact retry rule

Only this error can trigger quote isolation:

```text
source_full_context_invalid_evidence_quote
```

Maximum semantic attempts:

```text
attempt 1: existing semantic judge
attempt 2: quote-isolation retry
maximum:   2
```

Provider incomplete, timeout, network failure, rejected request, missing configuration, semantic uncertainty, and source-fetch failure do not gain a retry from Phase 15.8H.

## Quote-isolation request transform

The second request preserves:

- model;
- `store: false`;
- strict JSON-schema mode;
- required field list;
- all six Admission classification property schemas;
- base output-token budget;
- existing base parser and final decision mapper.

Only `evidence_quote` is narrowed from:

```text
string | null
```

to:

```text
type: null
```

The retry explicitly forbids inventing, paraphrasing, whitespace-normalizing, fuzzy matching, or locally repairing evidence text.

## Frozen live target authority

Phase 15.8G live run:

```text
run: 32808824853
baseline unresolved after recovery: 2
```

The two remaining cases were represented only by identity-free 1-based holdout ordinals:

```text
10, 17
```

Phase 15.8H reconstructed the same frozen authority:

```text
completed_at <= 2026-08-25T02:29:36.982Z
exact runs: 24
exact-new Sources: 961
exact-new Reviews: 166
holdout size: 48
holdout fingerprint: 30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7
```

The runner fails closed if that historical reconstruction or fingerprint drifts.

## Mutation and privacy boundary

Live run `32809838923` reported identical DB snapshots before and after:

```text
Source Signals:        2260 -> 2260
Source Observations:   2461 -> 2461
Source Ingestion Runs: 108  -> 108
Raw Inputs:            10   -> 10
Pain Evidences:        27   -> 27
Public Problems:       2    -> 2
Public Evidence:       5    -> 5
Source Incidents:      4    -> 4
```

Independent post-run DB readback confirmed:

```text
Published Problems: 2
Blind evaluation membership: 120
  representative: 60
  challenge: 60
```

Additional live invariants:

```text
DB writes: 0
Blind evaluation reads by pilot: 0
full source bodies persisted: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
Formation authority mutations: 0
individual source identities emitted: false
```

## Workflow closeout

The temporary automatic push trigger used only to start the bounded pilot has been removed.

The retained workflow:

```text
.github/workflows/source-quote-isolation-pilot.yml
```

is now `workflow_dispatch` only, checks out authoritative `main`, and retains `contents: read` permission.

There is no persistent push-triggered paid evaluation path after closeout.

## Activation decision

```text
ACTIVE BASE RESOLVER CHANGE: NO
QUOTE ISOLATION ACTIVATED:  NO
FORMATION GATE CHANGE:      NO
ADMISSION POLICY CHANGE:    NO
BLIND CHANGE:               NO
PUBLICATION CHANGE:         NO
```

The reason is evidence sufficiency, not a known safety defect. The isolated mechanism passed contract and boundary checks, but the live witness did not exercise it.

A future activation proposal requires new evidence that actually observes the recovery path, for example:

1. a reproducible live invalid-quote witness followed by a quote-null recovery; or
2. a separately governed deterministic provider-boundary evaluation that demonstrates the exact technical failure and recovery while preserving the same Admission semantics; and
3. unchanged Formation provenance and mutation boundaries.

Until then the Phase 15.8H lane remains evaluation-only and inactive.
