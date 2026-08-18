# Phase 15.0 — Public Radar Domain / Publication Model

## 1. 목적

Phase 15.0은 v0.3 Personal Research Workspace 이후의 제품 방향을 **Public Problem Discovery Radar**로 확장하기 위한 도메인 경계와 공개 모델을 freeze한다.

이 단계의 목적은 외부 SNS 수집을 바로 구현하는 것이 아니다.

먼저 다음 질문에 답한다.

```text
개인 사용자가 만든 근거 기반 Problem Card
또는 향후 외부 Source에서 관측한 Pain Signal이
어떤 검증을 거쳐 Public Radar의 canonical Problem이 되는가?
```

Phase 15.0은 이 publication boundary를 정의한다.

---

## 2. Authority / 현재 실제 상태

### GitHub baseline

Phase 15.0 설계 시작 기준 main:

```text
2fe4994aa88548d423090f3fe9510e9574111842
```

v0.3은 Phase 14에서 아래 개인 리서치 자산 흐름까지 닫혀 있다.

```text
Raw Input
→ Pain Evidence
→ Problem Candidate
→ Confirmed Problem Card
→ Saved Problem
→ Research Project / Alternative / Idea / Export
```

### Hosted Supabase baseline

현재 hosted DB에는 Public Radar 전용 table이 없다.

핵심 personal domain은 다음과 같다.

```text
ar_raw_inputs
ar_pain_evidences
ar_problem_candidates
ar_problem_evidence_links
ar_saved_problem_cards
```

설계 시점 hosted aggregate:

```text
Raw Inputs: 10
Pain Evidences: 27
Confirmed Problem Cards: 7
Saved Problems: 1
```

### 현재 storage invariant

현재 `ar_problem_candidates`와 `ar_pain_evidences`는 모두 `user_id`와 `raw_input_id`를 가진다.

`ar_problem_evidence_links`는 DB trigger로 다음을 강제한다.

```text
candidate.user_id = evidence.user_id
candidate.raw_input_id = evidence.raw_input_id
```

또한 non-discarded Candidate 사이에서 하나의 Evidence가 중복 연결되는 것도 막는다.

따라서 현재 Problem Candidate는 의도적으로:

> **한 사용자의 한 Raw Input 안에서 검토되는 local problem cluster**

이다.

여러 사용자, 여러 Raw Input, 여러 Source에 걸친 Public canonical Problem identity로 사용할 수 없다.

---

## 3. Product philosophy freeze

Public Radar 확장은 다음 원칙을 따른다.

### 3.1 사람들에게 새로운 곳에서 말하라고 요구하지 않는다

사람들은 원래 쓰던 SNS, 커뮤니티, 리뷰, 기타 공개 공간에서 말한다.

Annoying Radar는 그 속에서 반복되는 문제를 발견한다.

직접 제보는 가능하지만 Radar의 주된 공급 방식은 아니다.

### 3.2 불만은 원재료이고 Problem이 제품이다

```text
사용자 발언
→ Pain Signal
→ Evidence
→ 반복 패턴
→ Public Problem
```

Public Radar에서 사용자가 탐색하는 핵심 콘텐츠는 게시물 목록이 아니라 **canonical Problem**이다.

### 3.3 Discover before Manage

로그인하지 않은 사용자도 최소한 다음은 가능해야 한다.

```text
Problem 검색
Problem 탐색
Problem 상세 조회
대표 Evidence 확인
원문 Source로 이동
관련 Problem 탐색
```

로그인은 저장, Research, Idea 등 개인화된 지속 가치가 필요한 순간에 요구한다.

### 3.4 Evidence before claim

Public Problem은 AI가 만든 그럴듯한 문장이 아니라 실제 관측 Evidence에 의해 뒷받침되는 공개 주장이다.

### 3.5 Coverage보다 Precision

초기 Radar는 인터넷 전체를 대표한다고 주장하지 않는다.

한정된 관측 범위 안에서 높은 Problem purity와 traceability를 우선한다.

---

# 4. 가장 중요한 domain split

## 4.1 Personal Problem Card와 Public Problem은 다른 identity다

### Personal Problem Card

현재 identity를 유지한다.

```text
ar_problem_candidates.id
where status = 'confirmed'
```

의미:

```text
특정 사용자가
특정 Raw Input의 Evidence를 검토하고
확정한 개인 리서치 자산
```

### Public Problem

새 canonical entity를 둔다.

```text
ar_public_problems.id
```

의미:

```text
여러 Source / 여러 관측 시점 / 여러 Evidence를
하나의 반복되는 문제로 통합하여
Public Radar에 공개하는 canonical problem
```

따라서:

```text
Personal Problem Card
≠ Public Problem
```

이다.

---

## 4.2 Confirmed Problem Card는 자동 공개되지 않는다

절대 금지:

```text
problem_candidate.status = confirmed
→ 자동 Public Radar 게시
```

Confirmed는 개인 분석 결과의 확정일 뿐 publication consent나 public quality gate가 아니다.

Public Problem은 별도 curator review를 거친다.

---

## 4.3 Public Problem은 여러 local cluster를 흡수할 수 있다

예:

```text
Raw Input A
→ "혼자 배달시키면 최소금액 맞추기 어렵다"

Raw Input B
→ "최소 주문금액 때문에 음료를 억지로 추가한다"

Raw Input C
→ "1인 주문은 필요 없는 사이드를 넣게 된다"
```

각 Raw Input 내부에서는 별도 Problem Card가 만들어질 수 있다.

Public Radar에서는 curator가 동일한 구조라고 판단하면:

```text
Public Problem
"배달 최소주문금액 때문에 1인 주문자가 불필요한 메뉴를 추가하게 된다"
```

하나로 통합한다.

이 통합은 기존 `ar_problem_evidence_links` invariant를 변경하지 않는다.

Public domain이 별도로 aggregation을 담당한다.

---

# 5. Public Evidence는 private Evidence row가 아니다

## 5.1 private table에 anon SELECT를 열지 않는다

다음 table의 기존 privacy boundary를 유지한다.

```text
ar_raw_inputs
ar_pain_evidences
ar_problem_candidates
ar_problem_evidence_links
ar_saved_problem_cards
```

현재 own-row SELECT 정책을 public access로 완화하지 않는다.

특히 다음은 금지한다.

```text
anon → ar_pain_evidences SELECT
anon → ar_raw_inputs SELECT
```

---

## 5.2 Public Evidence Snapshot을 별도로 만든다

Public Problem의 공개 근거는 private Evidence row를 직접 노출하지 않고 **public-safe snapshot**으로 복사한다.

권장 entity:

```text
ar_public_problem_evidence_snapshots
```

Snapshot은 공개에 필요한 최소 정보만 가진다.

```text
id
public_problem_id
excerpt
publication_basis
source_type
source_label
source_url
source_key
source_observed_at
order_index
created_at
updated_at
```

### 목적

- 원문 전체를 공개하지 않는다.
- 개인 Raw Input metadata를 공개하지 않는다.
- `user_id`를 공개하지 않는다.
- 공개 문구는 curator가 검토한 짧은 excerpt만 유지한다.
- Source URL이 허용되는 경우 원문으로 돌아갈 수 있다.
- 공개 후 private research row의 수정과 public representation을 분리한다.

즉:

```text
Private Evidence
      ↓ publication review
Public Evidence Snapshot
```

이다.

---

## 5.3 Provenance 원칙

Public Evidence Snapshot은 provenance를 잃지 않는다.

최소한 다음을 보존한다.

```text
어디에서 관측했는가
어떤 공개 근거를 인용했는가
언제 관측했는가
원문으로 돌아갈 수 있는가
```

단, v1 Public UI에서는 작성자 handle / profile / 개인 식별 정보는 기본적으로 표시하지 않는다.

---

# 6. Publication eligibility

Public Radar에 들어올 수 있는 Evidence의 출처를 명확히 나눈다.

## 6.1 `external_public`

공개적으로 접근 가능한 외부 Source에서 관측한 내용.

예:

```text
공개 SNS post
공개 review
공개 community post
```

Publication review 후 공개 가능하다.

## 6.2 `user_opt_in`

사용자가 Annoying Radar에 직접 제보하고 **Public Radar 근거로 사용되는 데 명시적으로 동의한 경우**.

향후 지원한다.

## 6.3 `private_research`

사용자가 개인 Research 목적으로 붙여넣은 기존 Raw Input.

기본값:

```text
PUBLICATION FORBIDDEN
```

사용자가 개인 분석에서 Confirm했다고 해서 공개 동의로 해석하지 않는다.

## 6.4 `fixture_test`

E2E / fixture / synthetic test data.

```text
PUBLICATION FORBIDDEN
```

Public Radar에 절대 노출하지 않는다.

---

# 7. Public Problem lifecycle

최소 lifecycle:

```text
draft
published
archived
```

## draft

Curator가 문제 제목, 설명, Evidence를 검토하는 단계.

Public read에는 노출하지 않는다.

## published

Publication gate를 통과한 공개 Problem.

검색 / Explore / Problem Detail에서 노출한다.

## archived

더 이상 Public Discovery surface에서 노출하지 않는 상태.

Hard delete가 아니다.

근거 및 history는 보존한다.

### 상태 전이

```text
draft → published
published → archived
archived → published

draft → archived
```

초기에는 `merged`, `rejected`, `superseded` 상태를 추가하지 않는다.

Problem merge/redirect는 실제 중복 운영 사례가 생긴 뒤 후속 Phase에서 설계한다.

---

# 8. Publication gate

Public Problem을 `published`로 전환하려면 최소한 다음을 만족해야 한다.

```text
title not empty
summary not empty
at least 2 Public Evidence Snapshots
at least 2 distinct source_key values
all evidence publication_basis is allowed
no fixture/test evidence
no private_research evidence
```

### 중요한 의미

`2 evidence`는 `2명`을 뜻하지 않는다.

초기 Radar는 author identity를 deduplicate하지 않으므로 다음 표현을 사용한다.

```text
"12명이 겪었습니다"        ❌
"12건의 공개 근거에서 확인" ⭕
```

향후 신뢰할 수 있는 unique-author model이 생길 때만 사람 수를 별도 지표로 도입한다.

---

# 9. Curator authority

## 9.1 Public publication은 일반 authenticated user 권한이 아니다

일반 사용자는 자신의 개인 Research 자산을 관리한다.

Public Problem을 생성 / 편집 / publish / archive하는 권한은 별도 Curator role에 둔다.

권장 entity:

```text
ar_radar_curators
```

최소 필드:

```text
user_id PK
role = owner | editor
created_at
```

초기 mutation authority:

```text
Browser
→ authenticated API
→ requireUser()
→ requireRadarCurator()
→ service-role RPC
→ DB
```

일반 authenticated user가 RPC를 직접 호출해 Public Problem을 publish할 수 없어야 한다.

---

# 10. Recommended Phase 15.1 DB model

## 10.1 `ar_radar_curators`

```text
user_id uuid PK → auth.users.id
role text NOT NULL
created_at timestamptz NOT NULL
```

Allowed role:

```text
owner
editor
```

---

## 10.2 `ar_public_problems`

```text
id uuid PK

title text NOT NULL
summary text NOT NULL
target_user text NULL
situation text NULL
category text NULL

status text NOT NULL DEFAULT 'draft'

created_by_user_id uuid NULL
updated_by_user_id uuid NULL
published_at timestamptz NULL
archived_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

```text
title trim length 1..240
summary trim length 1..4000
category trim length 1..120 when not null
status IN ('draft', 'published', 'archived')
```

### 저장하지 않는 값

초기에는 아래 metric을 denormalized column으로 저장하지 않는다.

```text
evidence_count
source_count
trend_score
mention_count
unique_user_count
```

공개 Evidence snapshot에서 계산한다.

Trend가 필요해질 때 별도 time-series projection을 추가한다.

---

## 10.3 `ar_public_problem_evidence_snapshots`

```text
id uuid PK
public_problem_id uuid NOT NULL → ar_public_problems.id

excerpt text NOT NULL
publication_basis text NOT NULL
source_type text NULL
source_label text NULL
source_url text NULL
source_key text NOT NULL
source_observed_at timestamptz NULL
order_index integer NULL

created_by_user_id uuid NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Allowed `publication_basis`:

```text
external_public
user_opt_in
```

Constraints:

```text
excerpt trim length 1..600
source_key trim length 1..500
order_index >= 0 when present
unique(public_problem_id, source_key, excerpt)
```

`private_research` / `fixture_test`는 이 table에 허용된 enum 자체에 포함하지 않는다.

---

# 11. RLS / security model

## 11.1 Public tables

Public-safe table만 anon read를 허용한다.

### `ar_public_problems`

```text
anon/authenticated SELECT
WHERE status = 'published'
```

### `ar_public_problem_evidence_snapshots`

```text
anon/authenticated SELECT
WHERE parent Public Problem status = 'published'
```

### Direct write

```text
anon INSERT/UPDATE/DELETE      → none
authenticated direct write     → none
```

Mutation은 curator-gated server API + service-role RPC만 사용한다.

---

## 11.2 Private tables

기존 own-row policies를 그대로 유지한다.

Public Radar 구현을 위해 private table RLS를 느슨하게 만들지 않는다.

---

# 12. API boundary

## 12.1 Public read API — no login

```text
GET /api/radar/problems
GET /api/radar/problems/{publicProblemId}
```

List query 후보:

```text
q
category
limit
cursor
```

초기 정렬:

```text
recently published
```

Trend 정렬은 아직 제공하지 않는다.

Public read API는 service-role이 아니라 **RLS를 따르는 public/anon client** 사용을 권장한다.

이렇게 하면 버그가 있어도 private tables를 읽을 권한 자체가 없다.

---

## 12.2 Curator mutation API

```text
POST  /api/radar/admin/problems
PATCH /api/radar/admin/problems/{id}
PATCH /api/radar/admin/problems/{id}/status

POST   /api/radar/admin/problems/{id}/evidence
PATCH  /api/radar/admin/problems/{id}/evidence/{evidenceId}
DELETE /api/radar/admin/problems/{id}/evidence/{evidenceId}
```

Evidence DELETE는 private source 삭제가 아니라 **public snapshot 제거**다.

Published Problem의 Evidence 수정/제거는 publish invariant를 다시 검증해야 한다.

---

# 13. Public UI target

## 13.1 Public Discover

사용자에게 먼저 보여주는 것은 관리 dashboard가 아니다.

```text
사람들이 요즘 무엇을 불편해하고 있을까요?

[ Search ]

최근 발견된 문제
분야별 문제
서비스/주제별 검색
```

초기에는 신뢰할 수 있는 시계열이 없으므로:

```text
🔥 급상승 +38%
```

같은 표현은 제공하지 않는다.

---

## 13.2 Public Problem Detail

최우선 정보 순서:

```text
무슨 문제인가
→ 몇 건의 공개 근거에서 반복되는가
→ 사람들이 실제로 무엇이라고 말했는가
→ 누구에게 / 어떤 상황에서 발생하는가
→ 관련 Problem은 무엇인가
```

처음부터 Research Project / Idea / Alternative / Compare를 전부 노출하지 않는다.

로그인 이후 개인 도구로 자연스럽게 확장한다.

---

# 14. Route migration strategy

현재 `/`는 Personal Raw Input Workspace이고 `/problems`는 Saved Problem Library다.

한 번에 전부 이동하지 않는다.

## Phase 15.1

```text
Public DB / API foundation
No primary navigation flip
```

## Phase 15.2

```text
/radar
/radar/problems/{id}

Public Explore / Detail 구현
```

## Phase 15.3

Public Radar 품질이 확보된 뒤:

```text
/          → Public Radar Home
/workspace → Personal Research Workspace
```

기존 private route는 alias 또는 migration을 통해 안전하게 이동한다.

이 순서로 기존 v0.3 E2E authority를 깨지 않고 제품 전면을 전환한다.

---

# 15. Trend / ranking policy

Phase 15.0에서 Trend는 설계만 하고 구현하지 않는다.

Trend를 공개하려면 최소한 다음이 안정되어야 한다.

```text
동일 Source
동일 Query Scope
동일 수집 주기
동일 Filtering Version
비교 가능한 수집량
```

따라서 초기 Public Radar는:

```text
무엇이 반복되고 있는가
```

에 집중한다.

그 다음에:

```text
무엇이 증가하고 있는가
```

를 추가한다.

---

# 16. Search / category policy

Public category는 개인 Saved Problem category와 별개다.

```text
ar_saved_problem_cards.category
≠ ar_public_problems.category
```

Saved category는 개인 정리 metadata이고 Public category는 Radar 탐색용 curated metadata다.

초기에는 별도 taxonomy table을 만들지 않는다.

`category text`로 시작하고 실제 운영에서 taxonomy drift가 발생할 때 분리한다.

---

# 17. 무엇을 재사용하고 무엇을 분리하는가

## 재사용

```text
LLM Evidence extraction logic
Problem grouping prompt/평가 방식
Evidence-first philosophy
Human review pattern
service-role RPC mutation boundary
existing Research / Idea downstream assets
```

## 분리

```text
Public Problem identity
Public Evidence representation
Public RLS/read model
Curator authority
Public search/discovery surface
External ingestion ownership model
```

### 중요한 수정

과거에는 `Raw Input`을 모든 외부 수집의 공통 envelope로 그대로 사용할 수 있다고 볼 여지가 있었다.

실제 현재 DB를 재검증한 결과 `user_id NOT NULL` 및 same-user/same-Raw-Input invariants가 personal research semantics로 강하게 고정되어 있다.

따라서 Public Radar에서는:

> **현재 분석 로직은 적극 재사용하되, external ingestion storage identity까지 무리하게 재사용한다고 미리 확정하지 않는다.**

UC-17 구현 전에 external observation storage를 별도로 설계할지, 현재 Raw Input을 안전하게 일반화할지를 별도 Phase에서 결정한다.

---

# 18. Out of scope — Phase 15.0

```text
Threads API integration
X integration
Instagram/Facebook ingestion
crawler
scheduled monitoring
trend score
viral score
unique-user estimation
automatic publish
automatic Problem merge
public comments
"나도 겪었어요"
기업 답변 / 신문고
Public Idea generation
external source licensing policy implementation
```

---

# 19. Phase sequence

## Phase 15.0 — Public Radar Domain / Publication Model

현재 문서.

Freeze:

```text
Private/Public identity split
Public Evidence Snapshot
Publication eligibility
Curator authority
Publication gate
Public read boundary
No trend before stable observation
```

## Phase 15.1 — Public Radar DB / API Foundation

예상 migration:

```text
017_public_radar_foundation.sql
```

범위:

```text
ar_radar_curators
ar_public_problems
ar_public_problem_evidence_snapshots
RLS
RPCs
public read API
curator API
contract tests
```

Public UI 전환 없음.

## Phase 15.2 — Public Explore / Problem Detail

```text
/radar
/radar/problems/{id}
```

- no-login read
- search
- category filter
- recent published Problems
- Problem Detail
- representative Evidence
- source links

## Phase 15.3 — Product Front-Door Migration

```text
/ → Public Radar
/workspace → Personal Research Workspace
```

Progressive Disclosure 적용.

## Phase 16 — External Source Acquisition / UC-17

한 Source부터 시작한다.

이 단계에서 external observation storage를 최종 확정한다.

## Phase 17 — Noise / Dedup / Cluster Quality

Gold Set 기반:

```text
Complaint Precision
Evidence Precision
Cluster Purity
Duplicate Problem Rate
Human Correction Rate
```

을 관리한다.

## Phase 18 — Monitoring / Trend / UC-18

stable observation window가 확보된 이후에만 진행한다.

---

# 20. Phase 15.0 final invariants

```text
1. Personal Problem Card와 Public Problem은 다른 canonical identity다.
2. Confirmed Personal Problem은 자동 공개되지 않는다.
3. Private Raw Input / Pain Evidence에 anon read를 열지 않는다.
4. Public Evidence는 curated public-safe snapshot이다.
5. Public Problem은 여러 Source의 Evidence를 aggregation할 수 있다.
6. 일반 authenticated user는 Public Problem을 publish할 수 없다.
7. Public write는 curator-gated server/RPC boundary를 통한다.
8. Public Problem은 최소 2개의 distinct source Evidence를 요구한다.
9. Evidence count를 사람 수로 표현하지 않는다.
10. Trend는 stable observation 조건이 확보되기 전에는 제공하지 않는다.
11. Public category와 Saved Problem category는 별개다.
12. External ingestion storage는 UC-17 전에 별도 설계한다.
```

---

# 21. 설계 판정

Phase 15.0의 핵심 판정은 다음 한 문장이다.

> **Personal Research Domain은 private evidence workspace로 유지하고, Public Radar는 여러 관측 근거를 통합하는 별도 canonical Problem + public-safe Evidence Snapshot 계층으로 구축한다.**

이 경계를 먼저 두면 현재 v0.3 자산을 버리지 않으면서도 Public Discovery 제품으로 확장할 수 있다.

현재 상태:

```text
PHASE_15_0_DESIGN_FROZEN
NEXT: PHASE_15_1_PUBLIC_RADAR_FOUNDATION
```
