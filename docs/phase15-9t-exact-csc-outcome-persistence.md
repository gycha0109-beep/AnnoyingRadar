# Phase 15.9T — Exact CSC Candidate Outcome Persistence

## Status

**IMPLEMENTATION IN REVIEW / LIVE PERSISTENCE NOT EXECUTED**

Phase 15.9S resolved one exact CSC / carrier-feature Source as a full-context `candidate` without database mutation. Phase 15.9T may append only that exact resolved outcome to the private durable full-context outcome layer.

This phase does not perform Formation assessment, Incident creation/linking, Public Problem creation, evidence publication, or feed publication.

---

## 1. Frozen upstream authority

Phase 15.9S live authority:

```text
workflow run: 33136461477
implementation main: 92635476f35b3350970787e4e5ee67b7c68f26cf
artifact id: 9672213199
artifact digest:
sha256:afe8baf0624f44b58101544e211aba5b5243e507a355f49b30ffdeb05a7c0be5
```

Exact sanitized Source authority:

```text
source_identity_sha256:
b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c

source_content_sha256:
db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4
```

Full-context authority:

```text
content_sha256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
original_char_count = 3035
content_scope = full_post
extraction_scope = naver_post_body
truncated = false
```

Semantic authority:

```text
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
reason = full_context_first_hand_external_friction
prompt_version = source-full-context-semantic-v0.1
provider = openai
model = gpt-5-mini-2025-08-07
```

Evidence integrity retained as provenance only:

```text
evidence_quote_sha256 = 159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
evidence_quote_char_count = 44
Phase 15.9S grounding = true
```

The raw evidence quote is not persisted by Phase 15.9T.

---

## 2. Persistence authority

Batch:

```text
phase15.9t-exact-csc-outcome-v0.1
```

The runner must re-resolve the Source using both immutable Source hashes. `latest` inference is forbidden.

Before any write it requires:

```text
exact Source hash pair resolves exactly one row
snippet Admission remains review + requires_full_context
origin remains naver_blog
Blind evaluation rows = 0
existing durable outcomes for this Source = 0
existing Incident links for this Source = 0
existing Public Evidence rows for this Source = 0
15.9T batch rows = 0
protected carrier_csc_feature_restriction_case Incident count = 1
```

The production outcome table currently guarantees uniqueness only for `(batch_version, source_signal_id)`. Therefore Phase 15.9T explicitly checks that **no durable outcome of any batch already exists for this Source** before inserting.

---

## 3. No model replay

Phase 15.9T must not invoke OpenAI or any semantic provider.

It performs exactly one bounded Naver full-post fetch, then requires the fetched content to match the Phase 15.9S content authority exactly:

```text
content hash = frozen 15.9S hash
character count = 3035
content scope = full_post
extraction scope = naver_post_body
truncated = false
```

The Phase 15.9S semantic enum fields are frozen into the candidate result and re-evaluated only by the deterministic local `resolveFullContextSemantic` function.

```text
external model calls = 0
source network requests max = 1
```

---

## 4. Exact write boundary

After all integrity checks succeed, the runner builds one row with the existing governed outcome builder and performs one bulk insert of exactly one row through:

```text
buildSourceFullContextOutcomeRow(...)
persistSourceFullContextOutcomeRows(... expectedCount: 1)
```

Required post-write state:

```text
target Source durable outcomes: 0 → 1
15.9T batch rows: 0 → 1
total full-context outcomes: +1
all protected domain counts: unchanged
```

Protected domains include Source ingestion, Raw Input, Pain Evidence, Formation, Incident, Source→Incident links, curator decisions, Incident executions, Public Problems, Public Evidence, and Public Feed.

---

## 5. Artifact privacy

The disposable one-day live artifact may contain only sanitized hashes, semantic enums, context integrity metadata, aggregate counts, and mutation counters.

It must not contain:

```text
Source UUID
canonical URL
author handle
stored raw/snippet text
full source body
raw evidence quote
provider request ID
Incident UUID
curator decision UUID
Public Problem UUID
```

---

## 6. Live gate and closeout

The temporary live workflow may execute only after:

```text
exact PR-head CI = SUCCESS
PIE = SUCCESS
expected-head merge = complete
merged-main CI = SUCCESS
```

It checks out the exact merged-main CI SHA and does not receive `OPENAI_API_KEY`.

After one successful production persistence and independent Supabase readback, the temporary workflow must be removed in a closeout PR before the next authority phase begins.

---

## 7. Downstream boundary

A durable `candidate` outcome is still not a Formation or Incident.

If Phase 15.9T succeeds, the next phase may assess Formation eligibility for this exact durable outcome. Any later Incident creation/reuse still requires a separate explicit human curator decision.
