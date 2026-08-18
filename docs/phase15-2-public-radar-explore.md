# Phase 15.2 — Public Radar Explore / Search UX

## 1. 목적

Phase 15.2는 Phase 15.0/15.1의 Public Radar domain을 실제 사용자 진입 화면으로 연결한다.

핵심 목표는 다음 한 질문에 즉시 답하는 것이다.

> **사람들이 요즘, 무엇을 불편해하고 있을까요?**

Public 사용자는 로그인 없이 Problem을 검색하고, 공개 Problem을 열고, 실제 Evidence와 출처를 확인할 수 있어야 한다.

---

## 2. Route freeze

```text
/                                  Public Radar Explore / Search
/radar/problems/{publicProblemId}  Public Problem Detail
/workspace                         Personal Research Workspace (authenticated)
/login                             Workspace login
```

기존 `/` Raw Input 작업대는 `/workspace`로 이동한다.

이 변경은 기존 Personal Research 기능을 제거하는 것이 아니라 제품 전면 우선순위를 다음처럼 바꾸는 것이다.

```text
Before
/ → Raw Input 작업대

After
/ → Problem Discovery Radar
/workspace → Raw Input + Personal Research
```

---

## 3. Public Explore 원칙

Public 홈에서 보여주는 것은 backend object가 아니라 `published` Public Problem이다.

금지:

```text
Raw Input
Pain Evidence
Problem Candidate
Candidate status
Research Project
Idea Candidate
```

허용:

```text
Problem title
Problem summary
category
공개 Evidence count
published date
```

Search는 기존 Public Radar read projection만 사용한다.

```text
ar_public_problem_feed
```

Public UI에서 service-role client를 사용하지 않는다.

---

## 4. Empty state

Phase 15.2 구현 시점 hosted Public Problem은 0건이다.

샘플/fixture/fake Problem을 production에 넣지 않는다.

따라서 초기 화면은 실제 상태를 그대로 표현한다.

```text
아직 공개된 문제가 없습니다.
어노잉 레이더는 검증된 Problem만 공개합니다.
```

검색 결과가 없을 때도 동일하게 거짓 결과를 생성하지 않는다.

---

## 5. Search UX

홈에서 query와 category를 함께 사용할 수 있다.

```text
?q=헬스장
?category=운동
?q=헬스장&category=운동
```

초기 category chip:

```text
배달
취업
운동
금융
쇼핑
여행
```

이 목록은 탐색 진입용 UI vocabulary일 뿐, Public Problem category를 enum으로 제한하는 DB contract가 아니다.

---

## 6. Problem list language

Evidence count는 사람 수로 표현하지 않는다.

허용:

```text
12건의 공개 근거
12건의 공개 근거에서 확인
```

금지:

```text
12명이 겪었습니다
12명의 사용자
```

unique-author identity를 검증하지 않은 상태에서 사람 수로 과장하지 않는다.

---

## 7. Problem Detail information order

상세 화면은 dashboard가 아니라 editorial reading surface로 구성한다.

순서:

```text
1. Problem title
2. Problem summary
3. target user / situation
4. 실제 공개 Evidence
5. 원문 provenance
6. 같은 category의 Problem으로 탐색 복귀
```

초기 상세 화면에서 제외:

```text
internal scores
cluster confidence
candidate status
private lineage
curator identity
source_key
trend score
Research management controls
Idea management controls
```

---

## 8. Provenance

Public Evidence에는 public-safe projection만 사용한다.

UI는 다음 필드만 사용한다.

```text
excerpt
source_type
source_label
source_url
source_observed_at
```

`source_key`, private Evidence ID, private Problem lineage 등 내부 metadata는 공개하지 않는다.

`source_url`이 존재하면 새 탭에서 원문으로 돌아갈 수 있도록 한다.

---

## 9. Authentication boundary

Discovery는 로그인 전에 완결돼야 한다.

```text
Explore
Search
Problem Detail
Evidence / Source 확인
```

은 로그인 불필요다.

로그인 성공 후에는 `/workspace`로 이동한다.

로그아웃 후에는 `/` Public Radar로 돌아온다.

---

## 10. Trust copy

Public Radar에는 다음 관측 범위 고지를 유지한다.

> 어노잉 레이더는 인터넷 전체의 여론을 대표하지 않습니다. 관측하고 검증한 공개 근거의 범위 안에서 Problem을 보여드립니다.

Trend / 급상승 / 전체 인터넷 비율은 Phase 15.2에서 제공하지 않는다.

---

## 11. Non-goals

Phase 15.2에서는 다음을 구현하지 않는다.

- 외부 Source Adapter
- Threads/X 수집
- Trend
- Related Problem graph
- Public Save
- Follow / Alert
- 직접 불편 제보
- Public → Research one-click conversion
- curator management UI
- fixture Problem seed

이들은 실제 Public Problem 공급과 Explore UX 검증 이후 후속 Phase로 분리한다.

---

## 12. Acceptance criteria

Phase 15.2 완료 조건:

1. `/`가 로그인 여부와 무관하게 Public Radar를 표시한다.
2. 공개 Problem list가 `ar_public_problem_feed` 기반으로 조회된다.
3. query/category 검색이 동작한다.
4. `/radar/problems/{id}`가 공개 Evidence와 source URL을 표시한다.
5. private/internal metadata는 Public UI에 노출되지 않는다.
6. `/workspace`가 기존 Raw Input 작업대를 보존한다.
7. 비로그인 `/workspace` 접근은 `/login`으로 이동한다.
8. 로그인 성공 시 `/workspace`로 이동한다.
9. production에 fake Public Problem을 추가하지 않는다.
10. contract test / lint / build가 통과한다.
