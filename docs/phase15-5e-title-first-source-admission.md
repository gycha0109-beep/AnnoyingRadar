# Phase 15.5E — Title-first Source Admission

## Purpose

Phase 15.5E removes external LLM classification from the active Source admission path.

The active question is not whether a NAVER Search snippet contains a pain phrase. It is whether the source itself is complaint-central enough to deserve admission into the complaint review flow.

## Retrieval invariant

`retrieval relevance != source complaint centrality`

NAVER Search descriptions are retrieval artifacts selected around query-relevant terms. A complaint word in a snippet must never promote an otherwise unclear NAVER Blog result into a complaint candidate.

## Admission order

1. Use provider title as the source-level primary signal.
2. Hard reject clear information/guide/SEO framing.
3. Hard reject clear positive-review framing unless the title also contains an explicit complaint event.
4. Admit only titles with explicit complaint/failure framing as `candidate`.
5. For a neutral title, allow snippet only to demote obvious retrieval noise (informational/positive/incidental complaint fragments).
6. Never allow snippet to promote a neutral title to `candidate`.
7. Keep unresolved, mixed, or incomplete titles as `review` for selective canonical-page inspection.

Decisions:

- `candidate`: title itself carries explicit complaint/failure framing.
- `review`: title is incomplete, mixed, or cannot establish complaint centrality after safe snippet demotion.
- `reject`: title establishes informational/guide or positive-review intent, or snippet proves the complaint phrase is merely incidental retrieval noise.

## Examples locked by tests

- `카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요` → reject.
- `so what? we hot we young` with a parenthetical incidental `환불안됨` phrase and unrelated daily-post text → reject as retrieval noise.
- `하수구청소 ... 처리 과정이 깔끔했어요` → reject.
- `용산 피프틴커피 배달 후기 ... 부담 없는 최소주문금액!` → reject.
- `가래 감기 걸렸을 때 어떻게 해야 할까 싶을 때` → reject.
- `여기어때 오키나와 숙소 태풍 결항 환불 후기` → review; full context may contain a real complaint narrative.
- `아고다 ... 환불 불가 썰` → candidate.
- a neutral title with a strong complaint snippet → review, never auto-promoted.

## Runtime authority

The active Source Lab path is deterministic and no-LLM. Admission is a derived, versioned code decision over stored Source Signal data; it is not human truth and it is not a published Problem decision.

Phase 15.5D AI Silver remains historical/experimental. The live Silver runner is hard-disabled unless `ALLOW_PAID_SILVER_LLM=true` is explicitly configured. No Source ingestion path sets this flag or invokes Silver automatically.

## Blind evaluation

The existing 120-sample blind human evaluation remains untouched and is permanently excluded from the Phase 15.5E development admission stats/queue. The active admission view is calculated only over the campaign development pool (`campaign pool - blind sample`).

Phase 15.5E does not read admission or classifier output into the blind labeling flow and does not modify the existing DB blind guards.

## Production deployment

Vercel production deployment remains disabled.
