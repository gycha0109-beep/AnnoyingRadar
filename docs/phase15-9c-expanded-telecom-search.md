# Phase 15.9C — Expanded Telecom Search Surface

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.9C follows Phase 15.9B, which produced:

```text
4-query date-sorted campaign
new Source total = 4
Candidate = 0
Review = 0
Reject = 4
```

The safe response is to remain at Source acquisition and broaden search recall. Phase 15.9C changes only the query/search surface; it does not promote any Source or infer a problem identity.

---

## 1. Expansion rationale

15.9B used long complaint-like phrases with `sort=date`. Two queries returned zero results and the other two produced only four new Source rows, all rejected at Source Admission.

15.9C therefore changes two dimensions:

```text
long phrase → shorter vocabulary
sort=date → sort=sim
```

This is a recall expansion, not a semantic authority expansion.

---

## 2. Frozen query plan

Exact queries:

```text
알뜰폰 번호이동 안됨
번호이동 제한 해제
번호이동 제한서비스
번호이동 제한서비스 해지
번호이동 제한서비스 해제
번호이동 차단
번호이동 막힘
알뜰폰 번호이동 제한
```

Each request uses:

```text
provider = Naver API Hub blog search
sort = sim
start = 1
limit = 50
```

Bound:

```text
8 requests
400 maximum result opportunities
```

The search focus remains:

```text
telecom_port_restriction
search_focus_not_problem_signature
```

---

## 3. Seed protection

The curator-held Gogo singleton remains frozen by hash authority.

Live execution requires:

```text
seed resolves uniquely
seed content hash unchanged
seed Incident links = 0
```

If the seed appears in a search response, it is removed before persistence and counted only as a protected rediscovery hit.

---

## 4. Existing-source handling

15.9C counts only Source identities that do not already exist in `ar_source_signals` before each persistence operation.

Therefore:

- the seed is never a new Source;
- all Phase 15.9B rows are existing Source rows if rediscovered;
- a Source inserted by an earlier 15.9C query is duplicate-only if another 15.9C query finds it later;
- `new_source_summary` represents the unique newly inserted cohort.

---

## 5. Mutation boundary

Authorized durable mutations:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

Protected exact-count domains:

```text
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
ar_source_incidents
ar_source_incident_links
ar_source_full_context_resolution_outcomes
```

Additional boundaries:

```text
blind 120 reads = 0
full source body fetches = 0
external model calls = 0
```

---

## 6. Source Admission only

New Source rows receive the existing Source Admission policy result:

```text
Candidate / Review / Reject
```

No live result in this phase can itself authorize:

```text
full-context semantic conclusion
Incident creation
same-mechanism adjudication
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

If Candidate/Review > 0, a later phase may reconstruct only this exact campaign cohort and perform selective full-context readiness work.

---

## 7. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ one-shot live branch
→ 8-query expanded campaign
→ artifact inspection
→ independent DB readback
→ closeout
```

Live trigger is temporary and must be removed during closeout.
