# Phase 15.9Q — Approved Incident Decision Execution

## Status

**IMPLEMENTATION IN REVIEW / PRODUCTION MIGRATION NOT APPLIED**

Phase 15.9Q consumes one **explicit durable Phase 15.9P curator decision ID** and executes only its already-approved Incident action.

It does not infer the latest decision, re-evaluate the Formation, choose a different Incident identity, persist Public Evidence, mutate a Public Problem, or publish anything.

```text
Formation assessment
→ durable curator decision
→ exact decision execution
→ Incident + exact Source link
```

---

## 1. Input authority

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

## 2. Migration authority

Migration 041:

```text
041_source_incident_decision_execution.sql
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

One decision may execute at most once:

```text
UNIQUE(curator_decision_id)
```

One Source may receive at most one 15.9Q execution:

```text
UNIQUE(source_signal_id)
```

The execution table is RLS-enabled, service-role readable, and not directly insertable/updateable/deletable by service clients. Writes occur only inside the SECURITY DEFINER execution RPC. UPDATE/DELETE are additionally blocked by trigger.

---

## 3. Atomic execution guards

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

If that key now exists, execution fails closed:

```text
Approved create_new Incident key is no longer unused; reapproval is required
```

It must never reinterpret `create_new` as reuse. On success it creates exactly one Incident using the approved key/label and records the decision ID on the Incident.

### reuse_existing

The RPC resolves only the exact `existing_incident_id` frozen in the durable decision. If it no longer exists, execution fails and requires reapproval.

On either action, it creates exactly one Source→Incident link carrying the exact decision ID and then appends exactly one execution-ledger row. All mutations are one PostgreSQL function statement; any failure rolls the statement back atomically.

---

## 4. Public boundary

Phase 15.9Q may mutate only:

```text
ar_source_incidents                     create_new only
ar_source_incident_links                +1 exact approved Source link
ar_source_incident_decision_executions  +1 execution lineage
```

It may not mutate:

```text
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
publication state
```

Model calls are zero.

---

## 5. Authorized live target after merge/migration

Phase 15.9P closed with this explicit durable decision:

```text
decision_id:
b58973c3-92ed-4a4a-ad1b-07780881e961

evidence_decision = accept
incident_action = create_new
incident_persistence_authorized = true

new_incident_key:
carrier_csc_feature_restriction_case

new_incident_label:
통신사 CSC 변경 후 전용 기능 제한 사례
```

The live target must not execute until:

```text
PR exact-head CI = SUCCESS
PIE = SUCCESS
expected-head merge = complete
merged-main CI = SUCCESS
migration 041 = applied and independently verified
```

Only then may the explicit decision ID above be passed to the execution RPC.

---

## 6. Required live verification

Before execution, snapshot all protected counts and verify:

```text
curator decisions = 1
execution rows = 0
Source Incidents = 6
Source→Incident links = 7
target Source links = 0
approved Incident key absent
```

After execution, the only expected changes for this `create_new` decision are:

```text
Source Incidents                   6 → 7
Source→Incident links              7 → 8
Incident decision executions       0 → 1
```

The durable curator decision stays exactly one row. The new Incident key/label, target Source link, and all decision lineage IDs must match the approved 15.9P row exactly.

Public Problems, Public Evidence, Public Feed, upstream Source/Observation/Formation counts, and model-call count must remain unchanged.

Until those production checks succeed, Phase 15.9Q is not CLOSED.
