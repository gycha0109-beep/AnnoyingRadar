# Phase 15.8Q — Canonical Problem Draft Gate

## Status

**IMPLEMENTED / LIVE READ-ONLY VERIFICATION NOT YET RUN**

Phase 15.8Q consumes the two curator-approved and persisted Phase 15.8P lodging Incidents and evaluates their approved repeated mechanism through the existing Phase 15.6C Canonical Problem Draft Gate.

This phase is deliberately read-only.

It does not persist a Canonical Problem, add Public Evidence, mutate either existing published Problem, or publish anything.

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

The public repository does not embed the underlying Source Signal UUIDs in the 15.8Q authority. They are resolved from the persisted Incident links at runtime.

---

## 2. Evidence-supported distinction

Phase 15.8N full-context audit established two independent first-hand lodging episodes:

- one booking intermediary presented a booking that had not actually been secured, followed by replacement-handling friction;
- in the other episode, the traveler reached the property and the reservation was absent, followed by support/refund/compensation friction.

Phase 15.8P subsequently made those two episodes curator-authoritative independent Incidents and approved one shared mechanism:

```text
lodging_reservation_fulfillment_gap
```

The existing published lodging Problem is different:

```text
숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다
```

Its trigger is a valid booking that later requires exception cancellation/refund approval.

The new mechanism begins earlier in the booking lifecycle: a platform-confirmed or apparently completed reservation is absent, unsecured, or not fulfilled by the lodging side.

Refund/support remediation can overlap, but remediation overlap does not collapse the two causal mechanisms into one Problem.

15.8Q therefore freezes the relationship as:

```text
relation = distinct_adjacent_problem
merge_authorized = false
existing_problem_mutation_authorized = false
```

---

## 3. Canonical Problem proposal

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

This wording keeps the canonical claim at the repeated mechanism actually supported by the two independent incidents. Refund and compensation are downstream consequences, not the canonical root mechanism.

---

## 4. Reused gate

15.8Q introduces no replacement formation logic.

It reuses:

```text
canonical-problem-draft-v0.1
```

through:

```text
evaluateCanonicalProblemDraft()
```

The gate must return:

```text
draft_state       = ready
reason_codes      = [draft_supported_by_independent_incidents]
source_count      = 2
incident_count    = 2
persistence_state = not_persisted
publication_state = not_published
```

The positive reason code is part of the existing Phase 15.6C gate contract; ready does not mean the reason list is empty.

Any missing Incident, duplicate Source identity, changed Incident key, or drift in the existing published lodging Problem fails closed.

---

## 5. Live runner boundary

Runner:

```text
scripts/run-canonical-problem-draft-gate-15-8q.mjs
```

The runner:

1. reads the two approved persisted Incident identities;
2. reads their Source links;
3. requires exactly one Source per Incident and two distinct Sources total;
4. reconstructs the approved repeated cluster;
5. runs the existing Canonical Draft Gate;
6. reads existing Public Problems and verifies the published exception-refund lodging Problem still exists exactly once;
7. asserts the new draft remains a distinct adjacent Problem;
8. snapshots protected database counts before and after;
9. requires exact zero mutation.

The runner contains no:

```text
rpc()
insert()
upsert()
update()
delete()
```

It performs no model calls and requires no OpenAI key.

---

## 6. Protected database state

The live read-only verification compares exact counts for:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_source_incidents
ar_source_incident_links
ar_source_full_context_resolution_outcomes
```

Every count must remain identical before and after 15.8Q.

---

## 7. Privacy boundary

The disposable artifact may contain:

```text
problem_signature
draft metadata
Incident keys
aggregate source/incident counts
SHA-256 Source-identity fingerprint
relationship to the existing lodging Problem
protected DB counts
```

It does not emit raw Source Signal UUIDs or full source bodies.

Artifact retention is one day.

---

## 8. Workflow

```text
.github/workflows/source-canonical-draft-gate-15-8q.yml
```

Temporary authoritative live trigger:

```text
agent/phase15-8q-live-execution
```

The workflow always checks out `main` explicitly.

After the one authoritative live read-only run, the temporary push trigger must be removed. The retained trigger is `workflow_dispatch` only.

---

## 9. Phase boundary

A successful 15.8Q establishes only:

```text
approved repeated cluster
→ existing canonical draft gate
→ ready Canonical Problem draft authority
```

It does not authorize:

```text
ar_create_public_problem(...)
Canonical Problem DB persistence
Public Evidence persistence
editing the existing published lodging Problem
merging the new mechanism into the existing lodging Problem
publication
```

A later governed persistence phase must separately decide whether and how to create the draft Problem and bind publication-grade Evidence without weakening the incident-aware publication contract.
