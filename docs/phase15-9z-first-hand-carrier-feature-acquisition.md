# Phase 15.9Z — First-Hand Carrier-Feature Source Acquisition

## Status

**CLOSED — LIVE ACQUISITION VERIFIED / NO SECOND-INCIDENT CANDIDATE FOUND**

Phase 15.9Z executed a bounded Naver Blog acquisition campaign after the existing Source pool failed to provide a valid second-Incident candidate for the carrier-feature restriction mechanism.

The Public Problem blocker remains:

```text
existing CSC Sources = 2
existing CSC Incidents = 1
minimum distinct Incidents required = 2
```

No full-context, Formation, Incident, or Public mutation occurred.

---

## 1. Frozen search plan

The campaign executed exactly eight searches with at most 50 results each:

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

Campaign version:

```text
phase15.9z-first-hand-carrier-feature-search-v0.1
```

---

## 2. Implementation / verification authority

```text
PR = #176
final PR head = aca69da012b0e92e7cdaaff93caa2bda2fcce666
CI #562 = SUCCESS
PIE #173 = SUCCESS
implementation main = 0811d6a6b66d3f5677afc67982604c9c0438ce47
merged-main CI #563 = SUCCESS
```

Live workflow:

```text
run id = 33232734918
result = SUCCESS
artifact id = 9708995292
artifact digest = sha256:8cf20cf43fb40b141000f5c8acc7d338e65ab38f72fd491ec1e3b50139fc1b7b
retention = 1 day
```

---

## 3. Live acquisition result

```text
new Source Signals = 183
Admission candidate = 0
Admission review = 4
Admission reject = 179
full-context required = 4
full source body fetches = 0
external model calls = 0
```

Per-query new review yield:

```text
자급제폰 부가서비스 안됨 후기 = 4
all other queries = 0
```

---

## 4. Independent Supabase readback

Before → after:

```text
Source Signals        3710 → 3893
Source Observations    4056 → 4278
Source Ingestion Runs   152 → 160
Raw Inputs               10 → 10
Pain Evidences            27 → 27
Full-context outcomes      86 → 86
Formation assessments       3 → 3
Source Incidents             7 → 7
Source→Incident links         9 → 9
Curator decisions             2 → 2
Incident executions           2 → 2
Public Problems               3 → 3
Public Evidence               7 → 7
Public Feed                   3 → 3
```

Campaign readback:

```text
campaign ingestion runs = 8
existing CSC linked Sources = 2
existing CSC Public Evidence = 0
```

Thus only the authorized Source supply domains changed.

---

## 5. Review triage

The four deterministic `review + requires_full_context` Sources were independently read back from the final canonical Source table before any full-context work.

Their stored snippets represent:

```text
1. KT M Mobile service / cancellation dissatisfaction
2. iPhone battery replacement / carrier insurance complaint
3. handset retail-shop activation-delay complaint
4. iPhone 17 preorder failure / retail reservation review
```

These are carrier-adjacent keyword matches, but they do not establish the target mechanism of a carrier-specific feature being restricted by handset provenance / CSC state.

Therefore:

```text
second-Incident Source candidate = none
full-context resolution launched = none
Formation persistence = none
Incident mutation = none
```

The four Sources remain ordinary acquired Source supply and receive no downstream authority from this phase.

---

## 6. Provenance caveat discovered during closeout

The live artifact stores each newly inserted Source's content hash at the point where that identity was first counted as new inside the multi-query loop.

`persistSourceSignals(...)` upserts on:

```text
(source_platform, external_content_id)
```

and a later query can re-observe the same Source identity with different search-snippet content, replacing the canonical Source row's `content_hash`.

Two of the four review identities demonstrated this distinction between acquisition-time artifact hash and final canonical DB hash.

Therefore the authority rule for every later exact Source phase is:

```text
artifact Source identity hash = discovery locator only
final canonical Source content hash = independent post-campaign DB readback
```

A later phase must never bind an exact target to the acquisition artifact content hash without re-reading the canonical Source row after the complete campaign.

This does not invalidate the 15.9Z mutation/count result, but it does narrow the evidentiary meaning of the artifact's per-Source content hash.

---

## 7. Mutation boundary result

Authorized writes occurred only in:

```text
Source ingestion runs
Source Signals
Source Observations
```

Verified unchanged:

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

---

## 8. Closeout

The temporary `source-first-hand-carrier-feature-search-15-9z.yml` workflow is removed in this closeout before another main merge can retrigger the one-shot campaign.

The next search step must change retrieval strategy rather than repeatedly broadening the same carrier-adjacent Naver keywords. The current Naver Blog query surface produced substantial Source volume but no mechanism-specific second-Incident candidate.

Any future candidate still must pass:

```text
exact canonical Source readback
→ deterministic Admission
→ full-context semantic resolution
→ durable outcome persistence
→ Formation assessment
→ explicit human curator decision for a second Incident
```

Public Problem promotion remains blocked until two distinct governed Incidents exist.
