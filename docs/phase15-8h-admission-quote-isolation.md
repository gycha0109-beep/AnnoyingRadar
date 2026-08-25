# Phase 15.8H — Admission Quote Isolation

## Status

**IMPLEMENTED — pending CI/PIE and bounded live two-target pilot**

## Purpose

Phase 15.8G reduced the eight unresolved Phase 15.8F semantic cases to two.

Both terminal failures were:

```text
source_full_context_invalid_evidence_quote
```

The previous retry still asked the semantic provider to return an exact quote. Both quote retries failed the same literal-substring validator.

Phase 15.8H tests a narrower architectural response: do not repair or fuzzy-match an invalid Admission quote. Instead, on one quote-specific retry only, force the Admission semantic response to return `evidence_quote = null` while preserving all classification semantics.

## Why this is allowed at Admission

The existing Admission semantic schema already defines:

```text
evidence_quote: string | null
```

The existing prompt already says the field may be null.

More importantly, the final Admission mapper `resolveFullContextSemantic(...)` does not use `evidence_quote` to decide Candidate / Reject / Review. It uses only:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
```

Therefore the quote is not Admission decision authority.

Phase 15.8H does not remove the quote field from the schema and does not silently discard a bad quote after parsing. It asks the structured provider to emit a schema-valid null on the one isolation retry.

## Formation provenance remains separate

Problem Formation has a separate semantic authority and separate evidence-provenance requirements.

Formation independently requires an exact evidence quote from the source context before formation eligibility. Its semantic vocabulary also differs from Admission, including fields such as:

```text
friction_responsibility
source_origin
```

The Admission full-context resolution runners do not invoke Formation and do not hand the Admission quote forward as Formation provenance authority.

Therefore an Admission result recovered with `evidence_quote = null` carries:

```text
formation_quote_authority = not_granted
```

If that Source later reaches Formation, Formation must independently establish and validate its own exact quote under the existing Formation gate.

Phase 15.8H does **not** waive or weaken that requirement.

## Version and lane separation

Quote-isolation version:

```text
source-full-context-quote-isolation-v0.1
```

Base semantic resolver remains:

```text
source-full-context-resolution-v0.1
```

The new evaluator is a separate lane:

```text
resolveSourceAdmissionWithFullContextQuoteIsolation(...)
```

The active/base resolver is not modified.

## Exact retry rule

Only this error may trigger quote isolation:

```text
source_full_context_invalid_evidence_quote
```

Maximum semantic attempts:

```text
attempt 1: existing semantic judge
attempt 2: quote-isolation retry
maximum:   2
```

Provider incomplete, timeout, network, rejected request, missing configuration, semantic uncertainty, and source-fetch failure do not gain a retry from Phase 15.8H.

## Quote-isolation request transform

The second request preserves:

- model;
- `store: false`;
- strict JSON-schema mode;
- required field list;
- all six Admission classification property schemas;
- base output-token budget;
- the existing base parser and final decision mapper.

Only the `evidence_quote` property schema is narrowed from:

```text
string | null
```

to:

```text
type: null
```

The retry instruction explicitly requires:

```text
evidence_quote = null
```

and forbids inventing, paraphrasing, whitespace-normalizing, fuzzy matching, or repairing any quote.

## Why no fuzzy matching

A fuzzy-repaired quote would create a dangerous provenance ambiguity: the system could no longer say that the provider returned an exact excerpt from the public source.

Phase 15.8H instead chooses a cleaner separation:

```text
Admission classification can resolve without quote authority
Formation evidence cannot
```

This preserves `Problem → Evidence → Source` provenance rather than weakening it.

## Live pilot target

Phase 15.8G live run:

```text
run: 32808824853
baseline unresolved after recovery: 2
```

The two remaining cases correspond to identity-free 1-based holdout ordinals:

```text
10, 17
```

The 15.8H runner reconstructs the same frozen authority:

```text
completed_at <= 2026-08-25T02:29:36.982Z
exact runs: 24
exact-new Sources: 961
exact-new Reviews: 166
holdout size: 48
holdout fingerprint: 30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7
```

It then selects only ordinals 10 and 17.

The run fails closed if the historical reconstruction or fingerprint drifts.

## Paid-call boundary

For the two-target pilot:

```text
public full-context fetches max: 2
semantic provider calls max:     4
```

The source context is fetched once per target. The second call, if needed, reuses the same ephemeral fetched context.

## Output policy

The live artifact is aggregate-only. It does not emit:

- Source Signal ids;
- canonical URLs;
- author handles;
- full source bodies;
- individual semantic payloads;
- provider request ids.

It reports:

```text
fresh first-attempt resolutions
quote-isolation attempts
quote-isolation recoveries
quote-isolation exhaustion
resolved / unresolved
Candidate / Reject / Review totals
resolved-with-null-Admission-quote count
Formation quote authority granted count
decision reason counts
DB boundary snapshots
```

Expected invariant:

```text
formation_quote_authority_granted = 0
```

## Mutation boundary

Expected:

```text
DB writes: 0
Blind reads: 0
full source bodies persisted: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
Formation authority mutations: 0
```

## Workflow

Temporary pilot workflow:

```text
.github/workflows/source-quote-isolation-pilot.yml
```

Because the connector cannot dispatch `workflow_dispatch` directly, implementation temporarily permits one exact push branch:

```text
ops/source-quote-isolation-pilot
```

The workflow checks out authoritative `main` before consuming secrets and has `contents: read` permission only.

The temporary push trigger must be removed during closeout.

## Activation boundary

Even if both targets resolve, Phase 15.8H does not activate quote isolation in the base resolver.

The phase may close after:

1. CI and PIE verification;
2. exact two-target live pilot;
3. aggregate readback;
4. DB / Blind / publication boundary verification;
5. temporary trigger removal.

Any active integration remains a separate explicit phase.
