# Phase 15.8Q — Canonical Problem Draft Gate

## Status

**CLOSED — 2026-08-26**

Phase 15.8Q consumed the two curator-approved and persisted Phase 15.8P lodging Incidents and evaluated their approved repeated mechanism through the existing Phase 15.6C Canonical Problem Draft Gate.

The authoritative live verification succeeded and performed zero database mutations.

No Canonical Problem was persisted. No Public Evidence was added. Neither existing published Problem was mutated. Nothing was published.

---

## 1. Upstream authority

Phase 15.8P closed with:

```text
approved independent Incidents: 2
Source→Incident links:           2
problem_signature:
  lodging_reservation_fulfillment_gap

Formation cluster:
  source_count:    2
  incident_count:  2
  repeat_eligible: true
```

Stable Incident identities:

```text
agoda_reservation_fulfillment_gap_case
yeogieottae_reservation_fulfillment_gap_case
```

The public repository does not embed the underlying Source Signal UUIDs in the 15.8Q authority. They are resolved from persisted Incident links at runtime.

---

## 2. Evidence-supported distinction

Phase 15.8N full-context audit established two independent first-hand lodging episodes:

- one booking intermediary presented a booking that had not actually been secured, followed by replacement-handling friction;
- in the other episode, the traveler reached the property and the reservation was absent, followed by support/refund/compensation friction.

Phase 15.8P subsequently made those episodes curator-authoritative independent Incidents and approved the shared mechanism:

```text
lodging_reservation_fulfillment_gap
```

The existing published lodging Problem remains:

```text
숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다
```

Its trigger is a valid booking that later requires exception cancellation/refund approval.

The new mechanism begins earlier in the booking lifecycle: a platform-confirmed or apparently completed reservation is absent, unsecured, or not fulfilled by the lodging side.

Refund/support remediation can overlap, but remediation overlap does not collapse the two causal mechanisms into one Problem.

Authoritative relationship:

```text
relation = distinct_adjacent_problem
merge_authorized = false
existing_problem_mutation_authorized = false
```

---

## 3. Canonical Problem draft authority

Problem signature:

```text
lodging_reservation_fulfillment_gap
```

Title:

```text
숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다
```

Summary:

```text
서로 다른 두 숙소 예약 사건에서 예약 중개 플랫폼을 통해 예약이 완료된 것으로 인식했지만 실제 숙소 측 예약이 확보·반영되지 않은 문제가 드러났다. 사용자는 대체 숙소, 환불·보상 처리를 별도로 진행해야 했다.
```

Target user:

```text
OTA·숙소 예약 플랫폼을 통해 숙박을 예약하는 여행자
```

Situation:

```text
플랫폼을 통해 예약이 완료·확정된 것으로 보였지만 실제 숙소 측 예약 반영 또는 이용이 정상적으로 이어지지 않은 상황
```

Category:

```text
travel_booking
```

The wording keeps the canonical claim at the repeated mechanism supported by the two independent incidents. Refund and compensation are downstream consequences, not the canonical root mechanism.

---

## 4. Reused gate result

15.8Q introduced no replacement formation logic. It reused:

```text
canonical-problem-draft-v0.1
evaluateCanonicalProblemDraft()
```

Authoritative live result:

```text
draft_state       = ready
reason_codes      = [draft_supported_by_independent_incidents]
source_count      = 2
incident_count    = 2
persistence_state = not_persisted
publication_state = not_published
```

The positive reason code is part of the existing gate contract; a ready draft does not imply an empty reason list.

---

## 5. Implementation verification

Implementation PR:

```text
PR #105
corrected exact head:
be565854bd5d57043e820290b36207551c84275a

CI #399:  SUCCESS
PIE #76: SUCCESS
```

An earlier CI attempt exposed a contract-test error in 15.8Q: the new helper had incorrectly assumed a ready draft returned no reason codes. The existing gate actually returns `draft_supported_by_independent_incidents`. The helper, tests, and documentation were corrected to the existing authority before merge.

Implementation merge:

```text
main:
b6868992e4c3210c18ed8b91a1b2e74b349c2288

merged-main CI #400: SUCCESS
```

---

## 6. Authoritative live read-only verification

Workflow run:

```text
32918063078
SUCCESS
```

Artifact:

```text
id: 9588863600
digest:
sha256:f309270d80a6c39ac825a8ad88b2f7a1db127fae3b6b43a96638441ec04011ba
```

Artifact result:

```text
authority: canonical_problem_draft_gate_read_only
version: phase15.8q-canonical-draft-gate-v0.1
problem_signature: lodging_reservation_fulfillment_gap
draft_state: ready
reason: draft_supported_by_independent_incidents
source_count: 2
incident_count: 2
relationship: distinct_adjacent_problem
source_signal_ids_emitted: false
database_mutations: 0
canonical_problem_created: false
public_evidence_created: false
existing_problem_mutated: false
publication_performed: false
```

Source identity fingerprint:

```text
5efd98e64bc7e0f2ed64e18b079793f55c2a919d2664a6c555fee4c6b5066aea
```

The artifact emitted no raw Source Signal UUIDs and no full source bodies.

---

## 7. Independent database readback

The workflow snapshot and an independent Supabase query agreed exactly:

```text
Source Signals:          3245 → 3245
Source Observations:     3537 → 3537
Source Ingestion Runs:    132 → 132
Raw Inputs:                10 → 10
Pain Evidences:            27 → 27
Public Problems:            2 → 2
Public Evidence:            5 → 5
Source Incidents:           6 → 6
Source→Incident links:      7 → 7
Full-context Outcomes:     82 → 82
```

Therefore:

```text
DB mutations = 0
```

---

## 8. Runtime boundary

The 15.8Q runner contains no:

```text
rpc()
insert()
upsert()
update()
delete()
```

It performs no model calls and requires no OpenAI key.

Any missing Incident, duplicate Source identity, changed Incident key, or drift in the existing published lodging Problem fails closed.

---

## 9. Workflow closeout

Workflow:

```text
.github/workflows/source-canonical-draft-gate-15-8q.yml
```

The temporary push trigger:

```text
agent/phase15-8q-live-execution
```

was used only for the authoritative run and removed during closeout.

Retained trigger:

```text
workflow_dispatch
```

The workflow remains read-only and always checks out authoritative `main`.

---

## 10. Phase boundary

Phase 15.8Q establishes:

```text
2 curator-approved independent lodging Incidents
→ approved repeated mechanism
→ existing canonical draft gate
→ ready Canonical Problem draft authority
```

It does **not** authorize:

```text
Canonical Problem DB persistence
Public Evidence persistence
editing the existing published lodging Problem
merging the new mechanism into the existing lodging Problem
publication
```

The next governed phase must examine draft persistence and evidence-lineage requirements separately before any write is permitted.
