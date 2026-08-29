# Phase 15.9Z — First-Hand Carrier-Feature Source Acquisition

## Status

**IMPLEMENTATION IN REVIEW / LIVE ACQUISITION NOT EXECUTED**

Phase 15.9Y closed because its exact target was deterministically rejected at the Admission boundary. A stricter readback of the current Source pool found no unassigned Source that clearly satisfies the present complaint/episode Admission path for the same carrier-feature restriction mechanism.

The Public Problem blocker remains:

```text
existing CSC Sources = 2
existing CSC Incidents = 1
minimum distinct Incidents required = 2
```

Phase 15.9Z therefore acquires additional Source supply. It does not resolve full context, persist Formation, create an Incident, or create/publicize a Public Problem.

---

## 1. Frozen search plan

The campaign performs exactly eight Naver Blog searches with at most 50 results each:

```text
자급제 채팅플러스 안됨 후기
자급제폰 채팅플러스 안됨 경험
자급제 투폰 안됨 후기
자급제 넘버플러스 최악
자급제폰 부가서비스 안됨 후기
통신사 부가서비스 자급제 불편 후기
CSC 변경 채팅플러스 비추천
CSC 변경 투폰 불편 후기
```

Maximum search opportunities:

```text
8 × 50 = 400
```

The query terms intentionally bias retrieval toward first-hand complaint/episode language after prior candidates were rejected as informational or title-only collisions.

Search relevance is not Incident authority and is not Public Problem authority.

---

## 2. One-shot provenance

Campaign version:

```text
phase15.9z-first-hand-carrier-feature-search-v0.1
```

Every ingestion run records the campaign version and query key in `request_metadata`.

Before live execution there must be zero runs for this campaign. After successful execution there must be exactly eight. Duplicate campaign execution is forbidden.

---

## 3. Protected governed baseline

The current mechanism authority must still resolve as:

```text
incident_key = carrier_csc_feature_restriction_case
Incident count for key = 1
linked Sources = 2
Public Evidence rows = 0
```

Phase 15.9Z cannot reinterpret those two Sources as two Incidents.

---

## 4. Mutation boundary

Authorized writes:

```text
Source ingestion runs
Source Signals discovered by the bounded provider search
Source Observations created by the normal source-ingestion service
```

Forbidden mutations:

```text
Raw Input
Pain Evidence
full-context outcomes
Formation assessments
Incidents
Source→Incident links
curator decisions
incident executions
Public Problems
Public Evidence
Public Feed
publication state
```

The live runner snapshots all governed counts before and after and rejects any forbidden-domain change.

---

## 5. Admission triage

Newly inserted Sources are classified with the existing deterministic `classifySourceAdmission(...)` policy only for triage metadata.

The disposable artifact contains only:

```text
Source identity hash
Source content hash
published timestamp
Admission decision
Admission reason codes
requires_full_context flag
```

It excludes URLs, authors, raw text, internal Source UUIDs, Incident UUIDs, curator IDs, provider request IDs, and Public Problem IDs.

No full post body is fetched and no external model is called.

---

## 6. Live gate

The temporary workflow may run only after successful `CI` on a `main` push and must checkout the exact CI-verified `workflow_run.head_sha`.

The workflow is one-shot operational scaffolding and must be removed during closeout before another main merge can retrigger it.

---

## 7. Next transition

After live acquisition, only newly inserted `review`/`candidate` Sources that are independently consistent with the carrier-feature mechanism may be inspected further.

A subsequent exact Source phase must re-run the deterministic Admission boundary before any full-context fetch. A resolved candidate may proceed to durable outcome persistence and then Formation assessment.

Even if Formation becomes eligible, creation of a second distinct Incident remains a separate explicit human curator decision.
