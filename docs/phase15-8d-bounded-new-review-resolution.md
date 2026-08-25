# Phase 15.8D — Bounded New-Review Full-Context Resolution

## Status

**IMPLEMENTED — pending CI/PIE and bounded live resolution**

## Empirical reason for this phase

Phase 15.8C closed with exact new-source acquisition telemetry:

```text
exact runs: 24
newly inserted Sources: 961
new Candidates: 0
new Reviews: 166
new Rejects: 795
```

The next uncertainty is not Source volume, duplicate accounting, or request pagination.

It is:

> Do exact-new snippet-level Reviews become usable Candidates when the full public post is inspected, or are they predominantly ambiguous/noisy matches?

Source Admission thresholds remain unchanged.

## Authority

Phase 15.8D reuses the existing Phase 15.5F authority:

```text
classifySourceAdmission()
→ REVIEW + requires_full_context only
→ fetchSourceFullContext()
→ semantic observation
→ resolveFullContextSemantic()
```

Existing implementation:

```text
lib/sources/source-full-context-fetch.mjs
lib/sources/source-full-context-resolution.mjs
```

No new semantic decision policy is introduced.

## Exact-new Review reconstruction

No new database identity table is required.

A Source identity is reconstructed as newly inserted by an exact telemetry run when:

```text
Source observation belongs to the exact run
AND
source.first_seen_at >= run.started_at
AND
source.first_seen_at <= run.completed_at
```

This reconstruction was independently verified against live Phase 15.8C telemetry before implementation:

```text
reconstructed exact-new rows: 961
exact inserted telemetry total: 961
```

The runner also requires:

```text
reconstructed exact-new Review count
= sum(new_admission_review_count)
```

before any paid full-context resolution starts.

If this equality fails, execution stops before paid calls.

## Bounded deterministic sample

Version:

```text
exact-new-review-sample-v0.1
```

Default sample size:

```text
24
```

The sample is deterministic and reproducible.

Selection:

1. reconstruct exact-new identities;
2. classify with unchanged snippet-level Source Admission;
3. keep only `review + requires_full_context`;
4. group by `domain × family`;
5. stable-hash order inside each stratum;
6. round-robin across strata until the sample budget is filled.

This avoids taking the first 24 UUIDs or allowing one high-volume query family to consume the entire sample.

The sample is a bounded diagnostic sample. It is not a claim of population-level statistical confidence.

## Privacy / persistence boundary

Full public post bodies are fetched only for sampled Reviews.

The runner:

- does not write full bodies to Supabase;
- does not write resolution outcomes to Supabase;
- does not commit full bodies to Git;
- does not print full post text in diagnostics;
- does not print `evidence_quote` in diagnostics;
- reports only resolution decision, reason codes, semantic labels, fetch metadata, and token usage.

The existing OpenAI request uses:

```text
store: false
```

## Blind / product authority boundary

Phase 15.8D does not query Blind membership.

Exact-new identities are newly inserted after the frozen Gold/Blind authority already existed; this phase does not redefine or inspect Blind 120.

The runner snapshots and requires no changes to:

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

Expected:

```text
DB writes: 0
Blind evaluation reads: 0
Public Problem mutations: 0
Incident mutations: 0
```

## Live execution guard

Live full-context resolution requires:

```text
ALLOW_PAID_SOURCE_FULL_CONTEXT=true
OPENAI_API_KEY
OPENAI_SOURCE_FULL_CONTEXT_MODEL
```

Model authority follows the existing source-full-context resolver. The pilot workflow defaults the model to the repository's established Phase 15.5 full-context-compatible model when no dedicated model secret is supplied.

Workflow:

```text
.github/workflows/source-review-resolution-pilot.yml
```

It checks out authoritative `main` before using secrets.

A temporary dedicated ops push trigger exists solely because the current GitHub connector cannot dispatch `workflow_dispatch` directly. It must be removed after the empirical pilot; manual `workflow_dispatch` may remain.

## Required empirical output

For the deterministic sample report:

```text
sample size
Candidate
Reject
unresolved Review
Review → Candidate promotion rate
outcomes by domain
outcomes by query family
fetch success/failure
```

The key acquisition metric is:

```text
full-context Candidate promotions / sampled exact-new Reviews
```

## Decision rule

If a meaningful portion of sampled Reviews promotes to Candidate, acquisition calibration should reward query/domain families that produce those promotions.

If almost none promote, the answer is not to lower Source Admission. The acquisition query space/prefilter must become more specific before further scale expansion.

Phase 15.8D may close when one bounded deterministic sample has been resolved or transparently reports unresolved fetch/provider failures, while all no-write and authority invariants remain intact.
