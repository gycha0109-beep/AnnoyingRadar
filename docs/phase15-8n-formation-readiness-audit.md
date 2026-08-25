# Phase 15.8N — Formation Readiness Audit

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.8N is the read-only bridge between durable Phase 15.8M-B Source Admission outcomes and the existing Phase 15.6 Problem Formation authority.

It does not authorize Incident creation, problem-mechanism identity, Canonical Problem creation, persistence, or publication.

---

## 1. Why this phase exists

Phase 15.8M-B closed with:

```text
82 durable full-context outcomes
├─ Candidate          8
├─ Reject            66
└─ unresolved Review  8
```

The eight Candidates satisfy the M-B Source Admission semantic contract:

```text
problem_claim        = yes
experience_actor     = self
friction_cause       = external_service_or_product
friction_specificity = concrete
pain_centrality      = central
content_kind         = organic
```

That is not sufficient for Problem Formation.

Phase 15.6 established the stronger invariant:

```text
Source Admission Candidate
≠ Formation-eligible Public Evidence
≠ independent Incident
≠ repeated Problem mechanism
≠ Canonical Problem
```

Formation additionally requires publication-sensitive full-context facts such as:

```text
source_origin
friction_responsibility
exact evidence grounding
formation-specific content-kind interpretation
```

The Formation gate must also independently detect promotional/lead-generation, informational, derivative, incidental, contractual-only, self-caused, or otherwise non-evidence surfaces even when Source Admission admitted the Source.

Therefore Phase 15.8N re-observes the exact eight Candidate full posts using the existing Phase 15.6 deterministic mapper rather than promoting M-B Candidate rows directly.

---

## 2. Frozen upstream authority

Authoritative M-B batch:

```text
phase15.8m-b-remainder-v0.1
```

Required durable distribution before any paid audit call:

```text
batch rows:          82
Candidate:            8
Reject:              66
unresolved Review:    8
```

The exact Candidate cohort is frozen by sorted Source Signal ID fingerprint:

```text
aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020
```

If any count or fingerprint drifts, the runner fails before external model calls.

---

## 3. Candidate audit scope

Only the eight durable M-B Candidate Sources enter the Formation audit.

Each Source is fetched through the existing fixed-host NAVER full-context fetcher and observed under:

```text
source-problem-formation-observer-v0.1
```

The observer reports facts only. It does not decide Formation state itself.

Observed Formation schema:

```text
problem_claim
experience_actor
friction_specificity
pain_centrality
content_kind
source_origin
friction_responsibility
evidence_quote
```

The observer additionally emits two explicitly non-authoritative curator aids:

```text
problem_mechanism_proposal
incident_summary_proposal
```

These proposals cannot become `problem_signature` or `incident_key` automatically.

The existing deterministic function:

```text
resolveProblemFormationSemantic()
```

remains the Formation-state authority and maps each observation to:

```text
eligible
provenance_review
review
reject
```

---

## 4. Formation-specific content interpretation

Phase 15.8N does not blindly inherit M-B `content_kind=organic`.

Formation re-observes the full post because publication evidence has a stricter semantic responsibility.

Examples of surfaces that must fail safe even when they contain first-person wording include:

```text
professional-service lead generation
scam-recovery solicitation
affiliate or sponsored promotion
SEO/search-information articles
how-to guides whose main purpose is instruction
rewritten or derivative reports
```

This is deliberate disagreement detection, not an attempt to rewrite M-B history.

The audit reports the count of Formation `content_kind` observations that disagree with the durable M-B admission observation.

---

## 5. Evidence grounding

`evidence_quote` must be the shortest exact contiguous excerpt from the fetched full post that supports the concrete friction observation.

The observer rejects an invented or non-contiguous quote before the deterministic mapper sees it.

The Phase 15.6 mapper then requires grounded evidence for Formation eligibility.

No full source body is written to Supabase or included in the disposable audit artifact.

---

## 6. Provider recovery boundary

Each Candidate receives:

```text
base Formation semantic attempt: 1
provider-incomplete retry:       max 1
semantic attempts per Source:    max 2
```

Only:

```text
source_formation_provider_incomplete
```

may trigger the second semantic attempt.

The following do not receive automatic semantic retry in this phase:

```text
invalid evidence quote
provider missing output
provider network error
fetch failure
URL failure
other semantic/provider errors
```

Maximum cost boundary:

```text
public full-context fetches <= 8
paid semantic calls       <= 16
```

---

## 7. Disposable audit artifact

The live workflow writes a one-day GitHub Actions artifact containing the curator-facing empirical audit.

It may contain:

```text
Source Signal ID
public title
published timestamp
prior M-B semantic facts
Formation state / reason
Formation semantic facts
exact evidence quote
non-authoritative mechanism proposal
non-authoritative incident summary proposal
content hash / scope / char count / truncation
recovery metadata
```

It must not contain:

```text
full source body
canonical URL
fetched URL
author handle
provider request ID
```

Artifact authority is explicitly:

```text
empirical_formation_audit_not_runtime_truth
```

The artifact is evidence for the next governed decision, not a production label table.

---

## 8. Database boundary

Phase 15.8N is strictly read-only.

Before and after the live audit, the runner compares exact row counts for:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_source_incidents
ar_source_full_context_resolution_outcomes
```

Required result:

```text
all counts unchanged
DB write statements = 0
```

No migration is required.

The Blind evaluation membership table is not queried.

---

## 9. Incident and mechanism authority

Phase 15.6 explicitly established:

> AI may propose same incident, related incident, same problem mechanism, or related problem mechanism, but AI does not own incident identity.

Phase 15.8N preserves that rule.

The audit can produce text proposals to help a curator compare Sources, but it does not assign:

```text
incident_key
problem_signature
repeat_eligible
```

Consequently this phase cannot assert a repeated Problem cluster even if two model proposals look similar.

A later governed phase must explicitly review eligible Sources, assign or reuse Incident identity, and assign a problem mechanism before `buildIncidentAwareProblemClusters()` can be authoritative.

---

## 10. M-B unresolved cohort remains blocked

The eight unresolved M-B Review outcomes do not enter Formation.

Current durable reason distribution:

```text
source_full_context_invalid_evidence_quote    5
full_context_url_invalid                      1
source_full_context_provider_missing_output   1
source_full_context_provider_network_error    1
```

These are a separate remediation backlog.

Phase 15.8N does not reinterpret them as Candidate, Reject, or Formation evidence.

Any future recovery of those eight Sources requires a separately defined source-resolution remediation authority and a new durable outcome version/batch if their Source Admission decision changes.

---

## 11. Live workflow

Workflow:

```text
.github/workflows/source-problem-formation-audit-15-8n.yml
```

Normal retained trigger:

```text
workflow_dispatch
```

Temporary one-shot autonomous trigger for the authoritative live run:

```text
agent/phase15-8n-live-execution
```

The workflow always checks out authoritative `main`.

The temporary push trigger must be removed in closeout.

---

## 12. Release flow

```text
implementation branch
→ unit / contract tests
→ PR exact-head CI / PIE
→ merge implementation to main
→ merged-main CI
→ authoritative DB preflight
→ move exact temporary live trigger branch to authoritative main
→ bounded live Formation audit over exact Candidate 8
→ download one-day audit artifact
→ inspect per-Source Formation states and proposals
→ independent DB readback proves zero mutation
→ closeout PR removes temporary live trigger
→ exact-head CI / PIE
→ merge closeout
→ merged-main CI
→ Phase 15.8N CLOSED
```

---

## 13. Downstream authorization

Even a successful live result does not automatically authorize the next write phase.

At Phase 15.8N closeout:

```text
Formation semantic audit: allowed
Formation eligibility observation: allowed
Incident identity persistence: NOT AUTHORIZED
Problem signature persistence: NOT AUTHORIZED
Canonical Problem draft persistence: NOT AUTHORIZED
Publication: NOT AUTHORIZED
```

The next decision must use the empirical audit to determine whether any eligible Sources have enough curator-resolved independent Incident support to justify a separately governed incident/mechanism assignment phase.
