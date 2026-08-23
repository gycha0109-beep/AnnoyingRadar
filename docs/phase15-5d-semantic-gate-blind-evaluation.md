# Phase 15.5D — Semantic Gate and Blind Human Evaluation

## Why this phase exists

Phase 15.5C proved real NAVER acquisition and produced a campaign pool large enough for evaluation. The original Gold v0.1 form coupled `complaint_relevant=yes` to `first_hand=yes + concrete_friction=yes`, which mixed two different questions:

1. Does the visible text contain a problem claim?
2. Does the claim satisfy Annoying Radar's precision-first qualifying gate?

Phase 15.5D separates observation from policy.

## Semantic facts

The model may only observe:

- `problem_claim`: yes / no / uncertain
- `experience_actor`: self / other / generic / unknown / not_applicable
- `friction_specificity`: concrete / vague / none / unknown
- `content_kind`: organic / advertisement / news / repost / informational / unknown
- `evidence_quote`: exact contiguous excerpt from the stored Source Signal

The model does not return PASS/REVIEW/REJECT and does not return confidence.

## Deterministic gate

PASS requires all of:

- problem claim = yes
- experience actor = self
- friction specificity = concrete
- content kind = organic
- exact evidence quote exists

Clear disqualifiers produce REJECT. Unknown/uncertain states produce REVIEW.

The deterministic prefilter remains conservative. If its review signal conflicts with a semantic PASS, the result remains REVIEW rather than letting the model override a precision-first rule.

## Selective second judge

A secondary independent judge is invoked only when:

- the primary semantic result contains unknown/uncertain facts,
- the deterministic prefilter raised a review signal, or
- the primary semantic gate would itself be REVIEW.

The secondary judge does not receive the primary output. Any disagreement in the four semantic axes forces REVIEW.

## Authority model

### AI Silver

`ar_source_signal_semantic_judgments` stores individual AI semantic observations.

`ar_source_signal_silver_annotations` stores the deterministic resolution and is explicitly `annotation_authority = ai_silver`.

Silver is development evidence. It is not Human Gold and must not be presented as authoritative final evaluation truth.

### Blind human evaluation

`ar_source_signal_human_evaluations` is explicitly `annotation_authority = human_blind`.

The active human evaluation is `human-eval-v0.1` with 120 samples:

- representative: 60 deterministic samples from the campaign pool
- challenge: 60 samples based only on acquisition provenance
  - complaint-heavy: 15
  - domain-friction: 20
  - domain-neutral: 10
  - noise: 15

Sampling does not depend on classifier or Silver outputs.

## Blindness guarantee

The evaluation samples are fixed before Silver labeling.

While the evaluation set status is `labeling`, database triggers reject inserts into both AI semantic judgment and AI Silver tables for those 120 Source Signals. This prevents accidental leakage even if an application path or batch runner is misused.

The dedicated `/curator/sources/evaluation` page does not query or render classifier/Silver output.

After all 120 human labels exist, the set can be locked. Locked human labels are immutable. Later evaluation work may run the classifier against the now-locked set without changing human truth.

## Human labeling UX

The active page shows one card at a time.

Quick presets:

- N: no problem claim
- Y: first-hand concrete organic friction
- U: uncertain
- Ctrl/Cmd+Enter: save

For `problem_claim=yes`, an exact `evidence_quote` is required. The operator can select text in the displayed Source Signal and copy the browser selection into the evidence field.

## Silver execution

Do not run Silver before the 120 blind samples are initialized.

Estimate only, no external model calls:

```bash
npm run classify:silver:estimate
```

Live Silver run:

```bash
npm run classify:silver:live
```

The live runner excludes all 120 evaluation samples and is resumable by the immutable Silver version.

## Preserved boundaries

Phase 15.5D does not create automatic links or promotions into:

- `ar_raw_inputs`
- `ar_pain_evidences`
- `ar_public_problems`

Legacy Phase 15.5/15.5C Gold tables remain for history but are no longer the active benchmark authority. No production Vercel deployment is enabled in this phase.
