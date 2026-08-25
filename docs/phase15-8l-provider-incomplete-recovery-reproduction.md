# Phase 15.8L — Provider-Incomplete Recovery Reproduction

## Status

**IMPLEMENTED — pending CI/PIE and bounded live reproduction**

## Purpose

Phase 15.8K measured the full-context yield of the exact new Review supply created by Phase 15.8J.

The bounded 48-record live sample produced:

```text
Candidate: 7
Reject: 28
unresolved Review: 13
resolved: 35
unresolved: 13
conservative Review → Candidate: 7 / 48 = 14.58%
resolved-only Review → Candidate: 7 / 35 = 20.00%
```

The unresolved aggregate reason counts were:

```text
source_full_context_provider_incomplete: 10
source_full_context_invalid_evidence_quote: 1
full_context_url_invalid: 2
```

The dominant remaining technical failure class is therefore provider-incomplete structured output.

15.8L measures whether the existing bounded semantic recovery mechanism can reduce that failure class on the same 15.8K unresolved cohort without activating quote recovery, changing Source Admission semantics, or mutating any production data.

## Baseline authority

Baseline live run:

```text
Phase: 15.8K
GitHub Actions run: 32813922410
artifact: 9550886238
baseline sample size: 48
sample fingerprint: 9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

15.8K intentionally did not persist an identity-bearing mapping from each unresolved record to its reason code.

The aggregate log does, however, expose the deterministic sample ordinals that remained unresolved:

```text
5, 8, 10, 15, 17, 19, 20, 26, 28, 29, 41, 44, 45
```

15.8L therefore reconstructs the same 48-record sample and selects exactly these 13 ordinals. It does **not** claim to know which ten identities originally corresponded to provider-incomplete.

This prevents a post-hoc identity inference from being promoted into repository authority.

## Frozen reconstruction authority

The runner reuses the exact Phase 15.8J cohort authority:

```text
completed_at from: 2026-08-25T05:15:33.082Z
completed_at to:   2026-08-25T05:16:33.738Z
exact runs: 24
exact new Sources: 985
exact new Reviews: 130
run fingerprint: df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df
```

It then reconstructs the exact Phase 15.8K deterministic sample:

```text
sample size: 48
sample fingerprint: 9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6
```

Any drift in run count, exact-new count, Review count, run fingerprint, sample size, or sample fingerprint fails closed before paid provider work begins.

## Recovery scope

Recovery-eligible reason codes for 15.8L:

```text
source_full_context_provider_incomplete
```

Only this code may trigger a second semantic-provider attempt.

Explicitly excluded from 15.8L retry authority:

```text
source_full_context_invalid_evidence_quote
full_context_url_invalid
provider network errors
semantic uncertainty
all other reason codes
```

The generic 15.8G recovery implementation remains backward compatible: when no narrowed scope is supplied, its historical two-code recovery behavior is unchanged.

15.8L passes the provider-only scope explicitly.

## Attempt semantics

For each of the 13 reconstructed targets:

```text
public full-context fetch
→ fresh base semantic attempt
→ if base attempt resolves: stop
→ if base attempt fails with provider_incomplete: one bounded recovery attempt
→ otherwise: stop unresolved without retry
```

Provider-incomplete recovery retains the existing 15.8G behavior:

```text
maximum semantic attempts per target: 2
recovery max_output_tokens: 1600
structured schema: unchanged
store: false
semantic decision mapping: unchanged
```

15.8L does not activate quote-specific retry instructions.

A runtime assertion requires:

```text
quote_recovery_attempted = 0
```

## Interpretation boundary

The 13 targets were unresolved in the previous 15.8K live run, but semantic-provider behavior is not assumed deterministic across runs.

Therefore 15.8L distinguishes:

- `fresh_first_attempt_resolved`: previously unresolved target now resolves on the fresh base attempt;
- `provider_recovery_attempted`: fresh base attempt reproduced provider-incomplete and triggered the one retry;
- `provider_recovered_after_retry`: the retry produced a valid semantic result;
- `provider_recovery_exhausted`: provider-incomplete retry was attempted but still failed;
- final unresolved count.

A target resolving on the fresh first attempt is evidence of provider instability/reproducibility behavior, not evidence that the retry mechanism caused the resolution.

## Cost boundary

The live reproduction is bounded to:

```text
public full-context fetches: <= 13
paid semantic-provider calls: <= 26
```

The second-call ceiling is reachable only if every target reproduces provider-incomplete.

No broad replay of the 48-record sample or 130-record Review cohort is authorized.

## Mutation and privacy boundary

15.8L is read-only.

Before and after execution, the runner snapshots:

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

Additional invariants:

```text
DB writes: 0
Blind reads: 0
full source bodies persisted: 0
Formation authority granted: false
Incident mutations: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
provider recovery product activation: false
```

The runner emits aggregate diagnostics and baseline ordinals only. It does not emit Source Signal ids, canonical URLs, author handles, full source bodies, provider payloads, or provider request ids as repository authority.

## Workflow

One-shot workflow:

```text
.github/workflows/source-provider-recovery-15-8l.yml
```

During execution preparation it supports a temporary exact push branch:

```text
ops/source-provider-recovery-15-8l
```

The workflow always checks out authoritative `main` before any Supabase read or paid semantic-provider call.

The temporary push trigger must be removed during closeout.

## Close criterion

15.8L may close after all of the following are true:

1. implementation CI is green;
2. PIE prospective shadow is green;
3. the exact 15.8K sample and 13 unresolved ordinals reconstruct successfully;
4. bounded live reproduction completes;
5. `quote_recovery_attempted = 0`;
6. DB and Blind boundaries remain unchanged;
7. aggregate results clearly separate fresh first-attempt resolution from retry-caused recovery;
8. the temporary ops trigger is removed;
9. closeout is merged to `main`.

## Decision boundary

15.8L is a reliability reproduction only.

It does **not** authorize automatic product activation of semantic recovery.

Possible later decisions are:

```text
provider-incomplete materially reproduces + retry recovers reliably
→ consider a separately governed product-activation phase for provider-incomplete only

provider-incomplete rarely reproduces because fresh base attempts resolve
→ treat the dominant issue as transient provider instability; quantify whether retry is operationally justified before activation

retry frequently exhausts
→ do not activate; inspect provider/schema/token behavior
```

Quote-isolation recovery remains a separate authority and is not inferred from 15.8L.