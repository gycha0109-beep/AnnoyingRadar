# Phase 15.9P — Durable Curator Incident Decision Authority

## Status

**IMPLEMENTED / PRODUCTION SCHEMA VERIFIED / EXPLICIT CURATOR DECISION PENDING**

Phase 15.9P implements the generic durable authority layer between the closed Phase 15.9O read-only packet and any later Incident execution.

It records only an explicit curator decision. It does not create or reuse an Incident, create a Source→Incident link, persist Public Evidence, mutate a Canonical/Public Problem, or publish anything.

```text
Formation eligible ≠ curator approval
curator packet ≠ curator approval
curator approval ≠ Incident mutation
Incident ≠ Public Problem publication
```

Phase 15.9P is **not CLOSED** because no curator decision has been supplied or persisted. The production schema is ready and verified with zero decision rows.

---

## 1. Implementation authority

Implementation PR:

```text
PR #155
corrected exact head:
5d340d674ef17f2b688598e3258e4a19b30ac232

CI #514:  SUCCESS
PIE #143: SUCCESS
```

The first CI attempt, CI #513, exposed only a contract-test indexing error: the static ordering test matched the earlier `validateDecisionAgainstPacket` function definition rather than the later call site. Production migration/service/route logic was unchanged; the corrected head changed exactly one test line.

Expected-head merge produced authoritative implementation main:

```text
3a18b4d77af7cae16006df0dff40f05f853ba78d
```

Merged-main verification:

```text
CI #515: SUCCESS
```

---

## 2. Implemented surface

Migration:

```text
040_source_incident_curator_decisions.sql
```

Private append-only table:

```text
ar_source_incident_curator_decisions
```

Write RPC:

```text
ar_record_source_incident_curator_decision(...)
```

Curator API:

```text
POST /api/radar/admin/source-signals/:signalId/incident-decisions
```

Service:

```text
recordCuratorIncidentDecision(...)
```

The write service requires explicit `sourceSignalId` and `formationAssessmentId`, rebuilds the Phase 15.9O packet server-side, verifies current context/evidence integrity and current Incident authority, then permits exactly one curator-decision row write.

Client-supplied context/evidence hashes are not accepted as authority. The reviewed hashes/counts written to the decision row are derived from the server-validated Formation packet.

---

## 3. Durable decision contract

One exact Formation assessment may receive at most one final decision:

```text
UNIQUE(formation_assessment_id)
```

Decision vocabulary:

```text
evidence_decision = accept | reject

accepted evidence:
  incident_action = create_new | reuse_existing | hold
```

Persistence authorization is derived, not client supplied:

```text
reject                  → false
accept + hold           → false
accept + create_new     → true
accept + reuse_existing → true
```

`incident_persistence_authorized = true` is only downstream execution authority. Phase 15.9P itself still performs zero Incident writes.

---

## 4. Database guards

Insertion fails closed unless:

```text
Formation assessment exists
Formation belongs to exact Source
Formation is resolved + eligible
reviewed context SHA/length matches Formation
reviewed evidence SHA/length matches Formation
Formation evidence is grounded
Source is outside Blind evaluation
Source has no Incident link
Source has no Public Evidence assignment
curator exists and is Radar-authorized
```

Action-specific guards:

```text
create_new
  → proposed incident_key must be absent at decision-record time

reuse_existing
  → exact existing Incident must exist

hold / reject
  → no Incident identity fields allowed
```

A later Incident execution phase must repeat `create_new`/`reuse_existing` preconditions atomically. The 15.9P record-time check alone never mutates Incident authority.

---

## 5. Production migration authority

Migration 040 was applied only after PR exact-head CI/PIE, expected-head merge, and merged-main CI all succeeded.

Supabase migration ledger:

```text
20260828005305 source_incident_curator_decisions
```

Production table readback:

```text
ar_source_incident_curator_decisions = exists
rows = 0
RLS = enabled
```

Privileges:

```text
service_role:
  SELECT = true
  INSERT = true
  UPDATE = false
  DELETE = false

anon:
  SELECT = false
  INSERT = false

authenticated:
  SELECT = false
  INSERT = false
```

Write RPC privilege:

```text
ar_record_source_incident_curator_decision(...)
service_role execute = true
anon execute = false
authenticated execute = false
```

Production trigger readback confirmed both:

```text
ar_trg_guard_source_incident_curator_decision
  BEFORE INSERT

ar_trg_block_source_incident_curator_decision_mutation
  BEFORE UPDATE OR DELETE
```

Production constraint readback confirmed:

```text
ar_source_incident_curator_decisions_unique_formation
  UNIQUE (formation_assessment_id)

ar_source_incident_curator_decisions_shape_check
  reject / hold / create_new / reuse_existing authority shapes
```

---

## 6. Append-only and privacy boundary

A mutation-blocking trigger rejects UPDATE/DELETE attempts even independently of table grants.

The decision table does not persist:

```text
full source body
canonical URL
author handle
raw evidence quote
provider request ID
```

It stores only reviewed integrity hashes/counts plus the explicit decision.

---

## 7. Zero-downstream-mutation production readback

Pre-migration protected counts:

```text
Source Signals           3562
Source Observations      3892
Source Ingestion Runs     144
Raw Inputs                 10
Pain Evidences             27
Source Incidents            6
Source→Incident links        7
Public Problems              3
Public Evidence              7
Public Feed                  3
Full-context Outcomes       85
Formation assessments        1
```

Post-migration independent readback:

```text
Source Signals           3562
Source Observations      3892
Source Ingestion Runs     144
Raw Inputs                 10
Pain Evidences             27
Source Incidents            6
Source→Incident links        7
Public Problems              3
Public Evidence              7
Public Feed                  3
Full-context Outcomes       85
Formation assessments        1
Curator Incident decisions   0
```

Therefore migration 040 introduced schema authority only:

```text
Incident writes = 0
Source→Incident link writes = 0
Public Problem writes = 0
Public Evidence writes = 0
Public Feed writes = 0
curator decision writes = 0
```

---

## 8. Live decision boundary

The implementation must not fabricate a curator decision for verification.

A live row requires real explicit decision fields supplied by a curator. Current durable state remains:

```text
Formation assessments = 1
resolved eligible Formation assessments = 1
curator Incident decisions = 0
```

When a real decision is supplied, the authorized live mutation budget is exactly:

```text
ar_source_incident_curator_decisions +1
```

with all of the following unchanged:

```text
ar_source_incidents
ar_source_incident_links
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
all other protected domains
```

Model calls remain zero.

Until that explicit decision is supplied and persisted/read back, Phase 15.9P remains **PENDING LIVE CURATOR DECISION**, not CLOSED.

---

## 9. Downstream boundary

Only after a durable row exists with:

```text
incident_persistence_authorized = true
```

may a later phase consume an explicit curator decision ID and consider Incident execution.

Proposed downstream phase:

```text
15.9Q — Approved Incident Decision Execution
```

15.9Q must never infer the latest approved decision and must never reinterpret `Formation eligible` as approval.
