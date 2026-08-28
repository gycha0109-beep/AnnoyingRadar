# Phase 15.9P — Durable Curator Incident Decision Authority

## Status

**IMPLEMENTATION IN REVIEW / PRODUCTION MIGRATION AND LIVE DECISION PENDING**

Phase 15.9P implements the generic durable authority layer between the closed Phase 15.9O read-only packet and any later Incident execution.

It records only an explicit curator decision. It does not create or reuse an Incident, create a Source→Incident link, persist Public Evidence, mutate a Canonical/Public Problem, or publish anything.

```text
Formation eligible ≠ curator approval
curator packet ≠ curator approval
curator approval ≠ Incident mutation
Incident ≠ Public Problem publication
```

## Implemented surface

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

## Durable decision contract

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
reject                 → false
accept + hold          → false
accept + create_new    → true
accept + reuse_existing→ true
```

`incident_persistence_authorized = true` is only downstream execution authority. Phase 15.9P itself still performs zero Incident writes.

## Database guards

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

## Append-only and privacy boundary

```text
RLS = enabled
service_role SELECT = allowed
service_role INSERT = allowed
UPDATE = forbidden
DELETE = forbidden
browser direct write = forbidden
```

A mutation-blocking trigger also rejects UPDATE/DELETE attempts.

The decision table does not persist:

```text
full source body
canonical URL
author handle
raw evidence quote
provider request ID
```

It stores only reviewed integrity hashes/counts plus the explicit decision.

## Current production preflight

Before migration 040:

```text
latest applied migration = source_formation_assessments
Formation assessments = 1
resolved eligible Formation assessments = 1
```

Existing curator guard privilege:

```text
ar_require_radar_curator(uuid)
service_role execute = true
anon execute = false
authenticated execute = false
```

No Phase 15.9P decision row has been created yet.

## Live boundary

The implementation must not fabricate a curator decision for verification.

A live row requires real explicit decision fields supplied by a curator. Until then the implementation may be merged and migration 040 may be applied/verified, but Phase 15.9P remains **not live-closed**.

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

## Downstream boundary

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
