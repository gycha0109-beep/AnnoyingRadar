# Phase 15.9W — Approved Existing Incident Reuse

## Status

**CLOSED — LIVE DECISION + EXECUTION VERIFIED**

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

The human curator explicitly approved reusing the existing Incident:

```text
incident_key = carrier_csc_feature_restriction_case
label = 통신사 CSC 변경 후 전용 기능 제한 사례
approved action = accept + reuse_existing
```

That exact approval has now been durably recorded and executed. No Public Problem, Public Evidence, feed, or publication mutation occurred.

---

## 1. Existing authority reused without schema change

No new migration or privileged RPC was introduced.

Phase 15.9W reused the already-verified contracts from Phase 15.9P/Q:

```text
recordCuratorIncidentDecision(...)
ar_record_source_incident_curator_decision(...)
executeApprovedIncidentDecision(...)
ar_execute_source_incident_curator_decision(...)
```

The durable decision was written and independently read back before its exact decision id was passed into execution.

The execution RPC used `reuse_existing`; no new Incident row was created.

---

## 2. Exact binding

The runner resolved the Source only by the exact second-CSC Source hash pair and resolved the Formation only by:

```text
assessment batch = phase15.9v-exact-csc-evidence-grounding-recovery-v0.1
status = resolved
formation_state = eligible
context SHA256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context chars = 3035
evidence SHA256 = 159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
evidence chars = 44
evidence grounded = true
```

The existing Incident resolved uniquely as:

```text
Incident id = 35c243aa-2e9d-41de-805c-08ac40ccc338
incident_key = carrier_csc_feature_restriction_case
label = 통신사 CSC 변경 후 전용 기능 제한 사례
```

No latest-row inference was used.

---

## 3. Current-context curator packet gate

Before the durable decision write, the existing curator decision packet service fetched the current full post exactly once and required it to match the durable Formation authority:

```text
full_post
untruncated
3035 characters
SHA256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
```

It reconstructed the 44-character evidence by durable offsets and verified:

```text
SHA256 = 159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
```

Live runtime posture:

```text
source network requests = 1
model calls = 0
database RPC calls = 2
```

Thus the human approval was applied only after current source integrity matched the exact durable Formation.

---

## 4. Durable curator decision

Live durable decision:

```text
decision id = 5e12adb3-1f27-4bbd-a929-7215d1fa6295
evidence_decision = accept
incident_action = reuse_existing
existing Incident id = 35c243aa-2e9d-41de-805c-08ac40ccc338
incident_persistence_authorized = true
reviewed context SHA256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
reviewed evidence SHA256 = 159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
```

Independent readback verified one and only one decision for the exact 15.9V Formation.

Before execution, the exact Source still had zero Incident links.

---

## 5. Exact execution lineage

The exact decision id above was passed into the existing execution service.

Durable execution:

```text
execution id = a3119637-ad84-42e5-bf42-b2960ce5cf1f
incident_action = reuse_existing
Incident id = 35c243aa-2e9d-41de-805c-08ac40ccc338
```

Durable Source→Incident link:

```text
link id = 2fb2f1af-242a-4e99-be1b-b0de03576abd
Incident id = 35c243aa-2e9d-41de-805c-08ac40ccc338
curator decision id = 5e12adb3-1f27-4bbd-a929-7215d1fa6295
```

Independent Supabase readback verified:

```text
target curator decisions = 1
target Source→Incident links = 1
target executions = 1
target Public Evidence = 0
```

One initial read-only verification query used an unqualified `id` across a join and failed with PostgreSQL `42702 ambiguous column`. It performed no mutation. The query was immediately corrected with qualified column references and returned the verified lineage above.

---

## 6. Production deltas

Before live execution:

```text
Source Incidents = 7
Source→Incident links = 8
curator Incident decisions = 1
Incident executions = 1
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

After live execution and independent production readback:

```text
Source Incidents = 7            unchanged
Source→Incident links = 9       +1
curator Incident decisions = 2  +1
Incident executions = 2         +1
Public Problems = 3             unchanged
Public Evidence = 7             unchanged
Public Feed = 3                 unchanged
```

The exact second CSC Source now belongs to the existing internal Incident and still has zero Public Evidence rows.

---

## 7. GitHub verification

Implementation PR:

```text
PR #170 — feat: execute approved existing CSC Incident reuse
exact head = 753331977f3250e2e73273badd6b8124b98f33b9
CI #548 = SUCCESS
PIE #163 = SUCCESS
```

Expected-head merge:

```text
merged main = c17e73c7693d0e58d2dd0c047aec89f8586b144f
merged-main CI #549 = SUCCESS
```

Live workflow:

```text
run = 33151083815
result = SUCCESS
artifact = source-approved-existing-incident-link-15-9w
artifact SHA256 digest = b19a24a5df5ce5a5f7efc2ae4c8ed0782bdeae7b729fc742835700805821aec6
```

The disposable live workflow is removed by the closeout PR so later main CI runs cannot repeat this one-shot transition.

---

## 8. Final authority boundary

Phase 15.9W is closed.

The second CSC Source now has internal Incident authority through the existing:

```text
carrier_csc_feature_restriction_case
```

This still does **not** authorize:

```text
Public Problem creation or mutation
Public Evidence persistence
Public Feed mutation
publication
```

Any public promotion remains a separate explicit curator authority transition.
