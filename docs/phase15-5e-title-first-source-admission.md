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

## v0.3 revalidation failure

v0.3 fixed REVIEW flooding but still failed candidate precision:

- candidate / review / reject = 10 / 8 / 651
- full-context burden = 1.20%
- candidate false positives = 9/10 (90%)
- sampled REJECT: 48/50 correct, one possible false negative, one clear false negative
- sampled REVIEW: 5/8 genuinely needed context, 1/8 should reject, 2/8 should candidate

Direct inspection of all 10 v0.3 candidates showed that nine were legal/how-to/SEO/comparison/marketing content. The one clear complaint-central candidate was `로마 숙소 아고다 고객센터 환불 불가 썰`.

## v0.4 revalidation failure

v0.4 improved candidate precision and kept REVIEW burden low, but still failed the same development-pool gate:

- candidate / review / reject = 3 / 12 / 654
- full-context burden = 1.79%
- candidate audit = 2 true / 1 false positive
- sampled REJECT = 49/50 correct, 1 possible false negative, 0 clear false negatives
- REVIEW audit = 6/12 need context, 5/12 should reject, 1/12 should candidate
- regression = 5/6 because #10 was routed to REVIEW

Hosted-data inspection identified the remaining false CANDIDATE as:

`네이버쇼핑 판매자 신고 방법 (환불 거부당했을 때 순서대로 대응하....`

The failure had two distinct causes:

1. `거부당했을 때` matched broad `당했` narrative grammar even though it was conditional guide language.
2. the real #10 snippet contained a later first-person phrase after the parenthetical complaint fragment, so first-hand preservation ran before incidental-parenthetical demotion and incorrectly produced REVIEW.

## v0.5 admission order

`source-admission-v0.5` keeps the title-first contract but tightens source-intent authority:

1. Provider title remains the primary source-intent signal.
2. Information/legal/how-to/SEO/comparison/marketing framing outranks complaint vocabulary.
3. `신고 방법`, `순서대로 대응`, scam-warning/countermeasure phrasing, and resale/transfer titles are treated as non-complaint source framing.
4. Conditional grammar such as `거부당했을 때` is not personal narrative evidence.
5. CANDIDATE still requires an explicit failure event plus title-level personal/narrative complaint framing.
6. Incidental parenthetical snippet demotion runs before any other snippet-based preservation.
7. A retrieval snippet may demote a source but cannot establish source complaint centrality by itself.
8. Opaque/neutral titles no longer reach REVIEW merely because their NAVER description contains a strong first-hand complaint fragment.
9. Complaint-topic titles may still reach REVIEW when title framing or multiple strong snippet markers justify selective full-context inspection.
10. Truncation alone remains insufficient for REVIEW.

Decisions:

- `candidate`: explicit complaint/failure event plus title-level personal/narrative complaint framing.
- `review`: title itself carries complaint relevance but source centrality remains genuinely ambiguous.
- `reject`: information/legal/how-to/SEO/commercial/resale/positive framing, incidental retrieval noise, neutral title plus snippet-only complaint, generic topic-only framing, or no meaningful complaint source signal.

## Examples locked by tests

- `카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요` → reject.
- `so what? we hot we young` with `(피규어충동구매햇는데환불안됨)` plus unrelated later first-person text → reject.
- truncated `하수구청소 맡길 일이 생겨서 간 ... 처리 ....` → reject.
- `용산 피프틴커피 배달 후기 ... 부담 없는 최소주문금액!` → reject.
- `가래 감기 걸렸을 때 어떻게 해야 할까 싶을 때` → reject.
- `네이버쇼핑 판매자 신고 방법 (환불 거부당했을 때 순서대로 대응하....` → reject.
- `이비스턴 사기 쇼핑몰 사칭 구매대행 피해 주의해야 할 수법과 대응....` → reject.
- `임영웅 고양 콘서트 티켓 원가양도합니다` with an incidental refund complaint in snippet → reject.
- opaque `벼락치기` with a strong gym complaint snippet → reject because snippet cannot establish source centrality.
- `여기어때 오키나와 숙소 태풍 결항 환불 후기` → review.
- `아고다 취소불가 숙소 취소 가능할까? ... 실제 후기` → review.
- `로마 숙소 아고다 고객센터 환불 불가 썰` → candidate.
- `카카오 T 펫택시 비추천 | 기사 일방적 취소 | 고객센터` → candidate.

## Pre-merge v0.5 hosted dry-run

Before merging v0.5, the same hosted campaign development pool was re-evaluated with the v0.5 rule ordering using read-only SQL that mirrored the deterministic contract:

- development pool = 669
- candidate = 2
- review = 8 before the final neutral-title / resale / scam-warning tightening
- reject = 659 before that final tightening

The eight REVIEW titles were then inspected directly. Three clearly non-complaint source types remained:

- opaque daily-post title with a complaint-heavy snippet
- ticket resale listing with incidental refund friction
- scam-warning/countermeasure information article

v0.5 was tightened again before merge so those patterns reject at title/source-intent level. The authoritative acceptance result remains the post-merge 669-signal revalidation, not this pre-merge estimate.

## Runtime authority

The active Source Lab path is deterministic and no-LLM.

Phase 15.5D AI Silver remains historical/experimental. The live Silver runner is hard-disabled unless `ALLOW_PAID_SILVER_LLM=true` is explicitly configured. No Source ingestion path sets this flag or invokes Silver automatically.

## Blind evaluation

The existing 120-sample blind human evaluation remains untouched. Active admission stats and queue operate only on the campaign development pool after excluding those 120 blind samples. Phase 15.5E does not read classifier outputs into the blind labeling flow and does not modify the existing DB blind guards.

## Verification rule

v0.5 is not considered successful merely because contract tests or the pre-merge SQL mirror pass. The same 669-signal development-pool revalidation must be repeated after merge. Candidate precision, REVIEW quality, REVIEW burden, sampled REJECT false negatives, and all six regression cases remain the acceptance evidence.

## Production deployment

Vercel production deployment remains disabled.
