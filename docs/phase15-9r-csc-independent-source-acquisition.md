# Phase 15.9R — CSC / Carrier Feature Restriction Independent Source Acquisition

## Status

**IMPLEMENTATION IN REVIEW / LIVE ACQUISITION NOT EXECUTED**

Phase 15.9Q closed one governed Incident:

```text
carrier_csc_feature_restriction_case
통신사 CSC 변경 후 전용 기능 제한 사례
```

The curator has approved continuing toward public promotion. That approval does not waive the existing Public Problem publishability contract.

Current production authority has only one Incident for this mechanism, while `ar_assert_public_problem_publishable(...)` requires at least two distinct Incident IDs, two distinct Source Signals, and two distinct source keys.

Therefore Phase 15.9R does **not** create a Public Problem draft. It acquires bounded additional Source supply so a second independent organic case can be evaluated through the normal semantic / Formation / curator authority chain.

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

The search focus is discovery vocabulary only:

```text
search_focus_authority = search_focus_not_problem_signature_or_incident_authority
```

A query match is not a Problem match, Incident match, Formation decision, or publication decision.

---

## 2. Protected authority seed

The runner freezes the already-approved Source identity/content hashes and the exact durable Incident decision / Incident key.

Before and after acquisition it independently verifies:

```text
protected Source resolves uniquely
protected Source content hash is unchanged
durable decision exists and remains accept + create_new + authorized
protected Incident was created from that exact decision
protected Source has exactly one link to that Incident
link carries that exact decision lineage
execution ledger contains exactly one execution for that decision
protected Source has zero Public Evidence rows
```

The protected Source is excluded from acquisition inserts even if rediscovered by the provider.

---

## 3. Mutation boundary

Authorized live mutations:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

Forbidden in this phase:

```text
full-context outcome writes
Formation writes
curator Incident decision writes
Incident writes
Source→Incident link writes
Public Problem writes
Public Evidence writes
Public Feed writes
publication status changes
```

External model calls are zero and full source body fetches are zero.

The runner snapshots protected domain counts before and after acquisition and fails if any forbidden domain changes.

---

## 4. One-shot live execution

The live campaign version is:

```text
phase15.9r-csc-feature-restriction-search-v0.1
```

Before the first provider request, the runner requires zero existing ingestion runs carrying that campaign version. Any second live execution fails closed rather than silently creating another acquisition campaign.

Because the repository integration surface available for this phase cannot dispatch a manual workflow directly, the implementation contains a temporary `workflow_run` trigger. It is restricted to:

```text
workflow = CI
branch = main
event = push
conclusion = success
```

It checks out the exact CI-verified `workflow_run.head_sha`. Thus provider/production writes cannot occur from PR CI and cannot occur before merged-main CI succeeds.

After the authoritative live run is verified, this temporary workflow must be removed in the Phase 15.9R closeout PR.

---

## 5. Live verification contract

Before live acquisition, production must still show the 15.9Q authority boundary:

```text
Public Problem count = 3
Public Evidence count = 7
Public Feed count = 3
Source Incident count = 7
Source→Incident link count = 8
curator Incident decisions = 1
Incident decision executions = 1
```

After the campaign:

```text
exactly 8 campaign ingestion runs exist
Source growth equals the unique newly inserted cohort
protected authority lineage is unchanged
Incident/Public/Formation/full-context counts are unchanged
model calls = 0
full source body fetches = 0
```

The disposable artifact may expose only sanitized provider-derived Source identity/content hashes, publication timestamps, admission decisions/reasons, aggregate counts, and query telemetry. It must not expose Source UUIDs, URLs, authors, raw text, Incident IDs, curator decision IDs, or Public Problem IDs.

---

## 6. Downstream gate

If the new cohort contains promising candidate/review rows, those rows must proceed through the existing semantic and full-context authority path. No newly acquired row becomes a second Incident automatically.

A future second Formation that is eligible must receive its own curator Incident decision packet and its own explicit human curator approval.

Only after two genuinely independent governed Incidents exist may a later phase evaluate canonical Public Problem draft readiness.

If Phase 15.9R finds no qualifying independent case, public promotion remains approved in principle but blocked by:

```text
independent Incident count = 1 / required 2
```
