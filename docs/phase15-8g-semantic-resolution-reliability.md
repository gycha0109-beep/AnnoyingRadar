# Phase 15.8G — Semantic Resolution Reliability

## Status

**CLOSED — bounded recovery lane implemented, CI/PIE verified, live pilot verified; active resolver unchanged**

## Purpose

Phase 15.8F completed a disjoint 48-item exact-new Review holdout. Full public source context fetch succeeded for all 48 items, but eight semantic resolutions remained unresolved:

```text
source_full_context_provider_incomplete:      5
source_full_context_invalid_evidence_quote:   3
```

Phase 15.8G tested a bounded recovery lane for exactly these two empirically observed technical failures without changing Source Admission, Formation, incident identity, publication authority, or active discovery allocation.

## Repository implementation authority

Implementation PR:

```text
PR #82
merge: acffe6670cd4fa29c0cb4f530f5b6d6d2be40dea
CI #349: SUCCESS
PIE #49: SUCCESS
```

Recovery version:

```text
source-full-context-recovery-v0.1
```

Base semantic resolution authority remains:

```text
source-full-context-resolution-v0.1
```

The base resolver was not modified. The recovery lane remains separate and evaluation-only.

## Exact recovery policy

Only these two codes are eligible:

```text
source_full_context_provider_incomplete
source_full_context_invalid_evidence_quote
```

Maximum semantic attempts:

```text
attempt 1: existing semantic judge
attempt 2: one bounded recovery attempt
maximum:   2 total attempts
```

No generic retry expansion was introduced for network errors, timeouts, provider rejection, missing configuration, semantic uncertainty, or full-context fetch failure.

The public full context is fetched once. Recovery retries only the semantic request against the same ephemeral context.

## Provider-incomplete recovery

The recovery attempt preserves:

- the same model selection;
- `store: false`;
- the same strict structured schema;
- the same semantic fields;
- the same `resolveFullContextSemantic(...)` final mapping.

It changes only the technical completion budget and concision instruction:

```text
base max_output_tokens:      800
recovery max_output_tokens: 1600
```

This is a reliability adjustment, not a semantic-policy adjustment.

## Invalid evidence quote recovery

The existing exact provenance validator requires `evidence_quote` to be an exact contiguous substring of the fetched post.

The recovery lane does not locally rewrite, fuzzy-match, trim into a match, or otherwise manufacture a quote. The retry instead reinforces:

```text
evidence_quote must be copied character-for-character
as one contiguous substring from <source_full_post>,
or be null.
```

The same exact validator then runs again.

## Frozen pilot authority

Baseline Phase 15.8F run:

```text
run: 32807308702
holdout size: 48
holdout fingerprint: 30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7
baseline unresolved: 8
```

Identity-free unresolved ordinals:

```text
7, 10, 12, 13, 17, 24, 28, 44
```

The pilot reconstructs the frozen authority window:

```text
completed_at <= 2026-08-25T02:29:36.982Z
exact runs: 24
exact-new Sources: 961
exact-new Reviews: 166
```

Then:

```text
166 Review queue
→ historical deterministic 24 exclusion
→ same deterministic 48 holdout
→ verify exact holdout fingerprint
→ select eight baseline unresolved ordinals
```

No Source Signal identity list is committed as calibration authority.

## Live recovery pilot

Live run:

```text
workflow: Source Semantic Recovery Pilot
run: 32808824853
artifact: 9549105015
authoritative main: acffe6670cd4fa29c0cb4f530f5b6d6d2be40dea
```

Result:

```text
baseline unresolved: 8
resolved now:         6
unresolved now:       2
unresolved reduction: 6
resolution rate:      75%
```

Final decisions for the eight targets:

```text
Candidate: 0
Reject:    6
Review:    2
```

## Retry attribution

The pilot separates fresh first-attempt variation from actual retry recovery.

```text
fresh first-attempt resolution: 2
recovery attempted:             6
recovered after retry:          4
recovery exhausted:             2
```

Therefore it would be incorrect to attribute all six newly resolved records to the retry mechanism.

Four records were directly recovered by the second bounded attempt.

## Recovery trigger readback

During this fresh eight-target run:

```text
no retry needed:                             2
source_full_context_provider_incomplete:     4
source_full_context_invalid_evidence_quote:  2
```

Terminal recovery failures:

```text
source_full_context_invalid_evidence_quote: 2
```

No provider-incomplete error remained after the bounded recovery attempts in this run.

This is evidence that the completion recovery mechanism is useful under the observed pilot conditions.

It is **not** evidence that every future provider-incomplete error will always recover.

## Quote recovery conclusion

The two recovery attempts triggered by invalid evidence quotes both remained unresolved with the same terminal reason.

Therefore Phase 15.8G does **not** establish quote-recovery effectiveness.

The remaining reliability problem is now narrowed to:

```text
invalid evidence_quote handling / quote authority
```

This must be handled in a separate phase rather than weakening the exact quote validator inside this closeout.

## Decision-reason readback

Resolved records were rejected under existing semantic authority:

```text
full_context_informational_content: 3
full_context_nonorganic_or_borrowed: 1
full_context_not_first_hand: 2
```

No Candidate was manufactured by recovery.

## Mutation boundary

The live runner verified before/after equality:

```text
source_signals:        2260 → 2260
source_observations:   2461 → 2461
source_ingestion_runs:  108 → 108
raw_inputs:              10 → 10
pain_evidences:          27 → 27
public_problems:          2 → 2
public_evidence:          5 → 5
source_incidents:         4 → 4
```

Independent live DB readback after the pilot:

```text
Published Problems:     2
Public Problem feed:    2
Public Evidence:        5
Public Evidence feed:   5
Source Incidents:       4
Blind samples:        120
```

Verified boundary:

```text
DB writes: 0
Blind reads by pilot: 0
full source bodies persisted: 0
publication mutations: 0
active allocation mutations: 0
active resolver mutations: 0
```

## Output policy

The pilot emitted aggregate diagnostics only. It did not emit Source Signal ids, canonical URLs, author handles, full source bodies, individual semantic payloads, or provider request ids.

## Closeout trigger surface

The temporary branch trigger used to execute the one-shot live pilot is removed during closeout.

Retained workflow authority:

```text
workflow_dispatch only
```

There is no automatic push or pull-request paid execution path after closeout.

## Phase conclusion

Phase 15.8G is closed with a split conclusion:

```text
provider-incomplete recovery: EMPIRICALLY USEFUL IN PILOT
invalid-quote recovery:       NOT ESTABLISHED
active resolver integration:  NOT ACTIVATED
```

The correct next step is to isolate the quote failure rather than activate the whole recovery lane indiscriminately.

A later activation phase may consider the provider-incomplete recovery path only after the quote authority is resolved or explicitly separated.
