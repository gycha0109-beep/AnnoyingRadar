# 어노잉 레이더 — ImplementationPlan_v1.3.md

## 0. 문서 목적

이 문서는 **어노잉 레이더** v0.1의 실제 구현 순서를 정의한다.

기준 문서:

```text
Usecase_v2.1.md
Sequence_v1.1.md
ERD_v1.2.md
```

v1.3 수정 핵심:

```text
1. Raw Input 수정 시 기존 Evidence/Candidate 처리 규칙 추가
2. Candidate 생성 트랜잭션을 Postgres RPC 기준으로 명시
3. Candidate 확정 조건 문구를 candidate.status = draft로 정정
4. force 재추출 허용 조건과 금지 조건 명시
5. force=true 처리 조건과 실제 처리 단계의 상태 조건 충돌 수정
6. v0.1 완료 기준에 raw_text/force 차단 조건과 RPC 트랜잭션 조건 반영
7. v1.2에서 누락된 20번 완료 기준 반영을 실제 본문에 적용
```

v0.1 구현 목표:

```text
사용자가 불만/리뷰/커뮤니티 텍스트를 붙여넣는다.
AI가 Pain Evidence를 추출한다.
사용자가 Evidence를 검토/확정한다.
AI가 확정 Evidence를 Problem Candidate로 묶는다.
사용자가 의미 있는 후보를 Problem Card로 확정한다.
```

---

## 1. v0.1 구현 범위

### 1.1 포함

```text
1. 로그인 사용자 기준 데이터 저장
2. Raw Input 생성
3. Pain Evidence AI 추출
4. Evidence 검토/수정/삭제/확정
5. 확정 Evidence 기반 Problem Candidate 생성
6. Problem Candidate 목록/상세 조회
7. Candidate 제목/요약 수정
8. Candidate 확정/폐기/복구
9. confirmed Candidate를 Problem Card로 표시
10. 최근 분석 3개 빠른 재진입
```

### 1.2 제외

```text
1. 별도 problem_cards 테이블
2. 프로젝트 단위 관리
3. Idea Candidate 생성
4. Idea Board
5. 리포트 export
6. 외부 URL 자동 수집
7. 자동 트렌드 모니터링
8. 구현 난이도 자동 판단
9. 경쟁 서비스 메모
```

---

## 2. 핵심 결정 사항

| 항목 | 결정 |
|---|---|
| 핵심 테이블 | raw_inputs / pain_evidences / problem_candidates / problem_evidence_links |
| 로그인 전제 | user_id 포함 |
| Problem Card | problem_candidates.status = confirmed |
| Link 검증 | DB trigger로 user_id/raw_input_id 일치 강제 |
| 클라이언트 write | v0.1에서는 금지 |
| DB 접근 | 서버 API Route에서 수행 |
| LLM 호출 | 서버에서만 수행 |
| 상태 관리 | raw_inputs.analysis_status |
| Evidence Count | 저장 컬럼으로 관리 |
| 프로젝트 관리 | v0.2 이후 |

---

## 3. 전체 구현 순서

```text
STEP 1. Supabase DB 스키마 적용
STEP 2. RLS / 접근 정책 적용
STEP 3. 서버 DB 클라이언트 구성
STEP 4. 인증/사용자 확인 유틸 구성
STEP 5. Raw Input API 구현
STEP 6. Evidence Extraction API 구현
STEP 7. Evidence Review API 구현
STEP 8. Candidate Grouping API 구현
STEP 9. Candidate Review API 구현
STEP 10. 화면 구현
STEP 11. 검증 및 테스트
```

---

# 4. STEP 1 — Supabase DB 스키마 적용

## 4.1 목표

ERD_v1.2 기준으로 v0.1 핵심 테이블을 생성한다.

```text
raw_inputs
pain_evidences
problem_candidates
problem_evidence_links
```

## 4.2 적용 순서

```text
1. pgcrypto extension
2. raw_inputs
3. pain_evidences
4. problem_candidates
5. problem_evidence_links
6. 관계 검증 trigger
7. updated_at trigger
8. indexes
9. RLS enable
10. RLS policies
```

## 4.3 필수 주의사항

`problem_evidence_links` 생성 후 반드시 관계 검증 trigger를 적용한다.

검증 조건:

```text
problem_candidate.user_id = pain_evidence.user_id
problem_candidate.raw_input_id = pain_evidence.raw_input_id
```

이 trigger가 없으면 다른 분석 건의 Evidence가 잘못 연결될 수 있다.

## 4.4 DB 완료 기준

```text
raw_inputs 생성 가능
pain_evidences 생성 가능
problem_candidates 생성 가능
problem_evidence_links 생성 가능
다른 raw_input 간 link 생성 시 DB 에러 발생
다른 user 간 link 생성 시 DB 에러 발생
updated_at 자동 갱신 확인
```

---

# 5. STEP 2 — RLS / 접근 정책 적용

## 5.1 목표

사용자별 데이터 격리를 보장한다.

v0.1 권장 구조:

```text
Client
→ Server API Route
→ Supabase service role
→ DB
```

## 5.2 RLS 원칙

```text
RLS enabled
client direct write blocked
read도 가능하면 server API 경유
service role은 서버에서만 사용
```

## 5.3 RLS 적용 대상

```text
raw_inputs
pain_evidences
problem_candidates
problem_evidence_links
```

## 5.4 v0.1 정책

```text
select: 사용자는 자기 데이터만 조회 가능
insert/update/delete: 클라이언트 직접 허용하지 않음
```

서버 API는 service role을 사용할 수 있다.

단, service role은 RLS를 우회하므로 서버 API에서 반드시 다음을 검증한다.

```text
현재 로그인 사용자 ID
요청 대상 raw_input.user_id
요청 대상 evidence.user_id
요청 대상 candidate.user_id
```

## 5.5 RLS 완료 기준

```text
로그인하지 않은 사용자는 데이터 조회 불가
A 사용자는 B 사용자의 raw_inputs 조회 불가
A 사용자는 B 사용자의 evidence 조회 불가
A 사용자는 B 사용자의 candidate 조회 불가
클라이언트에서 직접 insert/update/delete 불가
서버 API에서는 본인 데이터만 처리 가능
```

---

# 6. STEP 3 — 서버 DB 클라이언트 구성

## 6.1 목표

서버 API Route에서 Supabase DB에 안전하게 접근한다.

## 6.2 필요한 클라이언트

### 6.2.1 Server Auth Client

현재 로그인 사용자를 확인한다.

```text
현재 세션 조회
현재 user.id 조회
로그인 여부 검증
```

### 6.2.2 Server Service Client

서버 API에서 DB 작업을 수행한다.

```text
insert
update
delete
select
LLM 결과 저장
상태 변경
```

주의:

```text
service role key는 서버 환경변수에서만 사용한다.
브라우저 번들에 노출되면 안 된다.
```

## 6.3 환경변수

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY 또는 ANTHROPIC_API_KEY
```

## 6.4 완료 기준

```text
서버 API에서 현재 user.id를 가져올 수 있다.
서버 API에서 service role client로 DB 쓰기가 가능하다.
service role key가 클라이언트 번들에 포함되지 않는다.
로그인하지 않은 요청은 401을 반환한다.
```

---

# 7. STEP 4 — 인증/사용자 확인 유틸 구성

## 7.1 목표

모든 API Route에서 반복되는 사용자 검증을 공통화한다.

## 7.2 유틸 목록

```text
requireUser()
assertRawInputOwner(rawInputId, userId)
assertEvidenceOwner(evidenceId, userId)
assertCandidateOwner(candidateId, userId)
assertRawInputCanTransition(rawInputId, nextStatus)
```

## 7.3 requireUser()

```text
현재 세션 조회
로그인하지 않은 경우 401
로그인한 경우 user 반환
```

반환:

```text
{
  userId: string
}
```

## 7.4 assertRawInputOwner(rawInputId, userId)

검증:

```text
raw_inputs.id = rawInputId
raw_inputs.user_id = userId
```

실패:

```text
404 또는 403
```

권장:

```text
존재 여부 노출을 줄이려면 404 반환
```

## 7.5 assertEvidenceOwner(evidenceId, userId)

```text
pain_evidences.id = evidenceId
pain_evidences.user_id = userId
```

## 7.6 assertCandidateOwner(candidateId, userId)

```text
problem_candidates.id = candidateId
problem_candidates.user_id = userId
```

## 7.7 assertRawInputCanTransition(rawInputId, nextStatus)

```text
현재 analysis_status
요청 nextStatus
허용된 상태 전이 여부
```

허용 전이:

```text
idle → input_saved
input_saved → extracting
extracting → reviewing_evidence
extracting → extraction_failed
extraction_failed → extracting
reviewing_evidence → grouping
grouping → reviewing_candidates
grouping → grouping_failed
grouping_failed → grouping
reviewing_candidates → completed
```

## 7.8 완료 기준

```text
모든 쓰기 API가 requireUser()를 통과한다.
모든 상세 조회/수정 API가 owner 검증을 수행한다.
잘못된 상태 전이는 400 또는 409를 반환한다.
```

---

# 8. STEP 5 — Raw Input API 구현

## 8.1 목표

사용자가 원문 텍스트와 출처 정보를 저장한다.

상태 책임:

```text
idle → input_saved
```

## 8.2 API 목록

```text
POST /api/raw-inputs
GET /api/raw-inputs/[rawInputId]
PATCH /api/raw-inputs/[rawInputId]
GET /api/raw-inputs/recent
```

## 8.3 POST /api/raw-inputs

### 요청

```json
{
  "raw_text": "string",
  "source_type": "string | null",
  "source_url": "string | null",
  "source_memo": "string | null",
  "language": "string | null"
}
```

### 처리

```text
1. requireUser()
2. raw_text 검증
3. content_hash 생성
4. raw_inputs insert
5. user_id = current user id
6. analysis_status = input_saved
7. raw_input_id 반환
```

### 응답

```json
{
  "raw_input_id": "uuid",
  "analysis_status": "input_saved"
}
```

### 실패

```text
401: 로그인 필요
400: raw_text 없음
413: raw_text 너무 김
500: DB 저장 실패
```

## 8.4 GET /api/raw-inputs/[rawInputId]

```text
1. requireUser()
2. raw_input owner 검증
3. raw_input 반환
```

## 8.5 PATCH /api/raw-inputs/[rawInputId]

허용 수정:

```text
raw_text
source_type
source_url
source_memo
language
```

처리:

```text
1. requireUser()
2. raw_input owner 검증
3. 수정 가능 상태인지 확인
4. raw_text 수정 여부 확인
5. raw_text가 바뀌지 않았다면 source 필드만 update
6. raw_text가 바뀌었다면 downstream 데이터 처리 규칙 적용
7. raw_input update
8. 필요한 경우 analysis_status = input_saved
```

수정 가능 상태:

```text
input_saved
reviewing_evidence
extraction_failed
```

### Raw Text 수정 규칙

`raw_text`는 분석의 원본이므로 수정 시 기존 Evidence/Candidate와의 정합성을 반드시 정리한다.

v0.1 정책:

```text
confirmed Candidate가 없는 경우에만 raw_text 수정 허용
confirmed Candidate가 있으면 raw_text 수정 금지
confirmed Candidate가 있으면 새 Raw Input으로 다시 분석하도록 유도
```

raw_text 수정 시 처리:

```text
1. 해당 raw_input_id의 confirmed Candidate 존재 여부 확인
2. confirmed Candidate가 있으면 409 반환
3. confirmed Candidate가 없으면 기존 draft/discarded Candidate와 Link 삭제
4. 기존 draft/confirmed Evidence는 deleted 처리 또는 재생성 대상 처리
5. v0.1 기본은 기존 Evidence를 deleted 처리
6. raw_inputs.analysis_status = input_saved
7. content_hash 재계산
```

상태별 처리:

| 현재 상태 | raw_text 수정 | 처리 |
|---|---:|---|
| input_saved | 허용 | raw_text/source update, input_saved 유지 |
| extraction_failed | 허용 | raw_text/source update, input_saved로 변경 |
| reviewing_evidence | 허용 | 기존 Evidence deleted 처리 후 input_saved로 변경 |
| grouping | 금지 | 409 반환 |
| grouping_failed | 제한 허용 | confirmed Candidate 없을 때만 input_saved로 변경 |
| reviewing_candidates | confirmed Candidate 없을 때만 허용 | draft Candidate/Link 삭제 후 input_saved |
| completed | 금지 | 새 Raw Input 생성 유도 |

금지 이유:

```text
원문이 바뀌면 기존 Evidence, Candidate, Link의 근거가 깨진다.
확정 Problem Card가 있는 분석은 원문 수정 대신 새 분석으로 분리한다.
```

## 8.6 GET /api/raw-inputs/recent

최근 분석 3개를 반환한다.

```text
1. requireUser()
2. raw_inputs where user_id = current user id
3. order by updated_at desc
4. limit 3
```

## 8.7 완료 기준

```text
로그인 사용자만 Raw Input 생성 가능
생성된 Raw Input에 user_id 저장
다른 사용자의 Raw Input 조회 불가
최근 3개 조회 가능
```

---

# 9. STEP 6 — Evidence Extraction API 구현

## 9.1 목표

Raw Input에서 Pain Evidence draft를 생성한다.

상태 책임:

```text
input_saved → extracting → reviewing_evidence
extraction_failed → extracting → reviewing_evidence
extracting → extraction_failed
```

## 9.2 API

```text
POST /api/raw-inputs/[rawInputId]/extract
```

## 9.3 요청

```json
{
  "force": false
}
```

`force = true`인 경우 기존 draft evidence를 재생성할 수 있다.

v0.1 기본값은 `false`다.

### force 재추출 정책

v0.1에서는 `force=true`를 제한적으로만 허용한다.

허용 조건:

```text
analysis_status가 extraction_failed 또는 reviewing_evidence
confirmed Candidate가 없음
Problem Card로 확정된 결과가 없음
요청 사용자가 raw_input 소유자임
```

금지 조건:

```text
confirmed Candidate가 1개 이상 존재
analysis_status = grouping
analysis_status = reviewing_candidates
analysis_status = completed
다른 사용자의 raw_input
```

force 재추출 처리:

```text
1. 기존 confirmed Candidate 존재 여부 확인
2. confirmed Candidate가 있으면 409 반환
3. 기존 draft Evidence를 deleted 처리
4. 기존 draft/discarded Candidate와 Link 삭제
5. analysis_status = extracting
6. LLM 재추출 수행
7. 새 PainEvidence draft 저장
8. analysis_status = reviewing_evidence
```

정책 이유:

```text
확정된 Problem Card가 있는 분석은 재추출로 덮어쓰지 않는다.
사용자가 다시 분석하고 싶으면 새 Raw Input을 생성한다.
```

## 9.4 처리

```text
1. requireUser()
2. raw_input owner 검증
3. force 값 확인
4. force=false이면 analysis_status가 input_saved 또는 extraction_failed인지 확인
5. force=true이면 analysis_status가 extraction_failed 또는 reviewing_evidence인지 확인
6. force=true이면 confirmed Candidate가 없는지 확인
7. force=true이면 기존 draft Evidence를 deleted 처리
8. force=true이면 기존 draft/discarded Candidate와 Link 삭제
9. analysis_status = extracting
10. raw_text를 LLM 입력 단위로 정리
11. EvidenceExtractor 실행
12. LLM 응답 파싱
13. PainEvidence draft 저장
14. raw_inputs.analysis_status = reviewing_evidence
15. Evidence 목록 반환
```

상태별 extract 허용 규칙:

| 현재 상태 | force=false | force=true | 처리 |
|---|---:|---:|---|
| input_saved | 허용 | 비권장 | 일반 추출 |
| extraction_failed | 허용 | 허용 | 재시도 추출 |
| reviewing_evidence | 금지 | 허용 | 기존 draft 정리 후 재추출 |
| grouping | 금지 | 금지 | 409 |
| grouping_failed | 금지 | 금지 | grouping 재시도 대상 |
| reviewing_candidates | 금지 | 금지 | 409 |
| completed | 금지 | 금지 | 새 Raw Input 생성 유도 |

force=true 추가 차단:

```text
confirmed Candidate가 있으면 무조건 409
다른 사용자의 Raw Input이면 404
```

## 9.5 EvidenceExtractor 책임

```text
raw_text 정리
텍스트 길이 제한 처리
LLM 프롬프트 생성
LLM 호출
응답 JSON 파싱
불량 응답 방어
PainEvidence DTO 반환
```

## 9.6 LLM 출력 형식

```json
[
  {
    "original_text": "원문에서 추출한 문장",
    "summary_ko": "한국어 요약",
    "pain_type": "usability",
    "target_user": "대상 사용자",
    "situation": "문제가 발생한 상황",
    "sentiment_level": "negative",
    "intensity_level": "medium"
  }
]
```

## 9.7 저장 규칙

```text
user_id = current user id
raw_input_id = rawInputId
status = draft
source_type = raw_inputs.source_type
source_url = raw_inputs.source_url
source_memo = raw_inputs.source_memo
order_index = LLM 반환 순서
```

## 9.8 실패 처리

LLM 호출 실패:

```text
analysis_status = extraction_failed
500 또는 502 반환
```

LLM 파싱 실패:

```text
analysis_status = extraction_failed
502 반환
```

추출 결과 없음:

```text
analysis_status = reviewing_evidence
빈 배열 반환
```

## 9.9 완료 기준

```text
정상 추출 시 Evidence draft 저장
Evidence에 user_id 저장
Evidence에 raw_input_id 저장
Evidence source 정보 복사
실패 시 extraction_failed로 변경
다른 사용자 Raw Input 추출 불가
```

---

# 10. STEP 7 — Evidence Review API 구현

## 10.1 목표

사용자가 Pain Evidence를 검토, 수정, 삭제, 확정한다.

상태 책임:

```text
reviewing_evidence → grouping
```

## 10.2 API 목록

```text
GET /api/raw-inputs/[rawInputId]/evidence
PATCH /api/raw-inputs/[rawInputId]/evidence
PATCH /api/raw-inputs/[rawInputId]/evidence/confirm
```

## 10.3 GET /api/raw-inputs/[rawInputId]/evidence

```text
1. requireUser()
2. raw_input owner 검증
3. pain_evidences where user_id and raw_input_id
4. status != deleted 기본 조회
5. order by order_index asc, created_at asc
```

## 10.4 PATCH /api/raw-inputs/[rawInputId]/evidence

허용 필드:

```text
summary_ko
pain_type
target_user
situation
sentiment_level
intensity_level
status
order_index
```

처리:

```text
1. requireUser()
2. raw_input owner 검증
3. 각 evidence가 user_id/raw_input_id에 속하는지 검증
4. 허용 필드만 update
5. 수정 결과 반환
```

## 10.5 PATCH /api/raw-inputs/[rawInputId]/evidence/confirm

### 요청

```json
{
  "confirmed_evidence_ids": ["uuid"],
  "deleted_evidence_ids": ["uuid"]
}
```

### 처리

```text
1. requireUser()
2. raw_input owner 검증
3. analysis_status = reviewing_evidence인지 확인
4. confirmed_evidence_ids가 1개 이상인지 확인
5. 모든 evidence가 user_id/raw_input_id에 속하는지 확인
6. selected evidence status = confirmed
7. deleted evidence status = deleted
8. raw_inputs.analysis_status = grouping
9. 결과 반환
```

## 10.6 완료 기준

```text
Evidence 수정 가능
Evidence 삭제 처리 가능
Evidence 확정 가능
확정 Evidence 없으면 grouping 진입 불가
다른 사용자의 Evidence 수정 불가
다른 Raw Input의 Evidence 섞기 불가
```

---

# 11. STEP 8 — Candidate Grouping API 구현

## 11.1 목표

confirmed Evidence를 유사 문제 단위로 묶어 Problem Candidate draft를 생성한다.

상태 책임:

```text
grouping → reviewing_candidates
grouping → grouping_failed
grouping_failed → grouping
```

## 11.2 API

```text
POST /api/raw-inputs/[rawInputId]/candidates/group
```

## 11.3 처리

```text
1. requireUser()
2. raw_input owner 검증
3. analysis_status가 grouping 또는 grouping_failed인지 확인
4. confirmed Evidence 조회
5. confirmed Evidence가 1개 이상인지 확인
6. CandidateGrouper 실행
7. LLM 응답 파싱
8. 기존 draft candidate 처리 정책 적용
9. problem_candidates draft 저장
10. problem_evidence_links 저장
11. evidence_count 계산/저장
12. raw_inputs.analysis_status = reviewing_candidates
13. Candidate 목록 반환
```

## 11.4 CandidateGrouper 책임

```text
confirmed Evidence 목록 정리
묶기 기준 프롬프트 생성
LLM 호출
응답 JSON 파싱
candidate DTO 생성
candidate-evidence link DTO 생성
```

## 11.5 묶기 기준

```text
같은 사용자
같은 상황
같은 행동 흐름
같은 해결 방향
표현만 다른 같은 문제
```

## 11.6 LLM 출력 형식

```json
[
  {
    "title": "문제 후보 제목",
    "summary": "문제 요약",
    "target_user": "대상 사용자",
    "situation": "발생 상황",
    "evidence_ids": ["uuid"],
    "intensity_level": "medium",
    "repeat_pattern_level": "moderate",
    "clarity_level": "clear"
  }
]
```

## 11.7 저장 규칙

Problem Candidate:

```text
user_id = current user id
raw_input_id = rawInputId
status = draft
evidence_count = linked evidence count
order_index = LLM 반환 순서
```

Problem Evidence Link:

```text
problem_candidate_id
pain_evidence_id
```

DB trigger가 다음을 강제한다.

```text
candidate.user_id = evidence.user_id
candidate.raw_input_id = evidence.raw_input_id
```

## 11.8 기존 draft candidate 처리 정책

v0.1 기본 정책:

```text
재그룹핑 시 기존 draft candidate와 link를 삭제 후 재생성한다.
confirmed candidate는 삭제하지 않는다.
discarded candidate는 기본적으로 유지한다.
```

단, 동일 Raw Input에서 confirmed candidate가 이미 있으면 재그룹핑 전에 사용자 확인이 필요하다.

## 11.9 실패 처리

LLM 호출 실패:

```text
analysis_status = grouping_failed
502 반환
```

LLM 파싱 실패:

```text
analysis_status = grouping_failed
502 반환
```

Link 저장 실패:

```text
transaction rollback
analysis_status = grouping_failed
500 반환
```

## 11.10 트랜잭션 요구

Candidate 생성과 Link 생성은 하나의 트랜잭션으로 처리한다.

Supabase JS에서 여러 쿼리를 순서대로 호출하는 방식은 트랜잭션이 아니다.

따라서 v0.1에서는 Candidate 생성 묶음을 **Postgres RPC 함수**로 처리한다.

권장 RPC:

```text
create_problem_candidates_from_grouping(raw_input_id, user_id, candidates_json)
```

RPC 내부 필수 처리:

```text
1. raw_input 소유권 확인
2. raw_input analysis_status 확인
3. confirmed Evidence만 사용했는지 확인
4. 기존 draft Candidate와 Link 정리
5. problem_candidates insert
6. problem_evidence_links insert
7. evidence_count 계산/저장
8. raw_inputs.analysis_status = reviewing_candidates
9. 실패 시 전체 rollback
```

필수 묶음:

```text
problem_candidates insert
problem_evidence_links insert
evidence_count update
raw_inputs.analysis_status update
```

중간에 실패하면 전체 rollback한다.

서버 API Route의 책임:

```text
1. requireUser()
2. raw_input owner 검증
3. CandidateGrouper로 candidates_json 생성
4. RPC 호출
5. RPC 결과 반환
```

서버 API Route에서 candidate insert와 link insert를 분리 실행하지 않는다.

## 11.11 완료 기준

```text
confirmed Evidence만 grouping 대상
draft/deleted Evidence는 제외
Candidate draft 생성
Link 생성
evidence_count 저장
다른 사용자 Evidence 연결 불가
다른 Raw Input Evidence 연결 불가
실패 시 grouping_failed
```

---

# 12. STEP 9 — Candidate Review API 구현

## 12.1 목표

사용자가 Problem Candidate를 수정, 확정, 폐기, 복구한다.

상태 책임:

```text
reviewing_candidates → completed
```

## 12.2 API 목록

```text
GET /api/raw-inputs/[rawInputId]/candidates
GET /api/problem-candidates/[candidateId]
PATCH /api/problem-candidates/[candidateId]
PATCH /api/problem-candidates/[candidateId]/confirm
PATCH /api/problem-candidates/[candidateId]/discard
PATCH /api/problem-candidates/[candidateId]/restore
PATCH /api/raw-inputs/[rawInputId]/complete
```

## 12.3 GET /api/raw-inputs/[rawInputId]/candidates

```text
1. requireUser()
2. raw_input owner 검증
3. problem_candidates where user_id and raw_input_id
4. 기본적으로 status != discarded 조회
5. order by order_index asc, created_at asc
```

## 12.4 GET /api/problem-candidates/[candidateId]

```text
1. requireUser()
2. candidate owner 검증
3. candidate 조회
4. 연결된 evidence 조회
5. evidence source 정보 포함 반환
```

## 12.5 PATCH /api/problem-candidates/[candidateId]

허용 필드:

```text
title
summary
target_user
situation
intensity_level
repeat_pattern_level
clarity_level
order_index
```

처리:

```text
1. requireUser()
2. candidate owner 검증
3. 허용 필드만 update
4. 수정 결과 반환
```

## 12.6 PATCH /api/problem-candidates/[candidateId]/confirm

```text
1. requireUser()
2. candidate owner 검증
3. 연결 Evidence 수 확인
4. title not empty 확인
5. evidence_count >= 1 확인
6. status = confirmed
7. 확정된 Candidate를 Problem Card로 반환
```

## 12.7 PATCH /api/problem-candidates/[candidateId]/discard

요청:

```json
{
  "discard_reason": "string | null"
}
```

처리:

```text
1. requireUser()
2. candidate owner 검증
3. status = discarded
4. discard_reason 저장
```

## 12.8 PATCH /api/problem-candidates/[candidateId]/restore

```text
1. requireUser()
2. candidate owner 검증
3. status = draft
4. discard_reason = null
```

## 12.9 PATCH /api/raw-inputs/[rawInputId]/complete

```text
1. requireUser()
2. raw_input owner 검증
3. analysis_status = reviewing_candidates인지 확인
4. analysis_status = completed
```

## 12.10 완료 기준

```text
Candidate 목록 조회 가능
Candidate 상세에서 Evidence 확인 가능
Candidate 수정 가능
근거 없는 Candidate 확정 불가
확정 Candidate는 Problem Card로 표시
폐기 Candidate는 기본 목록에서 숨김
폐기 Candidate 복구 가능
검토 완료 시 Raw Input completed
```

---

# 13. STEP 10 — 화면 구현

## 13.1 화면 목록

```text
1. Input First Page
2. Extracting State
3. Evidence Review Page
4. Grouping State
5. Problem Candidate List Page
6. Problem Candidate Detail Page
7. Problem Card Confirmed State
8. Recent Analyses Entry
```

## 13.2 Input First Page

목적:

```text
원문 텍스트와 출처 정보를 입력한다.
```

구성:

```text
원문 텍스트 textarea
source_type select
source_url input
source_memo input
분석 시작 버튼
최근 분석 3개
```

버튼 처리:

```text
1. POST /api/raw-inputs
2. 성공 시 POST /api/raw-inputs/[rawInputId]/extract
3. Extracting State 표시
```

## 13.3 Extracting State

```text
원문 분석 중
불만 문장 추출 중
실패 시 재시도 버튼
```

실패 처리:

```text
extraction_failed이면 재시도 버튼 표시
```

## 13.4 Evidence Review Page

구성:

```text
Evidence 카드 목록
original_text
summary_ko
pain_type
target_user
situation
intensity_level
삭제 버튼
확정 체크
확정 후 문제 묶기 버튼
```

필수 UX:

```text
확정 Evidence가 0개면 다음 버튼 비활성화
deleted Evidence는 기본 숨김
원문 문장은 명확히 보존 표시
```

## 13.5 Grouping State

```text
비슷한 불만 묶는 중
문제 후보 생성 중
실패 시 재시도 버튼
```

## 13.6 Problem Candidate List Page

카드 표시:

```text
title
summary
target_user
situation
evidence_count
intensity_level
repeat_pattern_level
clarity_level
status
```

기본 필터:

```text
status != discarded
```

정렬:

```text
order_index asc
created_at asc
```

## 13.7 Problem Candidate Detail Page

구성:

```text
제목 수정
요약 수정
대상 사용자 수정
상황 수정
연결 Evidence 목록
Evidence 원문
Evidence 출처
문제 카드로 확정 버튼
폐기 버튼
목록으로 돌아가기
```

확정 조건:

```text
title not empty
evidence_count >= 1
```

## 13.8 Problem Card Confirmed State

표시:

```text
Problem Card 뱃지
title
summary
target_user
situation
evidence_count
핵심 Evidence
```

v0.1에서는 Idea Candidate 생성 CTA를 노출하지 않는다.

## 13.9 Recent Analyses Entry

표시:

```text
raw_text 일부
source_type
analysis_status
updated_at
```

클릭 시 이동:

```text
input_saved → Extracting 가능 상태
reviewing_evidence → Evidence Review Page
grouping/grouping_failed → Grouping State
reviewing_candidates → Candidate List Page
completed → Candidate List 또는 Confirmed Card 목록
```

---

# 14. 핵심 로직

## 14.1 상태 전이 로직

상태 전이는 서버에서만 수행한다.

허용 전이:

```text
idle → input_saved
input_saved → extracting
extracting → reviewing_evidence
extracting → extraction_failed
extraction_failed → extracting
reviewing_evidence → grouping
grouping → reviewing_candidates
grouping → grouping_failed
grouping_failed → grouping
reviewing_candidates → completed
```

금지:

```text
client가 직접 analysis_status 수정
completed 이후 자동 재분석
다른 사용자의 raw_input 상태 변경
```

## 14.2 Evidence 추출 로직

입력:

```text
raw_input.raw_text
source_type
source_memo
```

출력:

```text
PainEvidence draft[]
```

추출 기준:

```text
불편함
짜증
반복되는 귀찮음
시간 낭비
수동 반복 작업
도구 불만
대안 요청
해결되지 않은 니즈
```

제외 기준:

```text
단순 칭찬
광고 문구
정보성 문장
농담
맥락 없는 욕설
문제 없는 해결책
```

## 14.3 Candidate 묶기 로직

입력:

```text
confirmed PainEvidence[]
```

출력:

```text
ProblemCandidate draft[]
ProblemEvidenceLink[]
```

묶기 기준:

```text
같은 사용자
같은 상황
같은 행동 흐름
같은 해결 방향
표현만 다른 같은 문제
```

## 14.4 evidence_count 갱신 로직

갱신 시점:

```text
Candidate 생성
Evidence Link 추가
Evidence Link 제거
Candidate 병합
Candidate 분리
```

v0.1에서 병합/분리는 화면에 노출하지 않을 수 있다.

다만 서버 함수는 후속 확장을 고려해 분리해 둔다.

```text
recalculateEvidenceCount(candidateId)
```

## 14.5 Candidate 확정 로직

확정 가능 조건:

```text
candidate.user_id = current user id
candidate.title not empty
candidate.evidence_count >= 1
candidate.status = draft
```

처리:

```text
status = confirmed
```

확정된 Candidate는 Problem Card로 취급한다.

확정 이후 제한:

```text
confirmed Candidate가 존재하는 raw_input은 raw_text 수정 금지
confirmed Candidate가 존재하는 raw_input은 force 재추출 금지
confirmed Candidate를 기반으로 한 후속 Idea Candidate 생성은 v0.2 이후
```

---

# 15. 트랜잭션 기준

## 15.1 반드시 트랜잭션 처리할 작업

```text
Candidate 생성 + Link 생성 + evidence_count 갱신 + status 변경
Raw Text 수정 시 기존 draft Candidate/Link 정리
force 재추출 시 기존 draft Evidence/Candidate 정리
Candidate 병합
Candidate 분리
Candidate 삭제성 처리와 link 정리
```

v0.1에서 실제로 우선 구현할 트랜잭션:

```text
create_problem_candidates_from_grouping RPC
```

## 15.2 트랜잭션 실패 시 처리

```text
전체 rollback
raw_inputs.analysis_status = grouping_failed
사용자에게 재시도 안내
```

---

# 16. 에러 처리 기준

| 상황 | HTTP | 처리 |
|---|---:|---|
| 로그인 없음 | 401 | 로그인 필요 |
| 소유자 아님 | 404 | 존재하지 않는 리소스로 처리 |
| 잘못된 입력 | 400 | 필드 오류 반환 |
| 잘못된 상태 전이 | 409 | 현재 상태와 가능한 행동 안내 |
| confirmed Candidate 존재 상태에서 raw_text 수정 | 409 | 새 Raw Input 생성 유도 |
| confirmed Candidate 존재 상태에서 force 재추출 | 409 | 새 Raw Input 생성 유도 |
| LLM 호출 실패 | 502 | 재시도 가능 |
| LLM 응답 파싱 실패 | 502 | 재시도 가능 |
| DB trigger 위반 | 400 또는 409 | 잘못된 Evidence 연결 |
| 서버 오류 | 500 | 일반 오류 |

---

# 17. 검증 기준

## 17.1 DB 검증

```text
raw_inputs insert 성공
pain_evidences insert 성공
problem_candidates insert 성공
problem_evidence_links insert 성공
다른 user 간 link insert 실패
다른 raw_input 간 link insert 실패
updated_at 자동 갱신
RLS select 정책 동작
client direct write 차단
```

## 17.2 API 검증

```text
로그인하지 않으면 모든 write API 401
다른 사용자 데이터 조회 불가
Raw Input 생성 후 input_saved
Extraction 성공 후 reviewing_evidence
Extraction 실패 후 extraction_failed
Evidence 확정 후 grouping
Candidate 생성 후 reviewing_candidates
Candidate 확정 후 confirmed
Raw Input 완료 후 completed
confirmed Candidate가 있으면 raw_text 수정 불가
confirmed Candidate가 있으면 force 재추출 불가
force 재추출 시 기존 draft Evidence/Candidate 정리
Candidate 생성은 RPC 단위로 처리
```

## 17.3 화면 검증

```text
원문 입력 가능
분석 시작 가능
추출 로딩 표시
Evidence 목록 표시
Evidence 수정 가능
Evidence 삭제 가능
Evidence 확정 가능
확정 Evidence 0개면 진행 불가
Candidate 목록 표시
Candidate 상세 표시
Candidate 확정 가능
Candidate 폐기 가능
최근 분석 3개 표시
```

## 17.4 보안 검증

```text
다른 사용자 raw_input_id로 API 호출 시 실패
다른 사용자 evidence_id로 API 호출 시 실패
다른 사용자 candidate_id로 API 호출 시 실패
service role key 클라이언트 노출 없음
LLM API key 클라이언트 노출 없음
```

---

# 18. 구현 파일 후보

실제 파일 경로는 프로젝트 구조에 맞게 조정한다.

```text
app/api/raw-inputs/route.js
app/api/raw-inputs/recent/route.js
app/api/raw-inputs/[rawInputId]/route.js
app/api/raw-inputs/[rawInputId]/extract/route.js
app/api/raw-inputs/[rawInputId]/evidence/route.js
app/api/raw-inputs/[rawInputId]/evidence/confirm/route.js
app/api/raw-inputs/[rawInputId]/candidates/group/route.js
app/api/raw-inputs/[rawInputId]/candidates/route.js
app/api/raw-inputs/[rawInputId]/complete/route.js

app/api/problem-candidates/[candidateId]/route.js
app/api/problem-candidates/[candidateId]/confirm/route.js
app/api/problem-candidates/[candidateId]/discard/route.js
app/api/problem-candidates/[candidateId]/restore/route.js

lib/supabase/server.js
lib/supabase/service.js
lib/auth/require-user.js
lib/raw-inputs/service.js
lib/evidence/extractor.js
lib/evidence/service.js
lib/candidates/grouper.js
lib/candidates/service.js
lib/analysis/status.js
```

---

# 19. 개발 순서 체크리스트

## 19.1 DB

```text
[ ] ERD_v1.2 SQL 적용
[ ] Link 검증 trigger 적용
[ ] updated_at trigger 적용
[ ] indexes 적용
[ ] RLS enable
[ ] select policy 적용
[ ] client write 차단 확인
```

## 19.2 Server Foundation

```text
[ ] server auth client 구성
[ ] service role client 구성
[ ] requireUser 구현
[ ] owner 검증 유틸 구현
[ ] status transition 유틸 구현
[ ] create_problem_candidates_from_grouping RPC 작성
[ ] raw_text 수정 가능 여부 검증 유틸 작성
[ ] force 재추출 가능 여부 검증 유틸 작성
```

## 19.3 Raw Input

```text
[ ] POST raw-inputs
[ ] GET raw-input
[ ] PATCH raw-input
[ ] GET recent raw-inputs
```

## 19.4 Evidence

```text
[ ] EvidenceExtractor 구현
[ ] POST extract API
[ ] GET evidence API
[ ] PATCH evidence API
[ ] PATCH evidence confirm API
```

## 19.5 Candidate

```text
[ ] CandidateGrouper 구현
[ ] POST candidates/group API
[ ] GET candidates API
[ ] GET candidate detail API
[ ] PATCH candidate API
[ ] confirm API
[ ] discard API
[ ] restore API
[ ] complete raw-input API
```

## 19.6 UI

```text
[ ] Input First Page
[ ] Extracting State
[ ] Evidence Review Page
[ ] Grouping State
[ ] Candidate List Page
[ ] Candidate Detail Page
[ ] Confirmed Problem Card State
[ ] Recent Analyses Entry
```

## 19.7 QA

```text
[ ] 정상 흐름 end-to-end
[ ] LLM 실패 흐름
[ ] grouping 실패 흐름
[ ] 다른 사용자 접근 차단
[ ] 다른 raw_input evidence link 차단
[ ] service key 노출 없음
```

---

# 20. v0.1 완료 기준

```text
로그인 사용자가 원문 텍스트를 입력할 수 있다.
AI가 Pain Evidence 초안을 생성한다.
사용자가 Evidence를 검토하고 확정할 수 있다.
확정 Evidence를 기반으로 Problem Candidate가 생성된다.
사용자가 Candidate를 Problem Card로 확정할 수 있다.
확정된 Problem Card는 Evidence 근거와 함께 조회된다.
confirmed Candidate가 있는 분석은 raw_text 수정이 차단된다.
confirmed Candidate가 있는 분석은 force 재추출이 차단된다.
force=true는 extraction_failed 또는 reviewing_evidence에서만 제한적으로 동작한다.
Candidate 생성은 Postgres RPC 트랜잭션으로 처리된다.
사용자별 데이터가 분리된다.
잘못된 Evidence/Candidate 연결은 DB에서 차단된다.
최근 분석 3개로 재진입할 수 있다.
```

---

# 21. 다음 단계

실제 작업 순서:

```text
1. Supabase SQL 작성/적용
2. Candidate 생성 RPC 작성
3. API 기반 골격 구현
4. Raw Text 수정/force 재추출 보호 로직 구현
5. LLM 추출/묶기 연결
6. 화면 연결
7. QA
```

구현 중 판단이 갈리는 경우 우선순위:

```text
1. 사용자 데이터 격리
2. 상태 전이 일관성
3. Evidence 근거 보존
4. Problem Card 확정 기준
5. 화면 편의성
```
