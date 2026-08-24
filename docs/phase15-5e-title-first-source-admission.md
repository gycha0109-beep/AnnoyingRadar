# Phase 15.5E — Title-first Source Admission

## Purpose

Phase 15.5E removes external LLM classification from the active Source admission path.

The active question is not whether a NAVER Search snippet contains a pain phrase. It is whether the source itself is complaint-central enough to deserve admission into the complaint review flow.

## Retrieval invariant

`retrieval relevance != source complaint centrality`

NAVER Search descriptions are retrieval artifacts selected around query-relevant terms. A complaint word in a snippet must never promote an otherwise unclear NAVER Blog result into a complaint candidate.

## v0.2 revalidation failure

The first title-first implementation was not selective enough on the 669-signal development pool:

- candidate / review / reject = 22 / 437 / 210
- full-context burden = 65.32%
- candidate false positives = 20/22 (90.91%)
- sampled REVIEW: 57/60 should have been rejected
- regression #12 was incorrectly routed to REVIEW because title truncation outranked commercial framing

`source-admission-v0.3` is the calibration response to that failure.

## v0.3 admission order

1. Use provider title as the source-level primary signal.
2. Hard reject clear information/guide framing.
3. Hard reject commercial/SEO and positive-review framing unless it is mixed with an explicit complaint event; mixed cases go to REVIEW.
4. Admit only explicit failure/complaint-event grammar as `candidate`.
5. Generic topic nouns such as `사기`, `피해`, `분실`, `도용`, `정지` never create a candidate by themselves.
6. Apply snippet only as negative evidence or as a reason to preserve an opaque title for REVIEW; snippet can never produce CANDIDATE.
7. Truncation alone is insufficient for REVIEW. A truncated title must still carry complaint/experience evidence.
8. Query-shaped topic-only titles reject by default unless experience framing or multiple independent complaint markers justify context review.

Decisions:

- `candidate`: title itself carries a narrow explicit complaint/failure event.
- `review`: mixed framing, complaint-oriented experience framing, or an opaque title with multiple strong complaint markers requires selective source-context inspection.
- `reject`: information/guide/SEO/positive framing, incidental retrieval noise, generic topic-only framing, or no meaningful complaint signal.

## Examples locked by tests

- `카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요` → reject.
- `so what? we hot we young` with one incidental parenthetical `환불안됨` phrase → reject.
- truncated `하수구청소 맡길 일이 생겨서 간 ... 처리 ....` → reject as commercial/SEO framing before truncation review.
- `용산 피프틴커피 배달 후기 ... 부담 없는 최소주문금액!` → reject.
- `가래 감기 걸렸을 때 어떻게 해야 할까 싶을 때` → reject.
- `여기어때 오키나와 숙소 태풍 결항 환불 후기` → review; full context may contain a real complaint narrative.
- `아고다 ... 고객센터 환불 불가 썰` → candidate.
- `중고거래 사기 피해` / `택배 분실 대응 사례` / `계정 도용 문제` → never candidate from generic nouns alone.
- neutral `배달 최소주문금액` with informational snippet → reject rather than consume REVIEW capacity.
- opaque `벼락치기` with multiple strong complaint markers in snippet → review, never candidate.

## Runtime authority

The active Source Lab path is deterministic and no-LLM.

Phase 15.5D AI Silver remains historical/experimental. The live Silver runner is hard-disabled unless `ALLOW_PAID_SILVER_LLM=true` is explicitly configured. No Source ingestion path sets this flag or invokes Silver automatically.

## Blind evaluation

The existing 120-sample blind human evaluation remains untouched. Active admission stats and queue operate only on the campaign development pool after excluding those 120 blind samples. Phase 15.5E does not read classifier outputs into the blind labeling flow and does not modify the existing DB blind guards.

## Verification rule

v0.3 is not considered successful merely because contract tests pass. The same 669-signal development-pool revalidation must be repeated after merge and candidate precision, REVIEW burden, and sampled false negatives must be checked again.

## Production deployment

Vercel production deployment remains disabled.
