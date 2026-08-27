# Phase 15.9M — Curator On-Demand Formation Assessment Handoff

## Status

**CLOSED**

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

Repository inspection after 15.9L showed that the normal curator Source Signal API stopped at Complaint classification. Formation was reachable only through phase/audit scripts.

Existing downstream precedent remains curator-governed:

```text
Formation observation
→ read-only curator decision
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

There is no autonomous or scheduled runtime trigger. A curator must explicitly request the assessment.

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

Production baseline at phase start and closeout:

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

using observer v0.2.

For external-web Sources, the service explicitly opts into the already-governed bounded public HTML policy:

```text
SOURCE_FULL_CONTEXT_EXTERNAL_POLICY = bounded_public_html
```

The Formation prompt receives actual source origin `external_web` rather than the acquisition/search adapter label.

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

The exact evidence quote is curator-visible because it is the grounding basis for the Formation observation. It is not persisted by this endpoint.

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

The service and API route contain no persistence command surface.

15.9M does not persist the Formation assessment itself and does not create or modify:

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

## 9. Implementation authority

Initial implementation PR:

```text
PR #147
corrected exact head = b8bcafc98cd7491370fbe8103f1acfcfdd1ab200
CI #494 = SUCCESS
PIE #131 = SUCCESS
implementation main = c59170695f23b8a63402ab6ef2501e097f25722a
merged-main CI #495 = SUCCESS
```

CI #493 on the earlier PR head failed only because the test fixture omitted real DB-key fields. Production code was unchanged for that correction.

The first live verification exposed a separate real runtime integration defect:

```text
run #1 = 33051545076
result = Review
reason = full_context_origin_unsupported
source network requests = 0
model calls = 0
```

This run is diagnostic evidence only and is **not** Phase 15.9M live closeout authority.

Root cause: external-web acquisition requires explicit bounded-policy opt-in, while the first service version delegated to the observer default fetcher without that opt-in.

Corrective PR:

```text
PR #148
exact head = d6fad8505c748d66935b9ada75a64b60b4261b83
CI #496 = SUCCESS
PIE #132 = SUCCESS
corrected main = e79ec9301181f9f90ce569c3258885f629f12cf1
merged-main CI #497 = SUCCESS
```

The corrective diff changed only the service external full-context dispatch and its regression contract. Source Admission, Formation semantics, deterministic Formation policy, provider recovery, Blind policy, and downstream authority were unchanged.

---

## 10. Authoritative one-shot live verification

Authoritative run:

```text
workflow = Source Curator Formation Handoff 15.9M
run #2 = 33052026373
execution SHA = e79ec9301181f9f90ce569c3258885f629f12cf1
status = SUCCESS
artifact id = 9638028885
artifact digest = sha256:d19be51dd9159001c02c1aef5425a69e3154134d4469965841d901057f90a4a1
```

Target authority:

```text
baseline ordinal = 9
Blind member = false
durable Source Admission = resolved Candidate
batch = phase15.9i-confirmed-false-negative-candidates-v0.1
reason = full_context_first_hand_external_friction
```

Actual execution:

```text
source network requests = 1 / max 8
model calls = 2 / max 2
database writes = 0
```

The external source was actually acquired. Full-context integrity matched the frozen ordinal-9 authority:

```text
status = resolved
scope = full_post
content hash = 4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463
original char count = 3407
extraction scope = content_container
truncated = false
```

Provider recovery executed under the already-promoted 15.9L policy:

```text
attempt 1 = 1200 tokens → provider incomplete
attempt 2 = 2400 tokens → recovered
recovery attempted = true
recovery recovered = true
attempt count = 2
trigger = source_formation_provider_incomplete
```

Final Formation observation:

```text
state = review
resolved = false
reason = formation_semantic_uncertain
```

Observed semantic facts included a concrete first-hand organic post with original provenance, while `friction_responsibility=mixed`; the deterministic Formation gate therefore correctly retained Review rather than inventing downstream authority.

A Review result is a valid runtime handoff result. 15.9M verifies reachability, policy execution, grounding, privacy, and authority boundaries; it does not require an Eligible outcome.

---

## 11. Independent database readback

Artifact before/after and independent production Supabase readback agreed exactly:

```text
ar_source_signals = 3562
ar_source_signal_observations = 3892
ar_source_ingestion_runs = 144
ar_raw_inputs = 10
ar_pain_evidences = 27
ar_public_problems = 3
ar_public_problem_evidence_snapshots = 7
ar_public_problem_feed = 3
ar_source_incidents = 6
ar_source_incident_links = 7
ar_source_full_context_resolution_outcomes = 85
```

Protected domains were unchanged. Database writes = 0.

---

## 12. Artifact privacy authority

The disposable one-day artifact omits:

```text
Source UUID
canonical/fetched URL
full source body
raw snippet
source author identity
provider request ID
```

It retains only bounded assessment metadata required to audit the handoff.

---

## 13. Authority explicitly not granted

Phase 15.9M does not authorize:

```text
automatic Formation execution on ingestion
scheduled Formation execution
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

A curator-visible `eligible` result, if one occurs in a future manual assessment, is still not an Incident or publication decision.

---

## 14. Closeout

The temporary `agent/phase15-9m-live-execution` push trigger is removed in the closeout branch. The retained workflow is manual `workflow_dispatch` only and continues to checkout authoritative `main`.

Phase 15.9M is closed only with the exact runtime boundary above. Any later Incident formation/persistence remains a separate curator-governed phase.
