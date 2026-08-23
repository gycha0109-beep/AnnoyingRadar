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
5. Keep incomplete or non-complaint-central titles as `review` for selective canonical-page inspection.
6. Snippet text may only demote obvious retrieval noise; it can never promote a result to `candidate`.

Decisions:

- `candidate`: title itself carries explicit complaint/failure framing.
- `review`: title is incomplete, mixed, or cannot establish complaint centrality.
- `reject`: title establishes informational/guide or positive-review intent, or a neutral-title result is clearly incidental/informational retrieval noise.

## Examples locked by tests

- `카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요` → reject.
- `so what? we hot we young` with one incidental parenthetical `환불안됨` phrase in the snippet → reject as incidental retrieval noise; never candidate.
- `하수구청소 ... 처리 과정이 깔끔했어요` → reject.
- `용산 피프틴커피 배달 후기 ... 부담 없는 최소주문금액!` → reject.
- `가래 감기 걸렸을 때 어떻게 해야 할까 싶을 때` → reject.
- `여기어때 오키나와 숙소 태풍 결항 환불 후기` → review; full context may contain a real complaint narrative.
- `아고다 ... 고객센터 환불 불가 썰` → candidate; `고객센터` alone is not informational authority.
- A neutral title with a strong complaint snippet remains `review`; snippet cannot promote it.

## Runtime authority

The active Source Lab path is deterministic and no-LLM.

Phase 15.5D AI Silver remains historical/experimental. The live Silver runner is hard-disabled unless `ALLOW_PAID_SILVER_LLM=true` is explicitly configured. No Source ingestion path sets this flag or invokes Silver automatically.

## Blind evaluation

The existing 120-sample blind human evaluation remains untouched. Active admission stats and queue operate only on the campaign development pool after excluding those 120 blind samples. Phase 15.5E does not read classifier outputs into the blind labeling flow and does not modify the existing DB blind guards.

## Production deployment

Vercel production deployment remains disabled.
