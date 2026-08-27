# Phase 15.9A — Post-Publication Surface + Next Problem Seed Audit

## Status

**CLOSED**

Phase 15.9A begins the repeatable-problem-production track after Phase 15.8V published the third Public Problem.

It completed two tasks:

1. verified the newly published Problem through the actual Next.js Public Radar reading surface against the hosted public projection;
2. froze the previously curator-accepted Gogo Mobile singleton as the primary next targeted acquisition seed.

No Incident, problem signature, Canonical Problem, Public Evidence, or publication mutation was performed.

---

## 1. Implementation authority

```text
PR #122
exact head = b49ded22dd4003b58fd751f4262f9daf166b6082
CI #435 = SUCCESS
PIE #95 = SUCCESS
implementation main = aa2f1380993df6dc125b5887bb0071475793a5fe
merged-main CI #436 = SUCCESS
```

---

## 2. Public surface defect found and corrected

Phase 15.2 defined the public chips as UI vocabulary:

```text
배달 / 취업 / 운동 / 금융 / 쇼핑 / 여행
```

but did not define those labels as the DB category enum.

The first real post-publication audit found that the implementation treated them as exact DB values. Current published categories include:

```text
travel_booking
travel_refund
consumer_refund
```

Therefore the newly published lodging Problem was visible in the unfiltered feed but disappeared under the `여행` chip. Internal strings such as `travel_booking` were also displayed directly on cards/details.

15.9A added a thin public-vocabulary adapter. It does not rewrite published Problem metadata.

Verified behavior now includes:

```text
travel_* → 여행
current gym-language Problem → 운동
internal category hidden from card/detail
Detail → same public vocabulary category
```

---

## 3. Authoritative live audit

```text
run = 33031021638
result = SUCCESS
artifact = 9630235775
digest = sha256:47e1585dc8dc42c1d0d27a86fc5e2521630616381f92a6dd56a5353caca7cd16
head = aa2f1380993df6dc125b5887bb0071475793a5fe
```

The run used the hosted Supabase public projection with a publishable/anon client and rendered the current `main` Next.js application locally.

This distinction matters: connected Vercel inspection found no AnnoyingRadar Vercel project, so this phase does **not** claim an internet production deployment exists.

### Surface result

```text
Explore target visible = true
public Evidence count visible = 2
여행 chip retains target = true
Problem Detail visible = true
Evidence cards = 2
HTTP(S) source links = 2
internal category hidden = true
internal lineage hidden = true
browser page errors = 0
database writes = 0
```

---

## 4. Independent DB readback

Post-run independent Supabase readback:

```text
published Problems = 3
drafts = 0
public feed = 3
Public Evidence = 7
lodging target feed rows = 1
lodging target Evidence rows = 2
Gogo singleton Incident links = 0
```

This matches the live artifact and confirms that 15.9A did not mutate governed DB state.

---

## 5. Primary next-problem seed

Phase 15.8P already froze the curator decision:

```text
고고모바일 번호이동 제한
evidence_decision = accept
incident persistence = hold as singleton
```

15.9A re-resolved that Source through hash-only authority and confirmed:

```text
Source Admission/full-context outcome = Candidate
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
context_scope = full_post
context_truncated = false
Incident link count = 0
```

Current state:

```text
accepted Evidence
+ independent actual friction
+ Incident persistence intentionally held because singleton
```

It is **not repeat-ready** yet.

Missing requirement:

```text
one independent same-mechanism incident
```

---

## 6. Phase 15.9B acquisition authority

15.9A authorizes the next phase only for targeted Source acquisition around this search focus:

```text
mobile carrier number-transfer / port-out restriction
```

Initial query family:

```text
알뜰폰 번호이동 제한 강제
통신사 번호이동 제한 해제 안됨
번호이동 제한서비스 자동 가입
통신사 번호이동 막힘 피해
```

This is explicitly:

```text
search focus ≠ problem_signature
```

15.9B may discover, ingest, deduplicate, and run Source Admission/full-context evaluation according to existing source authorities. It may not create an Incident or assign a problem signature.

---

## 7. Closed authority boundary

Not authorized by 15.9A:

```text
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

Authorized next step:

```text
Phase 15.9B — targeted same-mechanism Source acquisition
```

The 15.9A workflow is returned to `workflow_dispatch` only; its temporary live push trigger is retired.
