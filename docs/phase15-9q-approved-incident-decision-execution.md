# Phase 15.9Q — Approved Incident Decision Execution

## Status

**CLOSED / PRODUCTION EXECUTION VERIFIED**

Phase 15.9Q consumes one **explicit durable Phase 15.9P curator decision ID** and executes only its already-approved Incident action.

It does not infer the latest decision, re-evaluate the Formation, choose a different Incident identity, persist Public Evidence, mutate a Public Problem, or publish anything.

```text
Formation assessment
→ durable curator decision
→ exact decision execution
→ Incident + exact Source link
```

---

## 1. Implementation authority

Implementation PR:

```text
PR #158
exact head:
bfbbac67a24c745a2387110e47ac4c1b0d24f322

CI #520:  SUCCESS
PIE #146: SUCCESS
```

Expected-head squash merge produced implementation main:

```text
2a1b9659495a4752188263cea063f1ce4249a8b3
```

Merged-main verification:

```text
CI #521: SUCCESS
```

---

## 2. Input authority

The execution API accepts the decision identity from the route path only:

```text
POST /api/radar/admin/source-incident-decisions/:decisionId/execute
```

The server derives the current curator identity through `requireRadarCurator()`.

The service requires an explicit `decisionId` and invokes exactly:

```text
ar_execute_source_incident_curator_decision(
  p_curator_user_id,
  p_curator_decision_id
)
```

There is no `latest`, `order by decided_at`, or Formation-eligible fallback path.

---

## 3. Production migration authority

Migration 041:

```text
041_source_incident_decision_execution.sql
```

Production migration ledger:

```text
20260828020155 source_incident_decision_execution
```

It adds durable decision lineage to the affected Incident domain:

```text
ar_source_incidents.created_from_curator_decision_id
ar_source_incident_links.curator_decision_id
```

Existing historical rows may remain null. Any 15.9Q-created Incident/link carries the exact durable decision ID.

It also creates the private append-only execution ledger:

```text
ar_source_incident_decision_executions
```

Production schema readback confirmed:

```text
RLS enabled
service_role SELECT = true
service_role INSERT/UPDATE/DELETE = false
anon SELECT/INSERT = false
authenticated SELECT/INSERT = false
execution RPC: service_role EXECUTE = true
execution RPC: anon/authenticated EXECUTE = false
append-only UPDATE/DELETE blocker trigger present
UNIQUE(curator_decision_id) present
UNIQUE(source_signal_id) present
UNIQUE(incident_id, source_signal_id) present
Incident decision-lineage column/index present
Source→Incident decision-lineage column/index present
```

One decision may execute at most once, and one Source may receive at most one 15.9Q execution.

---

## 4. Atomic execution guards

The RPC locks the exact durable decision row with `FOR UPDATE`, then requires:

```text
evidence_decision = accept
incident_action = create_new | reuse_existing
incident_persistence_authorized = true
no prior execution for the decision
Source is not in Blind evaluation
Source has no existing Incident link
Source has no Public Evidence assignment
```

### create_new

The RPC re-checks the approved `new_incident_key` at execution time.

If that key already exists, execution fails closed:

```text
Approved create_new Incident key is no longer unused; reapproval is required
```

It never reinterprets `create_new` as reuse. On success it creates exactly one Incident using the approved key/label and records the exact decision ID on the Incident.

### reuse_existing

The RPC resolves only the exact `existing_incident_id` frozen in the durable decision. If it no longer exists, execution fails and requires reapproval.

On either action, it creates exactly one Source→Incident link carrying the exact decision ID and appends exactly one execution-ledger row. All mutations occur in one PostgreSQL function statement and roll back atomically on failure.

---

## 5. Executed durable authority

Consumed Phase 15.9P decision:

```text
decision_id:
b58973c3-92ed-4a4a-ad1b-07780881e961

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

Immediately before execution, independent readback confirmed:

```text
execution rows for decision = 0
approved Incident key rows = 0
target Source→Incident links = 0
target Source Public Evidence rows = 0
```

The decision was then executed exactly once using the explicit decision ID. No latest-row inference or model call was involved.

Execution result:

```text
execution_id:
359cb85e-66a8-48a0-9e53-07281445e17f

incident_id:
35c243aa-2e9d-41de-805c-08ac40ccc338

source_incident_link_id:
7c7d22f3-b59f-40ce-ae79-db5eadddf050

incident_action = create_new
executed_at = 2026-08-28 02:02:55.00698+00
```

---

## 6. Independent production readback

Before the live execution:

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
Incident executions           0
```

After the live execution:

```text
Source Signals            3562
Source Observations       3892
Source Ingestion Runs      144
Raw Inputs                  10
Pain Evidences              27
Source Incidents             7
Source→Incident links         8
Public Problems               3
Public Evidence               7
Public Feed                   3
Full-context Outcomes        85
Formation assessments         1
Curator Incident decisions    1
Incident executions           1
```

Therefore the only data mutations were the authorized 15.9Q mutations:

```text
Source Incidents              6 → 7
Source→Incident links          7 → 8
Incident decision executions  0 → 1
```

All upstream counts and all Public surface counts remained unchanged.

Exact lineage readback confirmed:

```text
Incident key = carrier_csc_feature_restriction_case
Incident label = 통신사 CSC 변경 후 전용 기능 제한 사례
Incident.created_from_curator_decision_id = b58973c3-92ed-4a4a-ad1b-07780881e961

Link.source_signal_id = 42fe1c20-62b0-454b-88b2-61d9e1554c12
Link.incident_id = 35c243aa-2e9d-41de-805c-08ac40ccc338
Link.curator_decision_id = b58973c3-92ed-4a4a-ad1b-07780881e961

Execution.curator_decision_id = b58973c3-92ed-4a4a-ad1b-07780881e961
Execution.source_signal_id = 42fe1c20-62b0-454b-88b2-61d9e1554c12
Execution.incident_id = 35c243aa-2e9d-41de-805c-08ac40ccc338
Execution.incident_action = create_new
```

Target Source Public Evidence rows remained `0`. Model calls were `0` by construction.

---

## 7. Advisor review

Post-migration Supabase security and performance advisors were run.

For the new execution authority:

```text
no anon/authenticated SECURITY DEFINER exposure was reported for
ar_execute_source_incident_curator_decision

RLS-enabled/no-policy is reported as INFO for the private execution ledger;
this is intentional because direct table access is revoked and writes are RPC-only

no unindexed-FK finding was reported for the new 15.9Q foreign keys
```

The advisor output still contains pre-existing repository-wide security warnings for other SECURITY DEFINER functions and existing INFO findings for RLS/no-policy, unindexed foreign keys, and unused indexes. Those are not introduced by the 15.9Q execution path and are outside this phase's mutation scope.

References:
- Supabase RLS/no-policy advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Supabase SECURITY DEFINER exposure advisor: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Supabase unindexed-FK advisor: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

---

## 8. Public boundary / downstream authority

Phase 15.9Q is now **CLOSED**.

This phase did not authorize or perform:

```text
Public Problem creation or mutation
Public Evidence persistence
Public Feed mutation
publication
```

The newly created Incident is durable internal Incident authority only. Any promotion toward a Public Problem/Evidence/Feed surface requires a separate downstream phase and explicit authority; it must not be inferred from the Phase 15.9P curator approval or this Phase 15.9Q execution.
