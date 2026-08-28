# Phase 15.9V — Exact CSC Evidence Grounding Recovery

## Status

**CLOSED — LIVE RECOVERY PERSISTED ELIGIBLE FORMATION**

Phase 15.9V recovered the exact second CSC Source from the durable Phase 15.9U `source_formation_invalid_evidence_quote` review state without mutating or deleting the failed 15.9U row.

The new durable Formation is `resolved / eligible`. This remains Formation authority only. No Incident, Source→Incident link, Public Problem, Public Evidence, or publication mutation occurred.

---

## 1. Frozen upstream authority

```text
source_identity_sha256 = b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c
source_content_sha256 = db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4

15.9T outcome batch = phase15.9t-exact-csc-outcome-v0.1
15.9T outcome id = 40774fc7-b064-451b-8b18-6c0290512654
15.9T state = resolved / candidate

context_sha256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context_chars = 3035
context_scope = full_post
context_truncated = false

15.9U Formation id = 57f6414f-c640-42e1-ba4c-9686a9134cea
15.9U batch = phase15.9u-exact-csc-second-formation-v0.1
15.9U state = unresolved / review
15.9U reason = source_formation_invalid_evidence_quote
```

The 15.9U row persisted no semantic enum facts or grounded quote and remains unchanged as failed-attempt audit evidence.

---

## 2. Implemented grounding authority

Phase 15.9V did not weaken the exact-quote contract.

The recovery implementation:

1. re-fetched exactly one authoritative full post;
2. required the exact 15.9T context hash and 3035-character body;
3. performed one new structured Formation semantic observation because 15.9U had no durable semantic enum authority;
4. froze those semantic facts for that execution;
5. if quote repair had been necessary, allowed a second model call to choose only an enumerated server-owned exact excerpt id;
6. mapped any selected id to exact source text on the server before the deterministic Formation gate;
7. appended one new Formation row only.

The live semantic observation itself returned an already exact grounded quote, so the quote-selection fallback was not needed.

---

## 3. Implementation / CI / live execution

```text
implementation PR = #168
exact implementation head = d51bb3ac19c3c07ea72c6d824b07526bd91120d4
PR CI #544 = SUCCESS
PIE #161 = SUCCESS
merge main = 8b3f8ce28fd8b4ff79fe77f8c6df087e7a239dec
merged-main CI #545 = SUCCESS

live workflow run = 33149225152 = SUCCESS
artifact id = 9677018976
artifact digest = sha256:02691c28f42d8eff44a55d4ccf7a1cfae6bc536c30e1d6db61eea20930fb03c7
```

Live execution counters:

```text
source network requests = 1 / 1
model calls = 1 / 2
database write statements = 1
Formation assessments = 2 → 3
full-context outcomes = 86 → 86
```

---

## 4. Durable recovered Formation

Independent Supabase readback:

```text
Formation id = e1b44602-f63a-4426-98fd-f41c98c7f9e3
assessment batch = phase15.9v-exact-csc-evidence-grounding-recovery-v0.1
observer version = source-formation-evidence-grounding-recovery-v0.1
source admission outcome id = 40774fc7-b064-451b-8b18-6c0290512654
source admission batch = phase15.9t-exact-csc-outcome-v0.1

status = resolved
formation_state = eligible
resolved = true
reason_codes = [formation_grounded_external_friction]

problem_claim = yes
experience_actor = self
friction_specificity = concrete
pain_centrality = central
content_kind = organic
source_origin = original
friction_responsibility = external_service_or_product

evidence_quote_sha256 = 159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9
evidence_quote_char_count = 44
evidence_quote_start = 2125
evidence_quote_end = 2169
evidence_quote_grounded = true

context_content_sha256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context_char_count = 3035
context_truncated = false

provider = openai
model = gpt-5-mini-2025-08-07
legacy recovery_attempted = false
legacy recovery_recovered = false
legacy recovery_attempt_count = 0
```

The recovered evidence quote hash and length exactly match the previously grounded Phase 15.9S evidence authority.

---

## 5. Artifact telemetry discrepancy

The live artifact's `grounding_recovery.semantic_observed`, `evidence_selection_attempted`, and `evidence_selection_succeeded` booleans were serialized from snake_case property names while the in-memory recovery object used camelCase names. This caused those three optional telemetry flags to appear as `false` in the disposable artifact.

This defect does **not** affect the durable Formation row, model-call counter, exact quote hash/offsets, context integrity, or Formation result. Independent DB readback is the authority for the persisted result. The live run used one model call; therefore semantic observation occurred, and because the first returned quote was already exact-grounded, evidence-selection fallback was not invoked.

The temporary workflow is removed at closeout, so the one-shot live runner cannot replay this batch.

---

## 6. Independent protected-domain readback

After live persistence:

```text
full-context outcomes = 86
Formation assessments = 3
target Source Formation rows = 2
15.9V batch rows = 1

Incidents = 7
Source→Incident links = 8
curator decisions = 1
Incident executions = 1
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

Exact target downstream readback:

```text
target Incident links = 0
target Public Evidence rows = 0
target Blind samples = 0
existing carrier_csc_feature_restriction_case Incidents = 1
```

---

## 7. Authority boundary

This durable row establishes only:

```text
Formation = eligible
```

It does not authorize:

```text
Incident reuse or creation
Source→Incident linking
Public Problem creation
Public Evidence creation
Public Feed publication
```

There is exactly one existing Incident with key `carrier_csc_feature_restriction_case`, but linking this second Source to that Incident requires a separate explicit human curator decision.

---

## 8. Closeout

The temporary `Source Exact CSC Evidence Grounding Recovery 15.9V` workflow is removed by the closeout PR. Contract tests require it to remain absent.

Phase 15.9V is CLOSED after closeout PR CI / PIE, expected-head merge, and merged-main CI succeed.
