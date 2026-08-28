# Phase 15.9R — CSC / Carrier Feature Restriction Independent Source Acquisition

## Status

**CLOSED — LIVE ACQUISITION VERIFIED**

Phase 15.9Q closed one governed Incident:

```text
carrier_csc_feature_restriction_case
통신사 CSC 변경 후 전용 기능 제한 사례
```

The curator approved continuing toward public promotion. That approval does not waive the existing Public Problem publishability contract.

Production still has only one governed Incident for this mechanism. `ar_assert_public_problem_publishable(...)` requires at least two distinct Incident IDs, two distinct Source Signals, and two distinct source keys. Phase 15.9R therefore acquired additional Source supply only; it did not create a Public Problem draft.

---

## 1. Frozen acquisition plan

Provider:

```text
Naver API Hub blog search
sort = sim
start = 1
limit = 50
queries = 8
maximum result opportunities = 400
```

Frozen queries:

```text
CSC 변경 채팅플러스 안됨
자급제 CSC 채팅플러스
KOO CSC 채팅플러스
CSC 변경 투폰 안됨
자급제 투폰 안됨
IMEI 채팅플러스 안됨
CSC 변경 RCS 안됨
통신사 CSC 기능 제한
```

The search focus remained discovery vocabulary only:

```text
search_focus_authority = search_focus_not_problem_signature_or_incident_authority
```

A query match was not treated as a Problem match, Incident match, Formation decision, or publication decision.

---

## 2. Implementation authority

Implementation PR:

```text
PR #160
exact PR head:
c44a0202be0beaa7137f547a79bcbb9b0c11291f

PR CI #524 = SUCCESS
PIE #148 = SUCCESS

implementation merge/main:
fb30a980879480351a73aea903e7c15901907ee5
merged-main CI #525 = SUCCESS
```

The temporary live workflow was restricted to a successful `CI` workflow run on a `main` push and checked out the exact `workflow_run.head_sha`.

---

## 3. Authoritative live run

Live workflow:

```text
Source CSC Feature Restriction Search 15.9R
run id: 33135871365
conclusion: SUCCESS
head sha: fb30a980879480351a73aea903e7c15901907ee5
```

Disposable artifact:

```text
artifact id: 9672010483
name: source-csc-feature-restriction-search-15-9r
digest: sha256:9d3cbf60119d513125b27d2c0d39f0ffc98b0250e983d1e5aae1814020db5033
retention: 1 day
```

The artifact reported:

```text
requests = 8
new Source Signals = 148
admission candidate = 0
admission review = 4
admission reject = 144
protected Source rediscovery hits = 7
external model calls = 0
full source body fetches = 0
Incident mutations = 0
Public Problem mutations = 0
publication mutations = 0
```

---

## 4. Independent production readback

The artifact's before/after counts were independently re-read from Supabase.

```text
Source Signals             3562 → 3710
Source Observations        3892 → 4056
Source Ingestion Runs       144 → 152
campaign ingestion runs       0 → 8
campaign inserted Sources     0 → 148

Source Incidents              7 → 7
Source→Incident links         8 → 8
full-context outcomes        85 → 85
Formation assessments         1 → 1
curator Incident decisions    1 → 1
Incident executions           1 → 1
Public Problems               3 → 3
Public Evidence               7 → 7
Public Feed                   3 → 3
```

The already-approved authority seed was also independently revalidated after acquisition:

```text
protected Source rows = 1
protected Source content hash unchanged = true
protected curator decision rows = 1
protected Incident rows = 1
protected Source→Incident lineage rows = 1
protected execution rows = 1
protected Source Public Evidence rows = 0
```

Thus the live mutation stayed inside the Source supply boundary.

---

## 5. Review cohort triage

The deterministic admission gate surfaced four `review` rows requiring context. A read-only inspection of their stored search snippets showed:

```text
3 rows = unrelated keyword collisions / different complaint mechanisms
1 row = direct CSC-change + carrier dual-number feature failure signal
```

The single high-priority row is frozen for downstream resolution only by sanitized identity/content hashes:

```text
source_identity_sha256:
b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c

source_content_sha256:
db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4

published_at:
2020-04-09T15:00:00.000Z

admission_decision = review
requires_full_context = true
```

This triage is not a full-context semantic decision, Formation decision, Incident decision, or Problem signature.

---

## 6. Closeout boundary

The temporary `workflow_run` live trigger is removed by the Phase 15.9R closeout PR so future main CI runs cannot repeat the one-shot campaign.

The reusable plan and runner remain as historical/replayable implementation evidence, but the runner itself refuses a second live execution because eight campaign ingestion rows already exist.

---

## 7. Downstream gate

The next authorized step is an exact-source full-context resolution slice for only the frozen high-priority review Source above.

That downstream slice may determine whether the Source is an independent organic complaint compatible with the CSC/carrier-feature mechanism, but it may not automatically create or reuse an Incident.

If a future Formation becomes eligible, it must receive its own curator Incident decision packet and its own explicit human curator approval.

Until a second genuinely independent governed Incident exists:

```text
public promotion approval = retained
canonical Public Problem draft = blocked
independent Incident count = 1 / required 2
```
