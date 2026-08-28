# Phase 15.9P — Durable Curator Incident Decision Authority Design

## Status

**DESIGN READY / IMPLEMENTATION NOT STARTED**

This document defines the narrow governed phase that should follow closed Phase 15.9O.

Phase 15.9P must persist an explicit human/curator Incident decision as durable private authority.

It must **not** create or reuse an Incident, create a Source→Incident link, persist Public Evidence, create/mutate a Canonical/Public Problem, or publish anything.

```text
Formation eligible ≠ curator approval
curator decision packet ≠ curator approval
curator approval ≠ Incident mutation
Incident ≠ Public Problem publication
```

---

## 1. Repository authority investigated

Current authoritative main at design start:

```text
b967b089e88bdec5c76dec16064f4eda01f0395f
```

Phase 15.9O is CLOSED and leaves a generic read-only packet surface:

```text
explicit formationAssessmentId
→ exact current context integrity
→ exact evidence reconstruction
→ current Incident/Public Problem comparison
→ blank curator decision template
```

The packet does not persist a decision and sets persistence authority false.

Historical Phase 15.8O/P provides useful vocabulary and write primitives, but its approval implementation is not generic:

- 15.8O produced a blank read-only decision packet;
- 15.8P encoded the approved Source identities in repository code as SHA-256-keyed frozen mappings;
- 15.8P then called the Incident registration RPC directly;
- there was no durable generic curator approval/decision table between the packet and Incident mutation.

Production schema inspection confirms that the only current public tables with `incident` or `approval` in their names are:

```text
ar_source_incidents
ar_source_incident_links
```

There is no durable `approval` table.

Current Incident write routines are:

```text
ar_register_source_incident
ar_register_source_incident_batch
```

Neither routine accepts or validates a curator-decision/approval row ID.

---

## 2. Why 15.8P cannot be reused as the generic approval layer

The conceptual decision fields are reusable:

```text
evidence_decision
incident_action
existing_incident_id
new_incident_key
new_incident_label
reason / notes
```

The 15.8P implementation authority is not reusable as-is because it was bound to:

```text
one exact historical Candidate cohort
one exact Candidate fingerprint
two fixed Source-ID hashes
two pre-approved Incident keys
one fixed problem_signature
```

That structure is an immutable historical execution plan, not a runtime approval store.

A new generic path must not contain:

```text
hard-coded Source hashes
hard-coded Incident keys
hard-coded problem_signature
latest eligible Formation inference
implicit approval from Formation state
```

---

## 3. Current Incident identity and dedupe authority

Current database authority is:

```text
ar_source_incidents.incident_key UNIQUE
ar_source_incident_links.source_signal_id UNIQUE
```

Therefore:

- `incident_key` is a stable curator-supplied identity key;
- exact key equality is the current database create/reuse identity boundary;
- one Source Signal may belong to at most one Incident;
- semantic similarity is not Incident identity;
- the database does not derive `incident_key` from Formation or model output.

The current `ar_register_source_incident()` routine performs:

```text
INSERT ar_source_incidents
ON CONFLICT (incident_key) DO UPDATE ...
```

and then inserts Source→Incident links.

This means a generic approval with:

```text
incident_action = create_new
```

must not be executed by blindly forwarding only `incident_key` to that routine. If the key appears between approval and execution, the current routine can reuse the existing Incident instead of enforcing `create_new` semantics.

Historical 15.8P mitigated this with runner prechecks because the exact execution was one-shot. A generic governed path needs an atomic execution guard in a later phase.

That later execution concern is explicitly **out of scope for 15.9P**.

---

## 4. Public Problem authority remains separate

Repository history proves that Incident persistence is intentionally separated from Public Problem/publication authority:

```text
15.8P  explicit approved Incident persistence
  ↓
15.8Q  read-only Canonical Problem draft gate
  ↓
15.8R  Canonical Problem draft persistence only
  ↓
15.8S / S-X  publication-grade Evidence readiness
  ↓
15.8T  Public Evidence persistence only
  ↓
15.8U  read-only publication curator packet
  ↓
15.8V  explicit publication execution
```

Therefore a durable 15.9P curator Incident decision must not carry:

```text
problem_signature authority
Canonical Problem persistence authority
Public Evidence authority
publication authority
```

Those remain downstream governed decisions.

---

## 5. Recommended Phase 15.9P scope

### 5.1 Purpose

Persist exactly what a curator explicitly decided after reviewing a valid 15.9O packet, while binding that decision to the exact durable Formation/context/evidence authority that was reviewed.

### 5.2 Input authority

Required:

```text
explicit sourceSignalId
explicit formationAssessmentId
explicit curator identity
explicit decision fields
```

Forbidden:

```text
latest Formation row inference
latest eligible Source selection
LLM-generated approval
automatic incident_action inference
client-supplied integrity hashes treated as authority
```

### 5.3 Runtime verification before recording a decision

The decision write service should rebuild/validate the 15.9O packet server-side from the explicit Formation assessment before recording the decision.

That gives the write path the same fail-closed checks:

```text
Formation row belongs to Source
status = resolved
formation_state = eligible
current context SHA/length = durable Formation authority
reconstructed quote SHA/length = durable evidence authority
Source has no downstream Incident/Public Evidence assignment
```

The client submits the decision, not the context/evidence authority.

---

## 6. Proposed durable authority

Recommended new private append-only table:

```text
ar_source_incident_curator_decisions
```

Recommended minimal columns:

```text
id uuid PK

decision_schema_version text NOT NULL
decision_packet_version text NOT NULL

formation_assessment_id uuid NOT NULL
source_signal_id uuid NOT NULL

reviewed_context_content_sha256 text NOT NULL
reviewed_context_char_count integer NOT NULL
reviewed_evidence_quote_sha256 text NOT NULL
reviewed_evidence_quote_char_count integer NOT NULL

evidence_decision text NOT NULL
incident_action text NULL
existing_incident_id uuid NULL
new_incident_key text NULL
new_incident_label text NULL
decision_reason text NULL

incident_persistence_authorized boolean NOT NULL

decided_by_curator_user_id uuid NOT NULL
decided_at timestamptz NOT NULL
created_at timestamptz NOT NULL
```

### 6.1 Required foreign keys

```text
formation_assessment_id
→ ar_source_formation_assessments.id ON DELETE RESTRICT

source_signal_id
→ ar_source_signals.id ON DELETE RESTRICT

existing_incident_id
→ ar_source_incidents.id ON DELETE RESTRICT

approved/decided curator
→ ar_radar_curators.user_id ON DELETE RESTRICT
```

The Formation row already carries Source Admission lineage; the decision table must not duplicate the full Formation semantic payload.

### 6.2 Privacy boundary

Do not persist in this decision table:

```text
full source body
canonical URL
author handle
raw evidence quote
provider request ID
```

Persist only the hashes/counts required to bind the human decision to the reviewed integrity authority.

---

## 7. Decision vocabulary and shape constraints

Recommended normalized vocabulary:

```text
evidence_decision:
  accept | reject

incident_action when evidence is accepted:
  create_new | reuse_existing | hold
```

Shape rules:

### Reject

```text
evidence_decision = reject
incident_action = NULL
existing_incident_id = NULL
new_incident_key = NULL
new_incident_label = NULL
incident_persistence_authorized = false
```

### Accept + hold

```text
evidence_decision = accept
incident_action = hold
existing_incident_id = NULL
new_incident_key = NULL
new_incident_label = NULL
incident_persistence_authorized = false
```

This preserves the historical 15.8P singleton/hold concept without inventing an Incident.

### Accept + create_new

```text
evidence_decision = accept
incident_action = create_new
existing_incident_id = NULL
new_incident_key = non-empty
incident_persistence_authorized = true
```

At decision-record time the proposed key must not already exist.

A later execution phase must recheck this atomically; the precheck alone is not execution authority.

### Accept + reuse_existing

```text
evidence_decision = accept
incident_action = reuse_existing
existing_incident_id = existing Incident
new_incident_key = NULL
new_incident_label = NULL
incident_persistence_authorized = true
```

The chosen Incident must exist in the current comparison authority when the decision is recorded.

---

## 8. Immutability and cardinality

15.9P should be append-only/private, following the Phase 15.9N authority pattern:

```text
service_role SELECT = allowed
service_role INSERT = allowed
UPDATE = forbidden
DELETE = forbidden
RLS = enabled
browser direct write = forbidden
```

For the narrow first generic contract:

```text
UNIQUE(formation_assessment_id)
```

is recommended.

One exact Formation assessment receives at most one final curator Incident decision.

Decision correction/revocation is not silently represented by UPDATE. If future operations require revision, a separately governed supersession/revocation model should be introduced rather than mutating the original audit row.

---

## 9. Required insert guard

A DB trigger/RPC guard should reject decision insertion unless:

```text
Formation assessment exists
Formation source_signal_id = decision source_signal_id
Formation status = resolved
Formation resolved = true
Formation formation_state = eligible
Formation context/evidence hashes and lengths = reviewed hashes and lengths
Source is outside Blind evaluation
Source has no Source→Incident link
Source has no Public Evidence assignment
decided_by_curator_user_id exists in ar_radar_curators
```

Action-specific guards must also enforce the shape rules in section 7.

For `reuse_existing`, the selected Incident must exist.

For `create_new`, the proposed `incident_key` must be absent at insert time.

---

## 10. Recommended write RPC and API boundary

Recommended DB write surface:

```text
ar_record_source_incident_curator_decision(...)
```

Properties:

```text
SECURITY DEFINER
ar_require_radar_curator(curator_user_id)
service_role execute only
one decision-row INSERT only
no Incident mutation
no Source→Incident link mutation
no Public Problem/Public Evidence/Public Feed mutation
```

Recommended curator API:

```text
POST /api/radar/admin/source-signals/:signalId/incident-decisions
```

Body should carry:

```text
formationAssessmentId
evidenceDecision
incidentAction
existingIncidentId | newIncidentKey/newIncidentLabel
decisionReason
```

The server must derive and verify integrity metadata from the explicit Formation assessment/current 15.9O packet. The client must not be allowed to assert reviewed hashes as trusted authority.

---

## 11. Phase 15.9P live verification boundary

When implementation is separately authorized, the controlled live target may be the single current 15.9N Formation assessment.

But the live mutation budget must be:

```text
ar_source_incident_curator_decisions: 0 → 1 only

ar_source_incidents: unchanged
ar_source_incident_links: unchanged
ar_public_problems: unchanged
ar_public_problem_evidence_snapshots: unchanged
ar_public_problem_feed: unchanged
all other protected domains: unchanged
model calls: 0
```

A live approval cannot be fabricated merely to test persistence. The live row requires a real explicit curator decision supplied through the governed decision surface.

If no curator decision has been supplied, implementation may be structurally verified without a production decision-row insertion and the phase must remain not-live-closed.

---

## 12. What follows 15.9P

Only after a durable row exists with:

```text
incident_persistence_authorized = true
```

may a later governed phase consider Incident execution.

Recommended next boundary after 15.9P:

```text
15.9Q — Approved Incident Decision Execution
```

That later phase should consume an **explicit curatorDecisionId**, never `latest approved`, and atomically enforce the approved action semantics.

For example:

```text
create_new
→ fail if approved key now exists
→ create exactly one new Incident
→ bind Source exactly once

reuse_existing
→ require exact approved existing_incident_id
→ bind Source exactly once
```

The execution phase should also establish durable lineage from the Incident/Source link back to the consumed decision authority rather than relying only on `linked_by_curator_user_id`.

Exact execution schema is intentionally not frozen in 15.9P design.

---

## 13. Answers to the handoff investigation questions

### 1. Can the existing 15.8P approval schema be reused generically?

**Vocabulary: yes. Implementation: no.**

The decision fields are reusable. The 15.8P code is fixed-cohort/fixed-hash/fixed-key execution authority and must remain historical.

### 2. Is there already a durable approval table?

**No.**

Current production has `ar_source_incidents` and `ar_source_incident_links`, but no generic Incident approval/decision table.

### 3. Is an approval audit trail required before generic Incident persistence?

**Yes.**

15.9O deliberately persists no decision, while the current Incident RPCs do not consume approval identity. A durable decision layer is the missing authority boundary.

### 4. What is the current Incident dedupe/key authority?

```text
curator-supplied incident_key
+ UNIQUE(incident_key)
+ UNIQUE(source_signal_id) on Source→Incident links
```

No semantic model or Formation proposal automatically establishes Incident identity.

### 5. Is Public Problem promotion separated from Incident formation?

**Yes, strongly.**

Historical 15.8P→Q→R→S/T→U→V demonstrates separate Incident, Canonical draft, Evidence, publication-decision, and publication-execution authorities.

---

## 14. Design conclusion

The narrow next phase is:

```text
Phase 15.9P
Durable Curator Incident Decision Authority
```

Its only new durable authority should be:

```text
validated 15.9O packet
+ explicit curator decision
→ append-only private curator decision row
```

It must end before:

```text
Incident creation
Incident reuse/link mutation
problem_signature authority
Canonical/Public Problem mutation
Public Evidence mutation
publication
```

Therefore the correct continuation is:

```text
15.9O CLOSED
→ 15.9P durable explicit curator decision
→ later 15.9Q controlled Incident execution
```

and not:

```text
Formation eligible
→ automatic Incident persistence
```
