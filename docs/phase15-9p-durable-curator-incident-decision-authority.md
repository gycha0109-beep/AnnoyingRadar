# Phase 15.9P — Durable Curator Incident Decision Authority

## Status

**CLOSED / LIVE CURATOR DECISION VERIFIED**

Phase 15.9P implements and has now exercised the durable authority boundary between the closed Phase 15.9O read-only packet and any later Incident execution.

It records only an explicit curator decision. It does not create or reuse an Incident, create a Source→Incident link, persist Public Evidence, mutate a Canonical/Public Problem, or publish anything.

```text
Formation eligible ≠ curator approval
curator packet ≠ curator approval
curator approval ≠ Incident mutation
Incident ≠ Public Problem publication
```

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

Production-schema verification closeout was merged through PR #156 and produced current pre-live-decision main:

```text
adf221bb73f1744246e7f785bcb5f798f1e67e96
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

`incident_persistence_authorized = true` is only downstream execution authority. Phase 15.9P itself performs zero Incident writes.

---

## 4. Production schema authority

Supabase migration ledger:

```text
20260828005305 source_incident_curator_decisions
```

Production verification confirmed:

```text
RLS enabled
service_role SELECT/INSERT = true
service_role UPDATE/DELETE = false
anon/authenticated table access = false
RPC execute: service_role only
append-only UPDATE/DELETE blocker present
Formation/source/integrity guard present
UNIQUE(formation_assessment_id) present
decision-shape CHECK present
```

The table stores reviewed hashes/counts plus decision authority only. It does not store raw source body, canonical URL, author handle, raw evidence quote, or provider request ID.

---

## 5. Explicit live curator decision

The human curator explicitly approved the eligible telecom Formation for a new Incident.

Durable decision identity:

```text
decision_id:
b58973c3-92ed-4a4a-ad1b-07780881e961

formation_assessment_id:
f90fb17a-c2c8-4b0e-89c1-fc2487ffc99e

source_signal_id:
42fe1c20-62b0-454b-88b2-61d9e1554c12

evidence_decision = accept
incident_action = create_new
incident_persistence_authorized = true

new_incident_key:
carrier_csc_feature_restriction_case

new_incident_label:
통신사 CSC 변경 후 전용 기능 제한 사례
```

Reviewed integrity authority exactly matches the durable Formation:

```text
context_sha256:
4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463
context_char_count = 3407

evidence_sha256:
fafd5798cf5e8cc9ffb82507d550163fd84202f4d9430c053906727cef4a775c
evidence_char_count = 44
```

The decision was recorded by the existing Radar curator identity and is append-only.

---

## 6. Live execution note

The first manual SQL invocation used PostgreSQL composite expansion syntax:

```sql
select (public.ar_record_source_incident_curator_decision(...)).*;
```

Because the RPC is volatile and returns a composite row, field expansion caused repeated function evaluation inside the same statement. The second evaluation hit the Formation uniqueness constraint. PostgreSQL rolled back the entire statement; independent readback confirmed the decision table still contained zero rows and no downstream table changed.

The authoritative invocation then called the RPC exactly once using:

```sql
select *
from public.ar_record_source_incident_curator_decision(...);
```

That statement succeeded and produced the single durable decision above. The failed statement is not part of durable authority.

---

## 7. Independent production readback

Immediately before the successful live decision:

```text
Source Signals            3562
Source Observations       3892
Source Ingestion Runs      144
Raw Inputs                  10
Pain Evidences              27
Source Incidents             6
Source→Incident links         7
Public Problems               3
Public Evidence               7
Public Feed                   3
Full-context Outcomes        85
Formation assessments         1
Curator Incident decisions    0
```

After the successful live decision:

```text
Source Signals            3562
Source Observations       3892
Source Ingestion Runs      144
Raw Inputs                  10
Pain Evidences              27
Source Incidents             6
Source→Incident links         7
Public Problems               3
Public Evidence               7
Public Feed                   3
Full-context Outcomes        85
Formation assessments         1
Curator Incident decisions    1
```

Target readback also confirmed:

```text
exact approved decision rows for decision_id = 1
target Source→Incident links                 = 0
target Source Public Evidence assignments    = 0
```

Therefore the only authorized live mutation was:

```text
ar_source_incident_curator_decisions 0 → 1
```

No Incident, link, Public Problem, Public Evidence, or feed mutation occurred. Model calls were zero.

---

## 8. Downstream authority

Phase 15.9P is now **CLOSED**.

The exact durable decision above authorizes the next governed phase:

```text
15.9Q — Approved Incident Decision Execution
```

15.9Q must consume the explicit decision ID `b58973c3-92ed-4a4a-ad1b-07780881e961`; it must never infer a latest approved decision.

For this `create_new` decision, execution must atomically re-check that the approved Incident key is still absent. If the key now exists, execution must fail rather than silently reuse it. The exact Source must still be unlinked. The resulting Incident/link must preserve durable lineage back to this decision authority.

15.9Q may create the approved Incident and its exact Source→Incident link only. Public Problem persistence, Public Evidence persistence, feed mutation, and publication remain outside its authority.
