# Phase 15.8P — Approved Incident Persistence

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.8P consumed the explicit curator approval issued after Phase 15.8O and persisted only the two approved lodging Incident identities.

It did **not** create or mutate a Canonical Problem, Public Evidence, or publication state.

---

## 1. Approved authority

The approved decisions were:

```text
여기어때 예약 누락
  evidence_decision = accept
  incident_action = create_new

아고다 예약 미반영
  evidence_decision = accept
  incident_action = create_new

두 Incident
  same_problem_mechanism = true
  problem_signature = lodging_reservation_fulfillment_gap

고고모바일 번호이동 제한
  evidence_decision = accept
  incident persistence = hold as singleton

배송지연 일반론
  evidence_decision = reject

법률/SEO lead-generation surface
  evidence_decision = reject
```

Frozen upstream authority:

```text
M-B batch: phase15.8m-b-remainder-v0.1
82 outcomes = Candidate 8 / Reject 66 / unresolved Review 8
Candidate fingerprint:
aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020
```

The repository stores only SHA-256 hashes for the two approved Source identities. Raw Source UUIDs are resolved at runtime from the durable M-B cohort and are not emitted in the P artifact.

---

## 2. Persisted Incident authority

Exactly two new Incident identities were authorized and persisted:

```text
agoda_reservation_fulfillment_gap_case
  label: 아고다 숙소 예약 미반영·환불 보상 사건

yeogieottae_reservation_fulfillment_gap_case
  label: 여기어때 해외숙소 예약 누락·대체숙소 보상 사건
```

Each Incident has exactly one Source Signal link.

These identities remain distinct from the pre-existing:

```text
agoda_exception_case
yeogieottae_exception_case
```

The earlier incidents concern exception cancellation/refund coordination. The new incidents concern a gap between intermediary booking confirmation and actual lodging reservation/fulfillment.

---

## 3. Approved repeated mechanism

Curator-approved problem signature:

```text
lodging_reservation_fulfillment_gap
```

The existing Formation contract does not persist `problem_signature` as Incident identity. It consumes curator-confirmed signature + Incident identity through `buildIncidentAwareProblemClusters()`.

Authoritative post-persistence reconstruction returned:

```text
source_count     = 2
incident_count   = 2
repeat_eligible  = true
```

Therefore the exact two persisted Incidents now form a governed repeated-mechanism input for a later Canonical Problem Draft Gate.

This phase does not itself create that draft.

---

## 4. Implementation authority

Implementation PR:

```text
PR #103
exact head:
320c6e49aab9377b45d6e9b2915d4d7b15ecde53

CI #392:  SUCCESS
PIE #71: SUCCESS
```

Implementation merged to authoritative main:

```text
5bb856d7841842522a74b4cef89f80dbdfbac26d
```

Merged-main verification:

```text
CI #393: SUCCESS
```

---

## 5. Atomic batch migration

Migration 035:

```text
035_atomic_source_incident_batch_registration.sql
```

Live Supabase migration record:

```text
20260826003646 atomic_source_incident_batch_registration
```

New RPC:

```text
ar_register_source_incident_batch(
  p_curator_user_id uuid,
  p_incidents jsonb
)
```

It validates one bounded batch, rejects duplicate Incident/source identities, delegates each item to the existing curator-authoritative `ar_register_source_incident()`, and performs the entire batch within one PostgreSQL function statement. Item failures are not caught or suppressed, so an error rolls back the complete batch statement.

Live privilege verification:

```text
service_role execute:  true
anon execute:          false
authenticated execute: false
```

---

## 6. Authoritative live execution

Workflow run:

```text
32915835659
```

Exact authoritative head:

```text
5bb856d7841842522a74b4cef89f80dbdfbac26d
```

Result:

```text
SUCCESS
atomic batch RPC calls:       1
Incidents created:            2
Source→Incident links created: 2
repeat_eligible:              true
```

Aggregate artifact:

```text
artifact id: 9588129710
sha256:a4ccbdbc11ed4851dafbbc4dd74d3e65eee2e72bd833eaf6c8c91ff36e383df6
```

The artifact contains aggregate authority/readback only and explicitly reports:

```text
source_signal_ids_emitted = false
canonical_problem_created = false
public_evidence_created    = false
publication_performed      = false
```

---

## 7. Database transition

Pre-live:

```text
Source Signals          3245
Observations            3537
Ingestion Runs           132
Raw Inputs                10
Pain Evidences            27
Public Problems             2
Public Evidence             5
Source Incidents            4
Source→Incident links       5
Full-context Outcomes      82
```

Post-live independent Supabase readback:

```text
Source Signals          3245
Observations            3537
Ingestion Runs           132
Raw Inputs                10
Pain Evidences            27
Public Problems             2
Public Evidence             5
Source Incidents            6
Source→Incident links       7
Full-context Outcomes      82
```

Only the authorized mutation occurred:

```text
ar_source_incidents      4 → 6
ar_source_incident_links 5 → 7
```

Independent target readback verified each new Incident has exactly one approved Source link.

---

## 8. Excluded scope remains unchanged

Phase 15.8P did not persist the approved mobile port-out singleton.

It did not mutate the two curator-rejected Sources, the blocked M-B Review Sources, or the Formation Reject.

It also did not mutate:

```text
Blind evaluation membership
Source Admission outcomes
query allocation
active resolver configuration
Pain Evidence
Public Problem state
Public Evidence
```

---

## 9. Workflow closeout

The temporary autonomous trigger:

```text
agent/phase15-8p-live-execution
```

is removed in the closeout change.

Retained trigger:

```text
workflow_dispatch
```

No autonomous second execution remains after closeout merge.

---

## 10. Downstream boundary

After Phase 15.8P, the following are authoritative:

```text
two new curator-approved independent lodging Incident identities exist
both approved Sources are bound one-to-one to those Incidents
both Incidents share approved problem_signature lodging_reservation_fulfillment_gap
that exact cluster is repeat_eligible under the existing Formation contract
```

The following remain **NOT AUTHORIZED**:

```text
Canonical Problem persistence
Public Evidence persistence
editing or merging into either existing published lodging Problem
publication
```

The next governed phase may produce a read-only Canonical Problem draft proposal from this exact repeated cluster. Persistence and publication remain separate authorities.
