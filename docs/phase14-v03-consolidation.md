# Phase 14 — v0.3 Consolidation / Full Product QA

## 1. 목적

Phase 14는 새로운 대형 도메인을 추가하는 단계가 아니다.

Phase 8~13에서 구현된 개인 리서치 자산 기능을 v0.3 제품 기준선으로 정리하고, 역사 문서의 v0.3 후보 가운데 실제 누락된 사용자 흐름을 닫은 뒤 하나의 strict browser QA gate로 관리 surface를 통합 검증한다.

## 2. Authority

작업 기준은 현재 GitHub `main`과 hosted Supabase다.

역사 `Usecase_v2.1.md`의 v0.3 후보:

```text
- 아이디어 보드
- 문제 후보 비교
- 경쟁 서비스 메모
- 마크다운 리포트 내보내기
- 프로젝트 단위 관리
- 카테고리별 문제 아카이브
```

Phase 14 audit 시점의 실제 상태:

| 후보 | 현재 구현 |
|---|---|
| Idea Board | Phase 10 완료 |
| Problem Comparison | Phase 11 완료 |
| Existing Service / Alternative Notes | Phase 12 완료 |
| Markdown Export | Phase 13 완료 |
| Research Project | Phase 9 완료 |
| Category Problem Archive | category metadata는 존재하지만 archive/filter UX는 없음 |

따라서 기능 gap은 `카테고리별 문제 아카이브` 하나다.

## 3. Category Archive 결정

새 category entity를 만들지 않는다.

Canonical category 값:

```text
ar_saved_problem_cards.category
```

Phase 14에서는 이를 read-only 탐색 projection으로 사용한다.

```text
/problems?category={exact-category}
/problems?status=archived&category={exact-category}
```

규칙:

- category는 Saved Problem metadata다.
- Problem Card identity를 바꾸지 않는다.
- 별도 category table 없음.
- taxonomy CRUD 없음.
- hierarchy 없음.
- rename propagation 없음.
- 동일 category 문자열은 하나의 탐색 bucket으로 집계한다.
- active/archive status filter와 category filter는 독립적으로 조합한다.
- category query는 trim 후 1~120자만 허용한다.

## 4. Consolidation 정리

Phase 14에서 제품 표면의 오래된 설명을 현재 상태에 맞춘다.

- 홈의 `Phase 1` 표기를 제거하고 `v0.3 · Personal Research Workspace`로 갱신한다.
- Raw Input은 계속 첫 경험 / primary workspace로 유지한다.
- 홈에 Saved Problems / Problem Compare / Idea Board / Research Projects 재진입 링크를 제공한다.
- README를 실제 v0.3 capability, security boundary, release/live commands 기준으로 갱신한다.

## 5. Full Product QA 경계

기존 `npm run e2e:live`는 Raw Input → Evidence → Candidate → Problem Card → Idea Candidate의 실제 AI vertical slice authority다.

Phase 14는 그 paid/live AI flow를 중복 실행하지 않는다.

새 gate:

```text
npm run e2e:v0.3:live
```

은 기존 hosted research asset을 대상으로 아래 management surface를 한 로그인 세션에서 검증한다.

```text
protected route redirect
→ manual login
→ v0.3 home / Raw Input workspace
→ Saved Problem library
→ category archive/filter
→ active/archive filter context preservation
→ Problem Comparison
→ Problem detail management panels
→ Idea Board
→ Idea detail
→ Research Projects active/archived discovery
→ Project detail
→ Problem / Idea / Project Markdown export read smoke
→ zero browser page errors
→ zero hydration errors
```

이 gate는 read-only다.

금지:

```text
POST
PATCH
DELETE
AI generation
hosted cleanup mutation
```

따라서 Live QA 전후 canonical hosted data는 0-delta여야 한다.

## 6. v0.3 Completion 기준

Phase 14를 닫기 위한 조건:

1. category archive/filter contract tests PASS
2. full unit/contract suite PASS
3. release hardening PASS
4. Next.js build PASS
5. runtime smoke PASS
6. exact feature-head CI PASS
7. `e2e:v0.3:live` strict PASS
8. hosted poststate 0-delta
9. expected-head merge
10. merged-main exact-SHA CI PASS

최종 lifecycle:

```text
PHASE_14_SUCCESS / V0_3_CLOSED
```

## 7. v0.4 이후

v0.3 closure 이후 다음 제품 확장 후보는 역사 문서 기준으로 다음과 같다.

```text
UC-17 external URL automatic collection
UC-18 automatic trend monitoring
```

두 기능은 현재 Phase 14 범위에 포함하지 않는다.
