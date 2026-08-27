# Phase 15.9J — Durable Candidate Problem Formation Audit

## Status

**IMPLEMENTED — pending PR / CI / PIE / one-shot live audit**

Phase 15.9J follows closed Phase 15.9I.

Phase 15.9I durably preserved exactly three full-context Source Admission false negatives in:

```text
ar_source_full_context_resolution_outcomes
batch = phase15.9i-confirmed-false-negative-candidates-v0.1
rows = 3
ordinals = 4, 9, 16
```

All three are durable `resolved / candidate` outcomes under the Source Admission full-context authority. They are still **not Incidents**.

Phase 15.9J asks the next, narrower question:

> Do these three durable Candidates satisfy the already-existing Problem Formation authority when evaluated against the same verified full context?

It does not create or approve Incidents.

---

## 1. Upstream authority

Required closed baseline:

```text
Phase 15.9I final main = d8a12671c5e04f75eb3e71f17bad13edf99ddc22
full-context outcome total = 85
source batch version = phase15.9i-confirmed-false-negative-candidates-v0.1
batch rows = 3
```

Exact upstream sample fingerprint remains:

```text
2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e
```

The three durable rows must still match the frozen H/I authority on:

```text
status = resolved
decision = candidate
reason = full_context_first_hand_external_friction
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
context_status = resolved
context_scope = full_post
context SHA-256 = exact H/I value
context char count = exact H/I value
context_truncated = false
```

Any durable-row drift aborts the phase.

---

## 2. Blind boundary

Phase 15.9J loads only privacy-safe durable outcome fields first.

Before canonical URL or body access it must prove:

```text
Blind overlap = 0
```

It also verifies that none of the three target Sources is already assigned to:

```text
ar_source_incident_links
ar_public_problem_evidence_snapshots
```

Only after those checks may URL/body fields be loaded.

---

## 3. External-web context integrity

The targets originated from external-web surfaces discovered through the Phase 15.9C acquisition campaign.

The generic full-context fetcher supports external pages only with the explicit bounded policy:

```text
SOURCE_FULL_CONTEXT_EXTERNAL_POLICY = bounded_public_html
```

Each target is fetched twice.

Required stable pair:

```text
resolved
not truncated
same content hash
same original char count
same extraction scope
same title
```

Both fetches must also match the exact Phase 15.9H/I frozen authority:

```text
content SHA-256
char count
full_post scope
extraction scope
title SHA-256
```

A context drift aborts Formation evaluation for the run.

Bounds:

```text
targets = 3
successful body acquisitions = 6
maximum HTTP requests including redirects = 24
```

---

## 4. Formation semantic authority reused

No new Formation policy is introduced.

Phase 15.9J reuses:

```text
source-problem-formation-observer-v0.1
source-problem-formation-semantic-v0.1
source-problem-formation-v0.1
```

The Formation observer collects:

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

The existing deterministic resolver alone maps those facts to:

```text
eligible
provenance_review
review
reject
```

### Actual source origin supplied to the model

The historical acquisition `source_platform` label is not treated as content-origin truth.

For these three Sources the prompt receives:

```text
Source platform: external_web
```

based on the current canonical URL origin classifier.

This preserves the Phase 15.9G/H rule that semantic evaluation receives the actual content origin rather than the acquisition adapter label.

---

## 5. Formation eligibility is stricter than Admission Candidate

A Source Admission Candidate does not automatically become Formation eligible.

The existing Formation resolver additionally requires, among other conditions:

```text
source_origin = original
friction_responsibility in:
  external_service_or_product
  external_process_or_policy
  structural_system

experience_actor attributable
content_kind organic/news
concrete central friction
exact grounded evidence quote
```

Derivative/reposted evidence becomes `provenance_review`.

Advertisement/informational surfaces, self-caused friction, contractual-term-only complaints, natural-event-only complaints, or other deterministic exclusion cases are rejected.

Uncertain semantics remain review.

---

## 6. Evidence quote contract

The Formation observer requires `evidence_quote` to be either null or an exact contiguous excerpt from the fetched full post.

The existing observer validates this before the deterministic Formation resolver runs.

For an `eligible` result Phase 15.9J additionally requires:

```text
evidence_quote_grounded = true
```

The disposable artifact does **not** emit the quote itself. It records only:

```text
evidence_quote_sha256
evidence_quote_char_count
evidence_quote_grounded
```

No quote-repair retry is authorized.

---

## 7. Provider recovery boundary

Maximum semantic attempts per Source:

```text
2
```

The existing Formation observer retries only:

```text
source_formation_provider_incomplete
```

No retry is granted for:

```text
invalid evidence quote
invalid JSON
semantic uncertainty
formation rejection
other terminal provider/output errors
```

Maximum model calls:

```text
3 Sources x 2 = 6
```

---

## 8. Artifact boundary

The disposable artifact may contain:

```text
baseline ordinal
prior rejection stratum
Formation state / reason codes
Formation semantic facts
hashed evidence-quote metadata
non-authoritative mechanism proposal
non-authoritative incident summary proposal
context hash / char count / extraction scope
recovery metadata
aggregate execution counts
```

It does not contain:

```text
Source UUID
canonical URL
fetched URL
raw snippet
full body
author handle
exact evidence quote
provider request ID
```

The artifact authority is explicitly:

```text
empirical_formation_audit_not_incident_authority
```

---

## 9. Database boundary

Phase 15.9J is read-only.

All of the following counts must be identical before and after:

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

Forbidden:

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

---

## 10. Workflow

Workflow:

```text
.github/workflows/source-durable-candidate-formation-audit-15-9j.yml
```

Temporary one-shot live branch:

```text
agent/phase15-9j-live-execution
```

The workflow always checks out authoritative `main`.

The temporary push trigger must be removed during closeout.

---

## 11. Close criterion

Phase 15.9J may close only after:

1. implementation diff review;
2. exact-head CI success;
3. exact-head PIE success;
4. expected-head implementation merge;
5. merged-main CI success;
6. one-shot live run from exact merged main;
7. exact three-row Phase 15.9I authority reconstruction;
8. Blind overlap 0 before URL/body reads;
9. no pre-existing Incident/Public Evidence assignment;
10. all three double-fetch context-integrity gates pass;
11. actual prompt origin is `external_web`;
12. Formation audit covers all three Sources;
13. provider recovery remains provider-incomplete-only;
14. DB writes remain 0 and all protected domains are unchanged;
15. disposable artifact inspection;
16. independent production DB readback;
17. temporary push trigger removal;
18. closeout exact-head CI/PIE and merged-main CI success.

---

## 12. Next authority after 15.9J

If one or more Sources are Formation `eligible`, that still does not create Incident authority.

The next governed step should be a separate curator packet/decision phase analogous to Phase 15.8O, where potential Incident identity and mechanism comparisons are reviewed without silently inferring approval from Candidate or Formation state.

Only a later explicitly approved persistence phase may create Incident rows or Source-to-Incident links.
