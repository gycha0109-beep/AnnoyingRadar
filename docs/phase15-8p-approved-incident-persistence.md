# Phase 15.8P — Approved Incident Persistence

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.8P consumes the explicit curator approval issued after Phase 15.8O and persists only the two approved lodging Incident identities.

It does not create a Canonical Problem, Public Evidence, or publication state.

---

## 1. Upstream authority

Phase 15.8O closed with a read-only curator packet over the exact M-B Candidate 8 cohort.

The subsequently approved decisions are:

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

The eight-source M-B Candidate fingerprint remains:

```text
aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020
```

The public repository stores only SHA-256 hashes for the two approved Source identities. Raw Source Signal UUIDs are resolved only at runtime from the durable M-B cohort.

---

## 2. Exact persistence scope

Only two Sources may mutate Incident authority.

Approved stable Incident identities:

```text
yeogieottae_reservation_fulfillment_gap_case
  label: 여기어때 해외숙소 예약 누락·대체숙소 보상 사건

agoda_reservation_fulfillment_gap_case
  label: 아고다 숙소 예약 미반영·환불 보상 사건
```

These are intentionally distinct from the existing historical Incident identities:

```text
yeogieottae_exception_case
agoda_exception_case
```

The existing cases concern exception cancellation/refund coordination. The new cases concern a gap between intermediary booking confirmation and actual lodging reservation/fulfillment.

No existing Incident is reused.

---

## 3. Approved problem mechanism

The curator-approved shared mechanism is:

```text
lodging_reservation_fulfillment_gap
```

Phase 15.8P does not introduce a new database table for `problem_signature`.

The existing Phase 15.6 Formation contract treats `problem_signature` as curator-confirmed input to `buildIncidentAwareProblemClusters()` rather than persisted Incident identity.

After the two Incident identities are persisted, Phase 15.8P reconstructs the approved two-source cluster and requires:

```text
source_count     = 2
incident_count   = 2
repeat_eligible  = true
```

This establishes governed repeated-mechanism authority for the next Canonical Problem Draft Gate. It does not itself create that draft.

---

## 4. Atomic registration

The existing `ar_register_source_incident()` RPC operates on one Incident at a time. Calling it twice from a client could leave a partial write if the first call succeeded and the second failed.

Migration 035 adds:

```text
ar_register_source_incident_batch(
  p_curator_user_id uuid,
  p_incidents jsonb
)
```

The batch function:

- requires Radar curator authority;
- validates one to twenty Incident items;
- rejects duplicate Incident keys;
- rejects duplicate Source Signal IDs within or across batch items;
- delegates each item to the existing `ar_register_source_incident()` authority;
- runs inside one PostgreSQL function transaction;
- does not catch and suppress item failures;
- therefore commits all approved Incident registrations or rolls all of them back.

Privileges remain:

```text
public          EXECUTE false
anon            EXECUTE false
authenticated   EXECUTE false
service_role    EXECUTE true
```

---

## 5. Fail-closed live preflight

Before the single write RPC, the runner requires:

```text
M-B batch rows            = 82
Candidate                 = 8
Reject                    = 66
unresolved Review         = 8
Candidate fingerprint     = frozen 15.8O fingerprint
approved Sources          = 2
approved target Incidents = 0 existing
approved Source links     = 0 existing
```

Any drift aborts before mutation.

The current owner curator is resolved from the live `ar_radar_curators` authority rather than embedded as a source identity constant.

Live execution additionally requires:

```text
ALLOW_APPROVED_INCIDENT_PERSISTENCE=true
```

---

## 6. Expected database mutation

Exactly these counts may change:

```text
ar_source_incidents       +2
ar_source_incident_links  +2
```

All of the following must remain unchanged:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_source_full_context_resolution_outcomes
```

Expected live transition from the Phase 15.8O closeout state:

```text
Source Incidents        4 → 6
Source→Incident links   5 → 7
Public Problems         2 → 2
Public Evidence         5 → 5
Full-context Outcomes  82 → 82
```

---

## 7. Explicitly excluded decisions

The approved mobile port-out Source remains a singleton evidence supply item and is not persisted as a new Incident in this phase.

The two curator-rejected surfaces receive no persistence.

The two blocked M-B Review Sources and the Formation Reject remain untouched.

Phase 15.8P also does not mutate:

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

## 8. Workflow

Workflow:

```text
.github/workflows/source-approved-incident-persistence-15-8p.yml
```

Retained trigger after closeout:

```text
workflow_dispatch
```

Temporary one-shot live trigger:

```text
agent/phase15-8p-live-execution
```

The workflow always checks out authoritative `main` and writes only through the single batch Incident RPC.

The temporary trigger must be removed during closeout.

---

## 9. Release flow

```text
implementation branch
→ contract tests
→ implementation PR
→ exact-head CI / PIE
→ merge to main
→ merged-main CI
→ apply migration 035 to live Supabase
→ privilege / function verification
→ independent DB preflight
→ move temporary live trigger branch to exact main
→ one atomic approved Incident batch RPC
→ independent DB readback
→ approved cluster repeat_eligible verification
→ closeout PR removes temporary trigger
→ exact-head CI / PIE
→ merge closeout
→ merged-main CI
→ Phase 15.8P CLOSED
```

---

## 10. Downstream boundary

After successful Phase 15.8P persistence, the following will be authorized facts:

```text
two new curator-approved independent Incident identities exist
both approved Sources are bound one-to-one to those Incidents
both Incidents share approved problem_signature lodging_reservation_fulfillment_gap
that cluster is repeat_eligible under the existing Formation contract
```

The following remain **NOT AUTHORIZED** by Phase 15.8P:

```text
Canonical Problem draft persistence
Public Evidence persistence
editing either existing published lodging Problem
merging the new mechanism into lodging exception refund coordination
publication
```

The next governed phase may run the Canonical Problem Draft Gate over this exact approved repeated cluster. It must not automatically publish the resulting draft.
