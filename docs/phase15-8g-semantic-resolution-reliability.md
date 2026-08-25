# Phase 15.8G — Semantic Resolution Reliability

## Status

**IMPLEMENTED — pending CI/PIE and bounded live recovery pilot**

## Purpose

Phase 15.8F completed a disjoint 48-item exact-new Review holdout.

The full public source context fetch succeeded for all 48 items, but eight semantic resolutions remained unresolved:

```text
source_full_context_provider_incomplete:      5
source_full_context_invalid_evidence_quote:   3
```

This isolates the current reliability problem to the semantic-provider / structured-output boundary rather than source acquisition or full-context fetch.

Phase 15.8G tests a bounded recovery lane for exactly these two empirically observed technical failures.

It does not change Source Admission semantics, Formation semantics, incident identity, publication authority, or active discovery allocation.

## Empirical authority

Baseline Phase 15.8F live run:

```text
workflow run: 32807308702
holdout size: 48
holdout fingerprint: 30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7
unresolved: 8
```

The eight unresolved records occurred at the following identity-free 1-based holdout ordinals:

```text
7, 10, 12, 13, 17, 24, 28, 44
```

The repository does not persist a list of their Source Signal ids or canonical URLs.

The pilot reconstructs the same frozen 48-item holdout and then selects those eight ordinals only after the holdout fingerprint matches exactly.

## Recovery authority

Recovery version:

```text
source-full-context-recovery-v0.1
```

Base semantic resolution authority remains:

```text
source-full-context-resolution-v0.1
```

The recovery lane delegates final semantic mapping to the existing:

```text
resolveFullContextSemantic(...)
```

No new Candidate / Reject rule is introduced.

## Exact retry allowlist

Only the two failures observed in Phase 15.8F may trigger recovery:

```text
source_full_context_provider_incomplete
source_full_context_invalid_evidence_quote
```

No generic retry policy is introduced.

For example, this phase does not automatically retry:

- provider network errors;
- timeouts;
- HTTP rejection;
- missing configuration;
- semantic uncertainty;
- full-context fetch failure.

Those remain governed by their existing fail-safe behavior.

## Attempt budget

Maximum semantic attempts per source:

```text
attempt 1: existing semantic judge
attempt 2: one bounded recovery attempt
maximum:   2 total attempts
```

There is no third attempt.

If recovery fails, the record remains:

```text
decision = review
resolved = false
```

## Full-context fetch boundary

The public source context is fetched once.

Recovery retries only the semantic provider request against that same ephemeral fetched context.

```text
source fetch max per target: 1
semantic calls max per target: 2
```

For the eight-record pilot:

```text
public full-context fetches max: 8
external semantic calls max:    16
```

No source body is persisted by the recovery lane.

## Provider-incomplete recovery

The base semantic request uses a bounded structured response.

For an incomplete provider result, the recovery attempt:

1. preserves the same model selection;
2. preserves `store: false`;
3. preserves the same strict JSON schema;
4. preserves the same semantic fields and final decision mapper;
5. increases the output-token ceiling from 800 to 1600;
6. adds a concise instruction to return only the required structured fields.

This is a reliability adjustment, not a semantic-policy adjustment.

## Invalid evidence quote recovery

The existing base validator requires `evidence_quote` to be an exact contiguous substring of the fetched post.

The recovery lane does **not** locally rewrite, fuzzy-match, trim into a match, or otherwise repair an invalid quote.

Instead, the one retry adds a stricter instruction:

```text
evidence_quote must be copied character-for-character
as one contiguous substring from <source_full_post>,
or be null.
```

The existing exact validator then runs again unchanged.

This preserves the provenance boundary.

## Separate recovery lane

Phase 15.8G does not wire the recovery behavior into the active resolver yet.

New lane:

```text
resolveSourceAdmissionWithFullContextRecovery(...)
```

Existing active/base lane remains:

```text
resolveSourceAdmissionWithFullContext(...)
```

The live pilot explicitly invokes the recovery lane only for evaluation.

Production activation requires a separate later phase.

## Pilot reconstruction

The pilot reuses the frozen Phase 15.8D / 15.8F authority window:

```text
completed_at <= 2026-08-25T02:29:36.982Z
exact runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

It reconstructs:

```text
166 Review queue
→ historical deterministic 24 exclusion
→ same deterministic 48 holdout
→ verify holdout fingerprint
→ select baseline unresolved ordinals only
```

The run fails closed on any reconstruction or fingerprint drift.

## Output policy

The live pilot emits aggregate diagnostics only.

It does not emit:

- Source Signal ids;
- canonical URLs;
- author handles;
- full source bodies;
- individual semantic payloads;
- provider request ids.

It reports:

```text
resolved / unresolved after re-run
Candidate / Reject / Review outcomes
unresolved reduction from baseline eight
recovery attempts
successful retry recoveries
exhausted recoveries
aggregate trigger reason codes
aggregate terminal reason codes
aggregate decision reason codes
outcomes by domain and family
before / after DB boundary counts
```

## Attribution rule

A target may resolve on its fresh first attempt even though it was unresolved in the previous Phase 15.8F run.

That counts toward observed unresolved reduction, but it must **not** be reported as a successful retry recovery unless the second recovery attempt was actually invoked and succeeded.

Therefore the pilot reports separately:

```text
unresolved_reduction
recovery_attempted
recovered_after_retry
recovery_exhausted
```

This prevents stochastic provider variation from being falsely attributed to the retry mechanism.

## Mutation boundary

Expected:

```text
DB writes: 0
Blind reads: 0
full source bodies persisted: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
```

The runner snapshots relevant DB counts before and after and fails if they differ.

## Activation boundary

A successful pilot does not automatically activate the recovery lane.

Phase 15.8G can close after:

1. CI and PIE verification;
2. bounded live eight-target recovery pilot;
3. aggregate recovery readback;
4. DB / Blind / publication boundary verification;
5. temporary ops push trigger removal.

Only a later explicit phase may decide whether to integrate the recovery lane into active full-context resolution.
