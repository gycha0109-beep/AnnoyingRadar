# Phase 15.1H — Publication Lineage Hardening

## 1. 목적

Phase 15.1H는 Phase 15.0의 Public Radar publication model과 Phase 15.1 구현 사이의 남은 경계를 닫는다.

범위는 세 가지다.

```text
1. Public Problem ↔ source Private Problem Card lineage
2. publication quality gate 명시 및 재사용 가능한 DB invariant화
3. published Public Problem의 substantive edit 규칙 고정
```

외부 Source 수집, Trend, Explore UI는 이 단계 범위가 아니다.

---

## 2. Lineage identity

Public Problem과 Private Problem Card는 계속 다른 canonical identity다.

```text
Private Problem Card
= ar_problem_candidates.id where status = 'confirmed'

Public Problem
= ar_public_problems.id
```

Public Problem은 여러 confirmed Private Problem Card에서 도출될 수 있고, 하나의 Private Problem Card 역시 향후 여러 Public Problem의 derivation context가 될 수 있으므로 관계는 N:M이다.

```text
Private Problem A ─┐
Private Problem B ─┼─→ Public Problem P
Private Problem C ─┘
```

이 관계는 `ar_public_problem_candidate_links`에 기록한다.

Lineage는 **publication provenance를 위한 내부 derivation pointer**다. Public read surface에는 노출하지 않는다.

Private Problem이 삭제되면 해당 lineage link도 제거된다. Public Problem과 이미 검토된 Public Evidence Snapshot은 독립적으로 유지된다. Lineage는 private data retention을 강제하는 장치가 아니다.

---

## 3. Lineage eligibility

Public Problem에 연결할 수 있는 Private Problem은 반드시:

```text
ar_problem_candidates.status = 'confirmed'
```

이어야 한다.

`candidate`, `discarded` 등 확정되지 않은 local cluster는 Public Problem의 derivation source로 고정하지 않는다.

또한 `published` Public Problem의 lineage는 직접 변경할 수 없다.

```text
published
→ archive
→ lineage 수정
→ publication gate 재검증
→ republish
```

이 규칙은 공개 중인 Problem의 근거 맥락이 조용히 바뀌는 것을 막는다.

---

## 4. Publication quality gate

Phase 15.1에서 이미 사용하던 gate를 독립 DB invariant로 고정한다.

Public Problem을 `published`로 전환하려면:

```text
title non-empty
summary non-empty
Public Evidence Snapshot >= 2
distinct source_key >= 2
publication_basis ∈ { external_public, user_opt_in }
```

이어야 한다.

이 검증은 `ar_assert_public_problem_publishable(public_problem_id)`가 담당하고 publication status transition이 이를 호출한다.

### Lineage는 publication 필수 조건이 아니다

Public Problem은 향후 외부 Source Adapter의 signal에서 직접 만들어질 수도 있다.

따라서:

```text
source Private Problem Card >= 1
```

은 publish hard gate로 두지 않는다.

Lineage는 존재할 때 보존하는 derivation context이고, 모든 Public Problem의 필수 생성 경로는 아니다.

---

## 5. Published substantive edit rule

`published` 상태의 Public Problem은 공개 representation을 직접 수정할 수 없다.

잠그는 영역:

```text
title
summary
target_user
situation
category
Public Evidence Snapshot
publication lineage
```

수정이 필요하면:

```text
published
→ archived
→ metadata / Evidence / lineage 수정
→ publication gate 재검증
→ published
```

으로 처리한다.

이 규칙은 공개 중인 canonical Problem이 audit 없이 의미적으로 변하는 것을 막는다.

`published_at`은 republish 시점으로 갱신된다.

---

## 6. Security boundary

`ar_public_problem_candidate_links`는 curator 내부 데이터다.

```text
anon          → direct access 없음
authenticated → direct access 없음
service_role  → admin read 가능
mutation      → curator-authorized SECURITY DEFINER RPC만 가능
```

Public APIs와 public-safe projection에는 다음을 추가하지 않는다.

```text
problem_candidate_id
linked_by_curator_user_id
private user_id
raw_input_id
```

Public user는 계속 다음만 본다.

```text
Published Public Problem
Published Public-safe Evidence Snapshot
```

---

## 7. Curator API contract

Lineage link:

```http
POST /api/radar/admin/problems/{publicProblemId}/source-problems

{
  "problem_candidate_id": "..."
}
```

Lineage unlink:

```http
DELETE /api/radar/admin/problems/{publicProblemId}/source-problems/{problemCandidateId}
```

두 API 모두 curator authentication을 요구한다.

Admin Public Problem detail은 내부 운영을 위해 `source_problems`를 반환한다.

Public Problem detail API는 lineage를 반환하지 않는다.

---

## 8. Final invariant

```text
Private Problem Card와 Public Problem은 독립 identity다.

Public Problem은 confirmed Private Problem Card와
선택적인 N:M lineage를 가질 수 있다.

Lineage는 내부 derivation context이며 public data가 아니다.

Publish는 최소 2개 Evidence와 2개 distinct source를 요구한다.

Published 상태의 metadata, Evidence, lineage는 immutable하다.
변경하려면 먼저 archive하고 다시 publication gate를 통과한다.
```

## 9. 완료 기준

- [x] N:M lineage schema 정의
- [x] confirmed Problem Card만 link 가능
- [x] curator-only link/unlink RPC 정의
- [x] lineage public read 차단
- [x] publication quality gate helper 고정
- [x] published metadata 직접 수정 차단
- [x] 기존 published Evidence 직접 수정 차단 유지
- [x] published lineage 직접 수정 차단
- [x] curator admin API에 lineage mutation surface 추가
- [x] contract test로 위 경계 고정
