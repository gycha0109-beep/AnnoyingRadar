# Phase 15.9W — Approved Existing Incident Reuse

## Status

**IMPLEMENTATION IN REVIEW / LIVE DECISION+EXECUTION NOT EXECUTED**

Phase 15.9V closed with one exact recovered Formation for the second CSC Source:

```text
status = resolved
formation_state = eligible
reason = formation_grounded_external_friction
context SHA256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context chars = 3035
evidence SHA256 = 159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
evidence chars = 44
evidence grounded = true
```

The human curator has now explicitly approved reusing the existing Incident:

```text
incident_key = carrier_csc_feature_restriction_case
label = 통신사 CSC 변경 후 전용 기능 제한 사례
approved action = accept + reuse_existing
```

This approval authorizes only a durable Incident curator decision and its exact Source→Incident execution. It does not authorize Public Problem, Public Evidence, feed, or publication mutation.

---

## 1. Existing authority reused without schema change

No new migration or privileged RPC is introduced.

Phase 15.9W reuses the already-verified contracts from Phase 15.9P/Q:

```text
recordCuratorIncidentDecision(...)
ar_record_source_incident_curator_decision(...)
executeApprovedIncidentDecision(...)
ar_execute_source_incident_curator_decision(...)
```

The durable decision must be written and independently read back before its exact decision id may be passed into execution.

The execution RPC supports `reuse_existing` directly and does not create a new Incident row.

---

## 2. Exact binding

The runner resolves the Source only by the exact second-CSC Source hash pair and resolves the Formation only by:

```text
assessment batch = phase15.9v-exact-csc-evidence-grounding-recovery-v0.1
status = resolved
formation_state = eligible
context hash/count = exact 15.9V authority
evidence hash/count = exact 15.9V authority
evidence grounded = true
```

The existing Incident is resolved only by the explicitly approved exact incident key and must resolve uniquely with the expected label.

No latest-row inference is allowed.

---

## 3. Current-context curator packet gate

Before writing the durable decision, the existing curator decision packet service fetches the current full post and requires it to match the exact Formation authority:

```text
full_post
untruncated
3035 characters
SHA256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
```

It reconstructs the 44-character evidence by durable offsets and requires the reconstructed quote hash to remain:

```text
159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
```

Thus the human approval is not applied to drifted source content.

No model call is authorized.

---

## 4. Durable decision

The only accepted decision shape is:

```text
evidence_decision = accept
incident_action = reuse_existing
existing_incident = carrier_csc_feature_restriction_case
incident_persistence_authorized = true
```

The runner rejects any prior curator decision for the exact Formation and independently reads back the newly written decision before continuing.

At that point the Source must still have zero Incident links. A durable decision alone is not treated as execution.

---

## 5. Exact execution

The runner passes only the exact newly persisted decision id into the existing execution service.

The database execution contract then rechecks:

```text
explicit decision exists
decision = accept + reuse_existing
persistence authorized = true
execution does not already exist
Source is outside Blind evaluation
Source has no Incident link
Source has no Public Evidence assignment
approved existing Incident still exists
```

It then atomically appends:

```text
one ar_source_incident_links row
one ar_source_incident_decision_executions row
```

The existing Incident row is reused and no new Incident is created.

---

## 6. Expected production deltas

Current closed baseline:

```text
Source Incidents = 7
Source→Incident links = 8
curator Incident decisions = 1
Incident executions = 1
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

Successful 15.9W execution must produce exactly:

```text
Source Incidents = 7          unchanged
Source→Incident links = 9     +1
curator Incident decisions = 2 +1
Incident executions = 2       +1
Public Problems = 3            unchanged
Public Evidence = 7            unchanged
Public Feed = 3                unchanged
```

The exact second CSC Source must end with exactly one Source→Incident link and zero Public Evidence rows.

---

## 7. Live gate

The temporary live workflow may execute only after:

```text
exact PR-head CI = SUCCESS
PIE = SUCCESS
expected-head merge = complete
merged-main CI = SUCCESS
```

The workflow checks out the exact merged-main SHA reported by the successful CI workflow run.

After live execution and independent Supabase readback, the workflow must be removed in a closeout PR.

---

## 8. Authority boundary after success

A successful 15.9W closes the second Source into the existing internal Incident.

It still does **not** authorize:

```text
Public Problem creation or mutation
Public Evidence persistence
Public Feed mutation
publication
```

Any later public promotion remains a separate explicit curator authority transition.
