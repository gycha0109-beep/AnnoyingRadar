# Phase 15.5E v0.7 — Systemic Access Harm Calibration

## Trigger

The post-merge v0.6 revalidation on the 669-signal development pool was PARTIAL:

- CANDIDATE / REVIEW / REJECT = 2 / 7 / 660
- candidate precision = 2/2
- REVIEW quality = 6/7 needs context, 1/7 should candidate
- sampled REJECT = 49/50 correct, 1 clear false negative
- regression = 6/6

The remaining boundaries were:

1. `"재활 치료 6개월 기다리래요" 어린이 24만명, 하염없이 대기` — complaint-central from title alone and should be CANDIDATE.
2. `택시 호출 앱 때문에 한국 노인들이 택시를 못 타는 현실` — systemic service-access harm that should not be hard REJECT; preserve as REVIEW for source-context inspection.

## v0.7 contract

- Keep all v0.6 precision-first title/SEO/commercial/snippet protections.
- Promote explicit prolonged service-wait harm (`N개월 기다리래요`, `하염없이 대기`, `기약 없이 대기`) to CANDIDATE when the title itself carries the harm.
- Recover narrowly framed systemic access exclusion (`because of X`, vulnerable group, cannot access/use/take service, reality/problem/barrier framing) to REVIEW only.
- Keep concrete repair-cost shock + forced replacement as REVIEW.
- Do not let snippets create either new CANDIDATE or systemic-access REVIEW paths.

## Expected development-pool movement

Relative to v0.6, exactly two known records should change:

- rehabilitation long-wait: REVIEW → CANDIDATE
- elderly taxi app access harm: REJECT → REVIEW

Expected aggregate before authoritative revalidation:

- CANDIDATE = 3
- REVIEW = 7
- REJECT = 659
- full-context burden = 7 / 669 ≈ 1.05%

The same 669-signal revalidation remains the acceptance authority. No PASS may be declared from contract tests alone.

## Boundaries

- No OpenAI/Responses/external LLM calls.
- No DB writes or migrations.
- Blind 120 untouched.
- Production deployment remains disabled.
