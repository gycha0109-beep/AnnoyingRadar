# Phase 15.9A — Post-Publication Surface + Next Problem Seed Audit

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.9A begins the repeatable-problem-production track after Phase 15.8V successfully published the third Public Problem.

This phase has two goals:

1. verify that the newly published Problem can actually be consumed through the Public Radar reading surface;
2. identify the safest already-curated singleton from which to start the next repeated-mechanism acquisition campaign.

No new Incident, problem signature, Canonical Problem, Evidence row, or publication is authorized here.

---

## 1. Upstream publication authority

Phase 15.8V closed with:

```text
current main = da211507a24f24b24b551226f75bc4eef0ae588c
published Problems = 3
drafts = 0
Public Evidence = 7
public feed = 3
```

Target publication:

```text
problem_signature = lodging_reservation_fulfillment_gap
status = published
Evidence = 2
public feed rows = 1
```

---

## 2. Surface audit finding

Phase 15.2 froze the public category chips as UI vocabulary:

```text
배달 / 취업 / 운동 / 금융 / 쇼핑 / 여행
```

and explicitly stated that this vocabulary does not constrain the DB category contract.

The first real post-publication audit exposed a mismatch in the implementation:

```text
UI chip      DB category
여행         travel_booking / travel_refund
운동         consumer_refund for the current gym Problem
```

The home page previously passed the UI label directly to:

```text
.eq("category", category)
```

so the newly published lodging Problem was visible in the unfiltered feed but disappeared when the user selected `여행`.

The page and detail also displayed internal category strings such as `travel_booking` directly.

### 15.9A correction

A thin public-vocabulary adapter now separates:

```text
internal classification
≠
public browsing vocabulary
```

The adapter:

- maps `travel_*` / lodging text to `여행`;
- maps current gym language to `운동` without mutating the stored Problem row;
- preserves the six Phase 15.2 chips;
- hides internal category strings from the rendered Problem card/detail;
- returns from detail to the public vocabulary filter rather than the internal DB value.

This is a UI/read-path correction only. No published Problem metadata is rewritten.

---

## 3. Surface verification contract

The authoritative live smoke must run the current `main` Next.js application locally against the hosted Public Radar projection using a publishable/anon Supabase client.

It verifies:

```text
/ Explore renders
new lodging Problem is visible
2 public Evidence count is visible
여행 chip retains the lodging Problem
/radar/problems/{id} renders
2 Evidence cards render
2 HTTP(S) source links are present
여행 문제 더 보기 is present
internal category / lineage tokens are absent
browser page errors = 0
```

This is intentionally distinguished from internet hosting/deployment status.

Connected Vercel inspection at the start of 15.9A found no AnnoyingRadar Vercel project. Therefore 15.9A does not claim that an internet production deployment exists; it verifies the real application surface against the hosted public data projection.

---

## 4. Primary next-problem seed

Phase 15.8P already froze the curator decision:

```text
고고모바일 번호이동 제한
  evidence_decision = accept
  incident persistence = hold as singleton
```

15.9A does not reinterpret that decision.

The seed is resolved at runtime through hash-only authority and must still satisfy:

```text
Source Admission / full-context outcome = Candidate
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
full_post / untruncated
Incident link count = 0
```

Therefore its current state remains:

```text
accepted Evidence
+ independent actual friction
+ no persisted Incident because singleton
```

---

## 5. Next acquisition focus

15.9A authorizes only targeted Source acquisition around the held singleton.

Search focus:

```text
mobile carrier number-transfer / port-out restriction
```

Initial Korean query family:

```text
알뜰폰 번호이동 제한 강제
통신사 번호이동 제한 해제 안됨
번호이동 제한서비스 자동 가입
통신사 번호이동 막힘 피해
```

Important:

```text
search focus ≠ problem_signature
```

A second source must still pass Source Admission and full-context review. A later curator gate decides whether it is an independent Incident and whether it shares the same problem mechanism.

---

## 6. Authority boundary

Phase 15.9A is read-only with respect to the governed source/problem domains.

Not authorized:

```text
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

Authorized:

```text
Public UI/read-path category adapter
read-only hosted DB audit
read-only rendered surface smoke
targeted acquisition plan for 15.9B
```

---

## 7. Expected live result

```text
published target feed rows = 1
published target Evidence rows = 2
primary singleton Incident links = 0
surface smoke = PASS
travel chip target visible = true
next authority = targeted_source_acquisition_only
database writes = 0
```

After closeout, Phase 15.9B may acquire new candidate Sources for the same-mechanism search focus. It still may not create an Incident without a new curator decision.
