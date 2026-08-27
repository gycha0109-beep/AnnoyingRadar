# Phase 15.9M — Curator On-Demand Formation Assessment Handoff

## Status

**IMPLEMENTATION READY / LIVE NOT YET RUN**

Phase 15.9M connects the reusable Problem Formation observer to the curator-facing admin runtime without granting downstream persistence authority.

The endpoint is explicit, curator-initiated, paid/networked, and database read-only.

---

## 1. Why this phase exists

Phase 15.9L closed with reusable Formation observer:

```text
source-problem-formation-observer-v0.2
```

and verified bounded provider recovery:

```text
attempt 1 = 1200 tokens
retryable provider-incomplete only
attempt 2 = 2400 tokens + concise recovery instruction
```

However repository inspection after 15.9L showed that the normal curator Source Signal API stopped at Complaint classification. Formation was reachable only through phase/audit scripts.

Existing downstream precedent remains curator-governed:

```text
Formation observation
→ read-only curator decision packet
→ explicit curator approval
→ atomic Incident persistence
```

Therefore 15.9M adds only the missing read-only runtime handoff.

---

## 2. Endpoint

```text
POST /api/radar/admin/source-signals/:signalId/formation
```

The route requires the existing `requireRadarCurator` authority.

There is no GET/autonomous/scheduled trigger. A curator must explicitly request the assessment.

---

## 3. Preflight order before URL/body access

The service fails closed in this order:

1. Source Signal ID must exist;
2. Source must not belong to the Blind evaluation set;
3. exactly one durable full-context outcome must exist for the Source;
4. that outcome must be `status=resolved / decision=candidate`;
5. Source must not already have an Incident link or Public Evidence row;
6. only then may canonical URL/full body be loaded and Formation executed.

The first Source existence query reads only `id`.

Blind membership and durable Candidate authority are therefore resolved before routing identity or full source body access.

---

## 4. Durable Candidate authority

Table:

```text
ar_source_full_context_resolution_outcomes
```

Current production baseline at phase start:

```text
85 outcomes
85 distinct Sources
0 multi-outcome Sources
11 resolved Candidate
66 resolved Reject
8 unresolved Review
```

Although the current table has one outcome per Source, 15.9M deliberately fails closed if a Source later has multiple durable outcomes.

It does not guess which historical row is authoritative and does not silently select the newest Candidate.

---

## 5. Formation execution

After preflight, the service calls:

```text
resolveSourceProblemFormationAudit()
```

using the reusable observer v0.2.

For external-web Sources, the Formation prompt receives actual origin `external_web` rather than the acquisition/search adapter label.

The existing deterministic `resolveProblemFormationSemantic()` mapper remains the Formation-state authority.

---

## 6. Curator response

Response authority:

```text
curator_read_only_formation_assessment_not_persistence
```

The response includes:

```text
Source Signal ID
upstream durable Source Admission outcome identity/version/status/decision/reasons
Formation observer version
Formation status/state/reasons
semantic facts
exact grounded evidence quote
non-authoritative mechanism/incident proposals
prompt/provider/model labels
safe full-context metadata
provider recovery metadata
```

The response excludes:

```text
full source body
canonical/fetched URL
provider request ID
```

The exact evidence quote is curator-visible because it is the grounding basis for the Formation judgment. It is not persisted by this endpoint.

---

## 7. Existing downstream authority is protected

If the Source already has either:

```text
ar_source_incident_links row
or
ar_public_problem_evidence_snapshots row
```

15.9M returns a conflict and does not re-run Formation.

This prevents an ephemeral model re-observation from appearing to supersede an already curator-approved downstream assignment.

---

## 8. Mutation boundary

The service and API route contain no:

```text
insert
upsert
delete
RPC write
```

15.9M does not persist the Formation assessment itself.

It does not create or modify:

```text
Source Admission outcome
Incident
Source→Incident link
problem_signature
Public Evidence
Canonical Problem
publication state
```

---

## 9. Error boundary

Fail-closed service errors include:

```text
source_signal_id_required
source_signal_not_found
source_formation_blind_member_blocked
source_formation_durable_outcome_required
source_formation_durable_outcome_ambiguous
source_formation_candidate_required
source_formation_downstream_assignment_exists
```

Formation provider/fetch errors continue to use existing Formation observer result/error semantics.

---

## 10. One-shot live verification

The verification runner reconstructs ordinal 9 from the frozen 15.9I/J durable Candidate authority at runtime. No Source UUID is committed to Git.

It independently proves Blind exclusion before invoking the service and requires the 85-row durable outcome baseline.

Budgets:

```text
target = 1
source network requests max = 8
model calls max = 2
database writes = 0
```

The disposable artifact excludes Source UUID, URL, body, author identity, and provider request ID.

---

## 11. Authority explicitly not granted

Phase 15.9M does not authorize:

```text
automatic Formation execution on ingestion
Formation assessment persistence
Incident identity or persistence
Source→Incident linking
problem_signature assignment
repeated-problem clustering
Public Evidence persistence
Canonical Problem persistence
publication
ordinal 4 current-context replacement
```

A curator-visible `eligible` result is still not an Incident or publication decision.

---

## 12. Closeout requirements

15.9M closes only after:

1. implementation PR exact-head CI succeeds;
2. PIE prospective shadow succeeds;
3. expected-head merge succeeds;
4. merged-main CI succeeds;
5. one-shot live service verification succeeds from exact implementation main;
6. independent DB readback confirms protected domains unchanged;
7. temporary live push trigger is removed;
8. exact live/artifact authority is frozen in docs/tests;
9. closeout PR exact-head CI/PIE and merged-main CI succeed.
