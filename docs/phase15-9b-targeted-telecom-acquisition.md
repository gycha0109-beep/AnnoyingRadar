# Phase 15.9B — Targeted Telecom Same-Mechanism Source Acquisition

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.9B consumes only the next-step authority produced by Phase 15.9A:

```text
targeted same-mechanism Source acquisition
```

The purpose is to look for a second independent real-world Source near the curator-held Gogo Mobile singleton.

This phase does **not** decide that any newly discovered Source is the same Incident or the same problem mechanism.

---

## 1. Upstream seed authority

Phase 15.9A closed with the previously curated singleton still in this state:

```text
Evidence decision = accept
Incident persistence = hold as singleton
Incident links = 0
repeat_ready = false
missing = one independent same-mechanism Incident
```

The seed identity remains hash-only in repository authority.

15.9B refuses live execution if that Source no longer resolves uniquely or has gained an Incident link outside a later curator decision.

---

## 2. Search focus, not problem identity

Search focus:

```text
mobile carrier number-transfer / port-out restriction imposed by the service provider
```

This is deliberately marked:

```text
search_focus_not_problem_signature
```

No `problem_signature` is created or inferred in this phase.

The exact four queries are:

```text
알뜰폰 번호이동 제한 강제
통신사 번호이동 제한 해제 안됨
번호이동 제한서비스 자동 가입
통신사 번호이동 막힘 피해
```

Each query uses:

```text
provider = Naver API Hub blog search
sort = date
start = 1
limit = 50
```

Bound:

```text
4 requests
200 maximum result opportunities
```

The generic Phase 15.8 discovery allocation is intentionally not modified.

---

## 3. Source supply mutation boundary

15.9B reuses existing governed discovery primitives:

```text
createSourceIngestionRun()
searchNaverBlogPosts()
persistDiscoveredSourceSignals()
```

Allowed durable mutations are restricted to Source supply / provenance domains already owned by discovery:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

Existing discovery prefilter and Source Admission policy remain authoritative.

Protected downstream domains must retain exact row counts:

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

---

## 4. New-source identity handling

For each query, 15.9B checks which discovery-accepted Source identities existed before persistence.

Only previously unseen identities are counted as the new cohort.

Therefore:

- the existing Gogo seed may be rediscovered as a duplicate;
- it can never count as the required second independent Source;
- a Source discovered by query 1 and then rediscovered by query 2 is counted new only once.

Each new Source is recorded in the disposable artifact only as:

```text
source_platform
source_identity_sha256
source_content_sha256
published_at
admission_decision
admission_reason_codes
requires_full_context
distinct_from_seed
```

No Source UUID, URL, author handle, raw snippet/body, Incident UUID, or Public Problem UUID is emitted.

---

## 5. Admission semantics

The admission result remains a **Source Admission** decision only:

```text
Candidate / Review / Reject
```

It does not answer:

```text
is this an actual independent Incident?
is this the same mechanism as the Gogo singleton?
what is the problem_signature?
should an Incident be persisted?
```

Those questions require full-context evidence and a later curator gate.

---

## 6. No full-context or model call

15.9B is intentionally cheap and bounded:

```text
full source body fetches = 0
external model calls = 0
blind 120 reads = 0
```

If new Candidate/Review sources exist, a later read-only phase may reconstruct exactly this campaign cohort from ingestion-run request metadata and perform selective full-context resolution.

---

## 7. Campaign reconstruction

Each ingestion run stores:

```text
targeted_campaign_version = phase15.9b-targeted-telecom-acquisition-v0.1
targeted_query_key
targeted_search_focus = telecom_port_restriction
search_focus_authority = search_focus_not_problem_signature
```

This lets the next phase reconstruct the exact new cohort from durable Source provenance without freezing raw Source UUIDs in repository files.

---

## 8. Live gate

Live execution requires:

```text
ALLOW_PHASE15_9B_TARGETED_ACQUISITION=true
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
Supabase service credential
```

Release flow:

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ one-shot live branch
→ 4-query campaign
→ artifact inspection
→ independent DB readback
→ remove temporary live trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

---

## 9. Authority boundary

15.9B authorizes only targeted source supply acquisition.

Not authorized:

```text
full-context interpretation beyond existing Source Admission
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

The live yield determines the next step. In particular, `Candidate > 0` is not by itself sufficient for Incident persistence.
