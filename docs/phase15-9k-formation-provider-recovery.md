# Phase 15.9K — Formation Provider-Incomplete Recovery Reproduction

## Status

**IMPLEMENTED — pending PR / CI / PIE / one-shot live reproduction**

Phase 15.9K follows closed Phase 15.9J.

Phase 15.9J left exactly two Sources with unchanged frozen context but unresolved Problem Formation semantics:

```text
ordinal 9  -> source_formation_provider_incomplete after 2 attempts
ordinal 16 -> source_formation_provider_incomplete after 2 attempts
```

Ordinal 4 is intentionally excluded because its current body hash drifted from the frozen H/I authority. Current-context revalidation for ordinal 4 is a separate governed problem.

Phase 15.9K asks only:

> Is the Formation provider-incomplete result reproducible, and is it recoverable with a bounded output-budget retry while preserving the same Formation prompt/policy and frozen source context?

It does not create Incident authority.

## 1. Closed baseline

Required main:

```text
Phase 15.9J final main = 6a7bfb80cfa9e0281d7daf473d6193e538599524
merged-main CI #484 = SUCCESS
full-context outcomes = 85
Phase 15.9I durable Candidate batch rows = 3
```

Target ordinals:

```text
9, 16
```

Both targets must still match their exact Phase 15.9H/I frozen context authority before any Formation provider request is made.

## 2. Blind / downstream boundary

Before canonical URL or body reads Phase 15.9K must prove:

```text
Blind overlap = 0
```

It also requires no existing target assignment in:

```text
ar_source_incident_links
ar_public_problem_evidence_snapshots
```

Only after these checks may URL/body fields be loaded.

## 3. Context-integrity gate

Each target is fetched twice using:

```text
SOURCE_FULL_CONTEXT_EXTERNAL_POLICY = bounded_public_html
```

The pair must be stable and match the frozen H/I authority on:

```text
status = resolved
truncated = false
content_scope = full_post
content SHA-256
original char count
body length
extraction scope
title SHA-256
```

A target that drifts receives no Formation model call and cannot contribute to provider-recovery conclusions.

## 4. Why Phase 15.9K exists

The existing Formation observer uses:

```text
max_output_tokens = 1200
```

Its built-in recovery retries `source_formation_provider_incomplete` once, but the second request uses the same output budget and essentially the same request.

Phase 15.9H established a narrower precedent for full-context semantic recovery: provider-incomplete may receive one bounded retry with a larger output budget and a concise recovery instruction, without changing deterministic policy.

Phase 15.9K applies the same diagnostic principle to Formation only.

## 5. Recovery contract

### Attempt 1 — exact current Formation request

```text
max_output_tokens = 1200
prompt version = source-problem-formation-semantic-v0.1
actual source platform = external_web
```

No recovery instruction is injected.

### Attempt 2 — only after retryable provider-incomplete

Authorized trigger:

```text
source_formation_provider_incomplete
```

Recovery request:

```text
max_output_tokens = 2400
same semantic schema
same deterministic Formation policy
same source body
same title
same source origin
+ concise recovery instruction only
```

The recovery instruction asks the provider to return only the required structured fields, keep proposals concise, and avoid unnecessary reasoning/explanation.

No policy fact, eligibility rule, provenance rule, responsibility rule, or evidence-quote rule changes.

## 6. Explicitly forbidden retries

No retry is authorized for:

```text
source_formation_invalid_evidence_quote
source_formation_provider_invalid_json
semantic review/reject
any deterministic Formation result
other terminal errors
```

Quote repair remains disabled.

Maximum attempts:

```text
2 per target
```

Maximum model calls:

```text
2 targets x 2 = 4
```

## 7. Provider diagnostics

The phase-local instrumented fetch records only privacy-safe provider completion metadata:

```text
attempt number
recovery boolean
requested max_output_tokens
HTTP status
provider status
incomplete_details.reason
output token count
reasoning token count
```

It does not persist or emit provider request bodies, provider response text, request IDs, source body, source URL, or exact evidence quote.

This allows Phase 15.9K to distinguish, for example, a provider `max_output_tokens` exhaustion from an unspecified incomplete status without weakening source privacy boundaries.

## 8. Formation result boundary

If a semantic response completes, the existing deterministic resolver remains authoritative:

```text
resolveProblemFormationSemantic()
```

Possible states remain:

```text
eligible
provenance_review
review
reject
```

The artifact may record semantic category fields and hashed evidence-quote metadata, but never the exact quote.

Even `eligible` in this phase grants no Incident authority.

## 9. Cost / network bounds

```text
targets = 2
body acquisitions = 4
maximum source HTTP requests including redirects = 16
maximum model calls = 4
DB writes = 0
```

## 10. Database boundary

All before/after counts must remain identical for:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
ar_source_incidents
ar_source_incident_links
ar_source_full_context_resolution_outcomes
```

Forbidden:

```text
Source mutation
full-context outcome mutation
Incident creation
Source -> Incident linking
problem_signature assignment
Canonical/Public Problem creation
Public Evidence persistence
publication
```

## 11. Possible conclusions

```text
formation_provider_incomplete_recoverable_with_bounded_output_budget
formation_provider_incomplete_not_reproduced
formation_provider_incomplete_persists_after_bounded_recovery
formation_provider_reproduction_blocked_by_context_drift
formation_provider_recovery_inconclusive
```

A successful workflow run is not itself a claim that provider recovery succeeded. The artifact conclusion and per-target attempt metadata are authoritative.

## 12. Workflow

```text
.github/workflows/source-formation-provider-recovery-15-9k.yml
```

Temporary one-shot live branch:

```text
agent/phase15-9k-live-execution
```

The workflow always checks out authoritative `main`.

The temporary push trigger must be removed during closeout.

## 13. Close criterion

Phase 15.9K may close only after:

1. implementation diff review;
2. exact-head CI success;
3. exact-head PIE success;
4. expected-head merge;
5. merged-main CI success;
6. one-shot live run from exact merged main;
7. exact ordinal 9/16 durable authority reconstruction;
8. Blind overlap 0 before URL/body reads;
9. no pre-existing Incident/Public Evidence assignment;
10. both current contexts accounted for by exact integrity gate;
11. baseline attempt remains 1200 tokens;
12. retry occurs only after retryable provider-incomplete;
13. retry budget is exactly 2400 tokens;
14. provider incomplete metadata is captured without raw provider/source payload;
15. DB writes remain 0;
16. artifact inspection and independent DB readback;
17. temporary push trigger removal;
18. closeout exact-head CI/PIE and merged-main CI success.

## 14. Next governed work

If bounded recovery resolves one or both targets, the result can justify a later Formation recovery-policy promotion or curator-facing Formation decision phase, but Phase 15.9K itself does not activate either.

If provider-incomplete persists even at the bounded recovery budget, further provider/model/output-schema diagnosis remains separate from Incident formation.
