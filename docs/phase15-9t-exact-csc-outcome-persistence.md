# Phase 15.9T — Exact CSC Candidate Outcome Persistence

## Status

**CLOSED — DURABLE CANDIDATE OUTCOME PERSISTED / PRODUCTION VERIFIED**

Phase 15.9S resolved one exact CSC / carrier-feature Source as a full-context `candidate` without database mutation. Phase 15.9T appended only that exact resolved outcome to the private durable full-context outcome layer.

No Formation assessment, Incident creation/linking, Public Problem creation, evidence publication, or feed publication occurred in this phase.

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

The raw evidence quote was not persisted by Phase 15.9T.

---

## 2. Implementation verification

```text
PR #164
corrected exact PR head:
7efdab0b50ad4b07604634070a2aeca5bbc2510a

PR CI #534 = SUCCESS
PIE #154 = SUCCESS

implementation merge/main:
b89aeb89906521b0cf70705899aac5b4015f178d
merged-main CI #535 = SUCCESS
```

The runner re-resolved the exact Source using both immutable Source hashes; no `latest` inference was used.

Before the write it required:

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

Production schema inspection confirmed that the durable outcome table's uniqueness authority is `(batch_version, source_signal_id)`, so the runner additionally rejected any pre-existing outcome for the target Source regardless of batch.

---

## 3. No model replay

Phase 15.9T did not invoke OpenAI or another semantic provider.

The runner performed one bounded Naver full-post fetch and required exact equality with the Phase 15.9S context authority:

```text
content hash = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
character count = 3035
content scope = full_post
extraction scope = naver_post_body
truncated = false
```

The frozen Phase 15.9S semantic enum fields still deterministically resolved to `candidate` through the local semantic resolver.

```text
external model calls = 0
source network requests = 1 / 1
```

---

## 4. Authoritative live persistence

Live workflow:

```text
Source Exact CSC Outcome Persistence 15.9T
run id: 33137419293
head sha: b89aeb89906521b0cf70705899aac5b4015f178d
conclusion: SUCCESS
```

Disposable artifact:

```text
artifact id: 9672563812
digest: sha256:6793b05b5edf9ca252799aa94ad0c3d9e93523f49b51f70f7a80d301d80f6aaa
retention: 1 day
```

Persisted batch:

```text
phase15.9t-exact-csc-outcome-v0.1
```

Live artifact result:

```text
status = resolved
decision = candidate
reason = full_context_first_hand_external_friction
context_integrity_verified = true
model_calls = 0
network_requests = 1
database_write_statements = 1
outcome_rows_before = 85
outcome_rows_inserted = 1
outcome_rows_after = 86
```

Protected before/after counts were identical:

```text
Source Signals = 3710
Source Observations = 4056
Source Ingestion Runs = 152
Raw Inputs = 10
Pain Evidences = 27
Source Incidents = 7
Source→Incident links = 8
Formation assessments = 1
curator Incident decisions = 1
Incident executions = 1
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

---

## 5. Independent production readback

Supabase was independently queried after the live workflow.

Count readback:

```text
full-context outcomes = 86
target Source durable outcomes = 1
15.9T batch rows = 1
Source Incidents = 7
Source→Incident links = 8
Formation assessments = 1
curator decisions = 1
Incident executions = 1
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

Exact durable row readback:

```text
batch_version = phase15.9t-exact-csc-outcome-v0.1
resolution_version = source-full-context-resolution-v0.1
status = resolved
decision = candidate
reason_codes = [full_context_first_hand_external_friction]
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
context_status = resolved
context_scope = full_post
context_content_sha256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context_char_count = 3035
context_truncated = false
prompt_version = source-full-context-semantic-v0.1
provider = openai
model_name = gpt-5-mini-2025-08-07
recovery_attempted = false
recovery_recovered = false
recovery_attempt_count = 1
```

This independently confirms the live artifact and proves the only production mutation was one durable full-context outcome row.

---

## 6. Closeout boundary

The temporary `workflow_run` trigger is removed by the Phase 15.9T closeout PR. Future main CI runs cannot repeat the production insert path automatically.

The exact runner remains as replayable implementation evidence, but rerunning it would also fail its durable target-outcome and batch guards.

---

## 7. Downstream authority

The exact Source now has one durable `candidate` outcome. This still does not make it a Formation or Incident.

The next phase may assess Formation eligibility for this exact durable outcome. If that later Formation becomes `eligible`, a second Incident still requires a new explicit human curator decision; no generic continuation instruction substitutes for that approval.
