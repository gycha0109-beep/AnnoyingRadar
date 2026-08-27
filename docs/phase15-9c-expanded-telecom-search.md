# Phase 15.9C — Expanded Telecom Search Surface

## Status

**CLOSED / LIVE VERIFIED**

Phase 15.9C followed Phase 15.9B, which produced:

```text
4-query date-sorted campaign
new Source total = 4
Candidate = 0
Review = 0
Reject = 4
```

The safe response was to remain at Source acquisition and broaden search recall. Phase 15.9C changed only the query/search surface; it did not promote any Source or infer a problem identity.

---

## 1. Expansion rationale

15.9B used long complaint-like phrases with `sort=date`. Two queries returned zero results and the other two produced only four new Source rows, all rejected at Source Admission.

15.9C therefore changed two dimensions:

```text
long phrase → shorter vocabulary
sort=date → sort=sim
```

This was a recall expansion, not a semantic authority expansion.

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

Each request used:

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

The search focus remained:

```text
telecom_port_restriction
search_focus_not_problem_signature
```

---

## 3. Implementation authority

```text
PR #126
exact head = e8b2847bdb68d286005175007264a0d4440a4fbd
CI #444 = SUCCESS
PIE #101 = SUCCESS
implementation main = 19b16bee7fdb25632d104a8415901c2c96b858b8
merged-main CI #445 = SUCCESS
```

---

## 4. Authoritative live execution

```text
run = 33033256805
status = SUCCESS
artifact = 9631050607
digest = sha256:2ecb49f91348fbd9df8ae8e5a09097fb44f67fc46650fcaa62a3472e4b78bbcd
```

Live yield:

```text
fetched = 400
campaign observations = 351
distinct newly inserted Sources = 313
Candidate = 0
Review = 0
Reject = 313
```

The eight query results were:

```text
01 fetched 50 / inserted 38 / Candidate 0 / Review 0 / Reject 38
02 fetched 50 / inserted 45 / Candidate 0 / Review 0 / Reject 45
03 fetched 50 / inserted 44 / Candidate 0 / Review 0 / Reject 44
04 fetched 50 / inserted 40 / Candidate 0 / Review 0 / Reject 40
05 fetched 50 / inserted 22 / Candidate 0 / Review 0 / Reject 22
06 fetched 50 / inserted 45 / Candidate 0 / Review 0 / Reject 45
07 fetched 50 / inserted 44 / Candidate 0 / Review 0 / Reject 44
08 fetched 50 / inserted 35 / Candidate 0 / Review 0 / Reject 35
```

---

## 5. Independent DB readback

Independent Supabase readback matched the live artifact.

```text
source_signals = 3562
source_observations = 3892
source_ingestion_runs = 144
raw_inputs = 10
pain_evidences = 27
public_problems = 3
public_evidence = 7
public_feed = 3
source_incidents = 6
source_incident_links = 7
full_context_outcomes = 82
```

Campaign-specific readback:

```text
campaign runs = 8
campaign observations = 351
campaign distinct Sources = 313
campaign Sources with Incident links = 0
```

Protected downstream domains were unchanged.

---

## 6. Seed protection verification

The curator-held Gogo singleton remained frozen.

```text
seed row count = 1
seed content hash = unchanged
seed Incident links = 0
```

No search result was allowed to rewrite the seed through generic discovery upsert behavior.

---

## 7. Rejection distribution

The 313 newly inserted Source rows were all rejected by Source Admission.

Reason-code counts:

```text
title_no_complaint_signal = 111
snippet_information_only = 69
title_truncated_no_complaint_signal = 65
title_information_or_guide = 51
title_topic_without_event = 9
title_truncated_topic_without_event = 3
title_product_or_promotion = 2
title_positive_review = 1
snippet_pain_hook_or_promotion = 1
snippet_incidental_complaint_only = 1
```

This changes the next diagnostic question. Another blind query expansion is not justified yet because two materially different explanations remain possible:

```text
A. the Naver search surface is mostly informational/guide content for this topic;
B. Source Admission is false-negative on actual telecom user incidents because complaint/event signals are absent from search snippets or titles.
```

---

## 8. Mutation boundary

15.9C authorized durable mutations only in:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

It performed:

```text
blind 120 reads = 0
full source body fetches = 0
external model calls = 0
Incident mutations = 0
problem_signature mutations = 0
Public Evidence mutations = 0
publication mutations = 0
```

---

## 9. Closeout and next authority

The temporary one-shot live push trigger is removed during closeout. The workflow remains `workflow_dispatch` only.

15.9C does **not** authorize further search expansion by itself.

The next governed step is:

```text
Phase 15.9D — Telecom Rejection Diagnostics
```

15.9D must be a bounded, blind-safe, read-only diagnostic over a deterministic subset of the 15.9C rejected cohort. Its purpose is to estimate whether rejection is primarily caused by irrelevant/informational supply or by Source Admission false negatives before any broader full-context campaign or policy change is considered.

Still not authorized:

```text
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```
