# Phase 15.5F — Selective Full-Context Resolution

## Status

Implementation target after Phase 15.5E closure.

Phase 15.5E remains the authoritative cheap Source Admission layer:

```text
source-admission-v0.8
+ pain-ownership-v0.1
+ causality-v0.1
+ recovery-v0.1
```

Development pool after 15.5E:

```text
eligible 669
candidate 13
review 5
reject 651
full-context required 5 (0.75%)
```

This phase must not widen Source Admission regexes to eliminate those five REVIEWs.

## Purpose

Resolve only the signals that the snippet policy explicitly marks:

```text
decision = review
requires_full_context = true
```

The final flow is:

```text
Source Signal
  ↓
15.5E deterministic admission
  ├─ REJECT     → stop
  ├─ CANDIDATE  → next Problem stage
  └─ REVIEW + requires_full_context
        ↓
      public source full-context fetch
        ↓
      semantic observation on full post
        ↓
      deterministic resolution
        ├─ CANDIDATE
        ├─ REJECT
        └─ REVIEW unresolved only when fetch/judgment remains uncertain
```

## Hard boundaries

Phase 15.5F does **not**:

- re-run 651 REJECTs through an LLM;
- re-run 13 CANDIDATEs through an LLM;
- change Source Admission v0.8 regexes;
- replay browser audit clicks as runtime truth;
- interpret a fetch or model failure as REJECT;
- write a full copied source post to the production database;
- add a DB migration;
- read the blind 120 evaluation signals.

## Current five-item development queue

The queue fixture is stored at:

```text
tests/fixtures/phase15-5f-review-queue.json
```

It is a development/audit snapshot, not a production authority. Runtime selection is always recomputed from the current blind-safe development pool and current admission policy.

## Full-context acquisition

Current Phase 15.5F acquisition support is intentionally narrow:

```text
naver_blog canonical URL
→ m.blog.naver.com/PostView.naver?blogId=...&logNo=...
→ visible post body extraction
```

Supported Naver body containers:

```text
.se-main-container
#postViewArea
.se3_view
```

Fetch behavior is fail-closed with respect to admission:

```text
HTTP/network/parse/adapter failure
→ final decision remains REVIEW
```

No fetch failure path manufactures a REJECT.

## Semantic observation

The full-context model is not asked for an admission label. It returns semantic facts only:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
evidence_quote
```

The model is explicitly instructed not to output CANDIDATE / REVIEW / REJECT.

Provider configuration errors, timeouts, transport errors, malformed output, and unsupported uncertainty also preserve REVIEW rather than manufacturing a label.

### Deterministic final mapping

CANDIDATE requires all of:

```text
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
```

Explicit REJECT cases include:

```text
problem_claim = no
friction_cause = self_caused
content_kind ∈ {advertisement, informational, news, repost}
pain_centrality = incidental
friction_specificity = none
experience_actor ∈ {other, generic}
```

`informational` means a guide/how-to whose main purpose is instruction. This remains REJECT even when it contains some personal wording, preserving the Phase 15.5E rule that general refund/legal/information guides are not recovered as source candidates.

Uncertain or mixed semantics remain REVIEW rather than being force-fit.

## Cost boundary

Paid semantic judgment is opt-in and only occurs for the five-item (or future equivalent) full-context queue.

Estimate without paid calls:

```bash
node --env-file=.env.local scripts/run-source-full-context-resolution.mjs --estimate-only
```

Live resolution:

```bash
ALLOW_PAID_SOURCE_FULL_CONTEXT=true \
node --env-file=.env.local scripts/run-source-full-context-resolution.mjs
```

The script performs no DB writes. It prints a resolution report to stdout.

## Blind boundary

The live runner loads the campaign pool and subtracts `getEvaluationSampleIds()` before it reads signal rows. The blind 120 set therefore remains unread by this phase.

## Closure criteria

Phase 15.5F can be called CLOSED only when all are true:

1. Phase 15.5E regression remains `13 / 5 / 651` on the same development 669.
2. The five REVIEW signals are the only Phase 15.5F queue members.
3. Candidate/Reject signals trigger zero full-context fetches and zero semantic model calls.
4. Public full-context fetch is verified for the five queue items, or any unavailable item is explicitly reported as unresolved rather than rejected.
5. Semantic evidence quotes are exact excerpts of fetched full context.
6. All five are resolved to CANDIDATE/REJECT for closure; otherwise Phase 15.5F remains `CONTINUATION_REQUIRED`.
7. Blind 120 is not read.
8. DB migration/write count remains zero.
9. Existing lint/test/release/build/runtime gates remain green.
