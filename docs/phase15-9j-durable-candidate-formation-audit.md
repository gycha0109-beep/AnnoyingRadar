# Phase 15.9J — Durable Candidate Problem Formation Audit

## Status

**IMPLEMENTED v0.2 — context-drift correction pending PR / gates / rerun**

Phase 15.9J follows closed Phase 15.9I and evaluates only its three durable full-context Candidate outcomes under the existing Problem Formation authority.

It does **not** create or approve Incidents.

## 1. Upstream authority

Required baseline:

```text
Phase 15.9I final main = d8a12671c5e04f75eb3e71f17bad13edf99ddc22
full-context outcome total = 85
source batch = phase15.9i-confirmed-false-negative-candidates-v0.1
batch rows = 3
ordinals = 4, 9, 16
sample fingerprint = 2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e
```

The three durable rows must still match the H/I authority exactly on Candidate decision, semantic facts, context hash/count/scope, and non-truncated status. Persisted-authority drift remains a hard failure.

## 2. Blind and downstream boundary

Before canonical URL or body reads Phase 15.9J proves:

```text
Blind overlap = 0
```

It also requires no pre-existing target assignment in:

```text
ar_source_incident_links
ar_public_problem_evidence_snapshots
```

Only then may URL/body fields be loaded.

## 3. External-web context integrity

Each target is fetched twice with:

```text
SOURCE_FULL_CONTEXT_EXTERNAL_POLICY = bounded_public_html
```

The pair is compared for stability, and each fetch is compared with frozen H/I authority on:

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

Bounds:

```text
targets = 3
body acquisitions = 6
maximum HTTP requests including redirects = 24
```

### 3.1 First live attempt exposed real context drift

Implementation PR #140:

```text
exact head = 774121523ea3d1f5dc4b5aedf8a82b3d12bbd6aa
CI #479 = SUCCESS
PIE #123 = SUCCESS
implementation main = 6f509ca290ed8b705f4081948b38daf60e15f19f
merged-main CI #480 = SUCCESS
```

First one-shot live:

```text
workflow run = 33044887515
execution SHA = 6f509ca290ed8b705f4081948b38daf60e15f19f
result = FAILURE
artifact = 9635238500
```

The failure occurred before any Formation model evaluation:

```text
Phase 15.9J first.content_hash drifted from frozen authority
```

This means at least one current external page/extraction no longer matches the exact H/I context bytes. The strict integrity gate behaved correctly, but v0.1 aborted at the first drift and therefore lost privacy-safe diagnostics for that ordinal and prevented evaluation of independent stable targets.

No evidence from this failed run may be treated as Formation eligibility.

## 4. v0.2 context-drift correction

The integrity requirement is **not relaxed**.

For every target v0.2 still performs the same double-fetch and frozen H/I comparison. The difference is only control flow:

```text
integrity matches H/I
  -> Formation model may evaluate that frozen-equivalent body

stable pair but current context differs from H/I
  -> audit_status = context_drift
  -> model calls for that Source = 0
  -> preserve privacy-safe current/expected fingerprints
  -> continue to independent targets

pair itself unstable
  -> audit_status = context_pair_unstable
  -> model calls for that Source = 0
  -> continue to independent targets
```

A drifted body is never silently accepted as a substitute for the H/I Candidate context.

Privacy-safe drift diagnostics may include only:

```text
baseline ordinal
failure codes
stable-pair boolean
expected content hash / char count / extraction scope / title hash
observed content hash / char count / extraction scope / title hash
status / scope / truncation
```

They exclude Source UUID, URL, raw body, snippet, author, and exact evidence quote.

## 5. Formation authority reused

No new semantic or deterministic Formation policy is introduced.

Reused authority:

```text
source-problem-formation-observer-v0.1
source-problem-formation-semantic-v0.1
source-problem-formation-v0.1
```

For integrity-stable Sources only, the observer collects:

```text
problem_claim
experience_actor
friction_specificity
pain_centrality
content_kind
source_origin
friction_responsibility
evidence_quote
problem_mechanism_proposal
incident_summary_proposal
```

The deterministic resolver maps these to:

```text
eligible
provenance_review
review
reject
```

The model receives actual origin:

```text
Source platform: external_web
```

rather than the historical acquisition adapter label.

## 6. Formation eligibility remains stricter than Admission Candidate

A durable Source Admission Candidate is not automatically Formation eligible.

Existing Formation authority additionally requires appropriate original-source provenance, external/structural responsibility, concrete central friction, attributable experience, acceptable content kind, and an exact grounded evidence quote.

Derivative evidence may become `provenance_review`; uncertain semantics remain `review`; deterministic exclusion conditions remain `reject`.

## 7. Evidence quote and retry boundary

An evidence quote must be an exact contiguous excerpt of the fetched body.

For `eligible`:

```text
evidence_quote_grounded = true
```

Artifact stores only:

```text
evidence_quote_sha256
evidence_quote_char_count
evidence_quote_grounded
```

No raw quote is emitted.

Maximum semantic attempts per integrity-stable Source:

```text
2
```

Only this trigger may retry:

```text
source_formation_provider_incomplete
```

No invalid-quote retry or semantic-result retry is authorized.

Maximum model calls remain:

```text
6
```

and will be lower when one or more Sources are isolated by context drift.

## 8. Artifact and conclusion semantics

Each target must end in exactly one audit status:

```text
formation_evaluated
context_drift
context_pair_unstable
```

A context-drift status is **not** a Formation state.

Possible overall conclusions include:

```text
formation_eligible_candidates_detected
formation_followup_required
formation_rejects_only
formation_inconclusive_due_context_drift
formation_eligible_detected_with_context_drift_unresolved
```

Any unresolved drift prevents a claim that all three durable Candidates completed Formation audit.

Artifact authority remains:

```text
empirical_formation_audit_not_incident_authority
```

## 9. Database boundary

Phase 15.9J is read-only.

Protected before/after counts must be identical for:

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

Authorized DB writes:

```text
0
```

Still forbidden:

```text
Source mutation
Source Admission mutation
full-context outcome mutation
Incident creation
Source -> Incident linking
problem_signature assignment
Canonical/Public Problem creation
Public Evidence persistence
publication
```

## 10. Workflow and close criterion

Workflow:

```text
.github/workflows/source-durable-candidate-formation-audit-15-9j.yml
```

Temporary live branch:

```text
agent/phase15-9j-live-execution
```

The workflow always checks out authoritative `main`.

Phase 15.9J may close only after the v0.2 correction passes exact-head CI/PIE, merges by expected head, passes merged-main CI, then completes a one-shot rerun that accounts for all three targets as either Formation-evaluated or explicitly context-isolated, while Blind overlap remains zero and all DB domains remain unchanged. The artifact and independent DB readback must then be inspected, and the temporary push trigger must be removed in a closeout PR.

## 11. Next authority

Only Formation `eligible` Sources with intact context authority may be considered by a later curator packet/decision phase analogous to Phase 15.8O.

A drifted Source requires a separate governed decision about whether to re-establish current-context Source Admission/Formation authority. Phase 15.9J does not perform that replacement.

Even an `eligible` result does not itself create Incident identity or persistence authority.
