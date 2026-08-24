# Phase 15.5F — Selective Full-Context Resolution

## Status

**CLOSED — 2026-08-24**

Phase 15.5E remains the authoritative cheap Source Admission layer:

```text
source-admission-v0.8
+ pain-ownership-v0.1
+ causality-v0.1
+ recovery-v0.1
```

Development pool after 15.5E remains:

```text
eligible 669
candidate 13
review 5
reject 651
full-context required 5 (0.75%)
```

Phase 15.5F resolved those five REVIEWs without widening the Phase 15.5E Source Admission regexes.

Final Phase 15.5F development-queue result:

```text
full-context fetch 5 / 5
candidate 4
reject 1
review 0
unresolved 0
```

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

## Five-item development queue

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

The full-context model contract is not asked for an admission label. It returns semantic facts only:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
evidence_quote
```

The provider prompt is explicitly instructed not to output CANDIDATE / REVIEW / REJECT.

Provider configuration errors, timeouts, transport errors, malformed output, and unsupported uncertainty preserve REVIEW rather than manufacturing a label.

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

## Empirical closeout

On 2026-08-24, all five current REVIEW items were fetched from their public Naver full-post context on an ephemeral GitHub Actions execution branch. The full source bodies were not committed and were not written to the production database.

Semantic facts were reviewed against those fetched full contexts using the Phase 15.5F schema. A second live Actions pass then re-fetched every post, verified each `evidence_quote` as an exact substring of the fetched full context, and executed the repository's actual `resolveFullContextSemantic()` deterministic mapper.

| Signal | Final decision | Deterministic reason | Exact evidence excerpt |
| --- | --- | --- | --- |
| `cd5938ce-0795-4579-a1e0-3ccd84353abf` — Toronto airline delay | CANDIDATE | `full_context_first_hand_external_friction` | `끝없는 지연의 굴레에 갇혔습니다.` |
| `eaa87b64-4632-4933-bce4-6deca0a9c10b` — Bangkok delivery cancellations | REJECT | `full_context_incidental_friction` | `주문이 계속 취소되는 거임` |
| `defa940f-b51c-4e8c-a134-f9522ee810be` — Okinawa cancellation/refund | CANDIDATE | `full_context_first_hand_external_friction` | `숙소 답변이 오지 않아` |
| `f96d57a4-6986-4294-9185-98474fe1a788` — Z Fold repair cost | CANDIDATE | `full_context_first_hand_external_friction` | `수리금액은 87만원입니다` |
| `b12f82f8-04fb-458e-a8e6-db5728121ae2` — Gym refund delay | CANDIDATE | `full_context_first_hand_external_friction` | `6월 내내 환불을 회피했다.` |

The resulting queue is therefore:

```text
candidate 4
reject 1
review 0
unresolved 0
```

### Provider-verification boundary

The repository did not expose an `OPENAI_API_KEY` Actions secret during this closeout. Therefore the OpenAI Responses API provider call itself was **not** live-executed as part of the five-item empirical closeout.

This distinction is intentional and must remain explicit:

```text
provider request/schema/fail-safe path = contract-tested
public full-context acquisition = live-verified 5/5
semantic facts = reviewed against fetched full context
exact evidence grounding = live-verified 5/5
deterministic final mapper = live-executed 5/5
OpenAI provider API call = not live-verified in closeout
```

No claim should be made that the provider API was exercised when it was not. The missing repository secret did not require weakening the Phase 15.5F decision boundary or manufacturing any result.

## Cost boundary

Paid semantic judgment is opt-in and only occurs for the five-item (or future equivalent) full-context queue.

Estimate without paid calls:

```bash
node --env-file=.env.local scripts/run-source-full-context-resolution.mjs --estimate-only
```

Live provider resolution when an explicit API key is available:

```bash
ALLOW_PAID_SOURCE_FULL_CONTEXT=true \
node --env-file=.env.local scripts/run-source-full-context-resolution.mjs
```

The script performs no DB writes. It prints a resolution report to stdout.

## Blind boundary

The live runner loads the campaign pool and subtracts `getEvaluationSampleIds()` before it reads signal rows. The blind 120 set therefore remains unread by this phase.

The empirical closeout execution used only the already-audited five-item REVIEW fixture and did not query the blind evaluation set.

## Closure criteria

Phase 15.5F closure is satisfied as follows:

1. **PASS** — Phase 15.5E remains `13 / 5 / 651` on the same development 669 and its admission implementation was not modified by 15.5F.
2. **PASS** — the five REVIEW signals are the only Phase 15.5F queue members.
3. **PASS** — Candidate/Reject signals bypass the full-context lane; regression coverage verifies zero fetch/model work for non-REVIEW admissions.
4. **PASS** — public full-context fetch succeeded for all five queue items.
5. **PASS** — all five semantic evidence excerpts were verified against freshly fetched full context.
6. **PASS** — all five resolved to CANDIDATE/REJECT: `4 / 1 / 0 REVIEW`.
7. **PASS** — blind 120 read count remained zero.
8. **PASS** — DB migration/write count remained zero.
9. **PASS** — implementation PR CI and disposable empirical execution PR CI were green, including lint/test/release/build/runtime gates.

Phase 15.5F is **CLOSED**. Any future provider-live verification is an execution-environment verification task, not a reason to reopen the resolved five-item admission queue unless it exposes a semantic or deterministic-contract defect.
