# AnnoyingRadar

불만·리뷰·커뮤니티 원문에서 근거가 붙은 Pain Evidence와 Problem Card를 만들고, 이후 Idea Candidate와 Research Project까지 개인 리서치 자산으로 관리하는 작업대입니다.

## 현재 제품 기준선 — v0.3

핵심 분석 흐름:

```text
Raw Input
→ Pain Evidence 추출/검토
→ Problem Candidate grouping
→ Problem Card 확정
→ completed
```

리서치 자산 흐름:

```text
Problem Card
→ Saved Problem
→ Research Project
→ Idea Candidate / Idea Board
→ Problem Comparison
→ Existing Service / Alternative Notes
→ Deterministic Markdown Export
```

## v0.3 기능

- 로그인 사용자 기준 데이터 격리
- Raw Input 저장, 수정, 최근 재진입
- Live OpenAI Evidence Extraction
- Evidence 검토/수정/삭제/확정
- Evidence 기반 Problem Candidate grouping
- Problem Candidate 검토/확정/폐기
- confirmed Problem Card 저장
- Saved Problem 카테고리·메모·active/archive 관리
- 카테고리별 Saved Problem archive/filter
- Research Project 생성, 수정, archive/restore, Problem/Idea 연결
- Problem Card 기반 Idea Candidate 생성 및 편집
- Idea lifecycle: `candidate / researching / build_soon / paused / discarded / archived`
- Idea Board Kanban projection
- 2–4개 confirmed Problem Card evidence-first 비교
- Problem별 기존 서비스 / 대안 수동 메모 CRUD
- Problem Card / Idea Candidate / Research Project deterministic Markdown export

## 설계 경계

- Problem Card는 별도 테이블이 아니라 `ar_problem_candidates.status = 'confirmed'`입니다.
- Saved Problem은 Problem Card의 관리 projection이며 별도 문제 identity를 만들지 않습니다.
- Idea Board는 기존 `ar_idea_candidates.status`의 projection이며 board 전용 순위/점수/상태를 만들지 않습니다.
- Problem Comparison은 read-only URL projection이며 비교 결과를 저장하지 않습니다.
- 카테고리 archive는 `ar_saved_problem_cards.category`를 그대로 사용하며 category taxonomy/table을 추가하지 않습니다.
- Markdown export는 on-demand deterministic output이며 report table, export history, generated timestamp를 저장하지 않습니다.
- 자동 외부 URL 수집과 자동 트렌드 모니터링은 v0.4 이후 범위입니다.

## 보안 / 데이터 접근

- 사용자 요청은 Supabase Auth session을 확인합니다.
- 읽기는 owner-scoped query + RLS를 사용합니다.
- 주요 write는 서버에서 service-role client를 사용하고 SECURITY DEFINER RPC 계약으로 제한합니다.
- 브라우저에서 service-role credential을 사용하지 않습니다.

## 일반 검증

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run verify
```

`npm run verify`는 lint, unit/contract tests, release hardening, Next.js build, runtime smoke를 실행합니다.

## Live / Browser 검증

환경변수는 프로젝트 루트의 `.env.local` 또는 shell 환경에서 로드합니다.

```bash
npm run e2e:live
npm run e2e:saved-problems:live
npm run e2e:projects:live
npm run e2e:idea-board:live
npm run e2e:problem-comparison:live
npm run e2e:problem-alternatives:live
npm run e2e:markdown-export:live
npm run e2e:v0.3:live
```

각 Live Browser gate는 브라우저를 열고 사용자의 수동 로그인 완료를 감지합니다. `e2e:v0.3:live`는 기존 hosted 자산을 대상으로 v0.3 관리 surface를 한 브라우저 세션에서 read-only로 검증합니다.

Live OpenAI 평가:

```bash
npm run eval:evidence:live
npm run eval:candidates:live
npm run eval:ideas:live
```

## 주요 문서

- `docs/Usecase_v2.1.md` — 제품 유즈케이스와 단계별 범위
- `docs/Sequence_v1.1.md` — 사용자/시스템 흐름
- `docs/DB ERD_v1.2.md` — 초기 ERD와 후속 확장 초안
- `docs/ImplementationPlan_v1.3.md` — v0.1 구현 기준
- `docs/phase10-idea-board.md` — Idea Board 결정
- `docs/phase12-problem-alternatives.md` — Problem alternatives 결정
- `docs/phase13-markdown-research-export.md` — deterministic Markdown export 결정
- `docs/phase14-v03-consolidation.md` — v0.3 consolidation / QA 기준
