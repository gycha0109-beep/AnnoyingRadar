# Phase 15.9U — Exact CSC Formation Assessment

## Status

**CLOSED — LIVE FORMATION PERSISTED AS UNRESOLVED REVIEW**

Phase 15.9T closed with one exact durable full-context `candidate` outcome for the second CSC / carrier-feature Source. Phase 15.9U assessed and appended exactly one Formation row for that Source and exact 15.9T outcome.

The live result is **not eligible Formation authority**. It is a durable `unresolved / review` result caused by an evidence-quote grounding failure. No Incident identity, Source→Incident linking, Public Problem, Public Evidence, or publication authority was granted or mutated.

---

## 1. Exact upstream authority

```text
Source identity SHA256:
b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c

Source content SHA256:
db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4

Durable outcome batch:
phase15.9t-exact-csc-outcome-v0.1

Durable outcome state:
resolved / candidate

Context SHA256:
751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540

Context chars: 3035
Context scope: full_post
Context truncated: false
```

The runner resolved the Source by both Source hashes and the upstream outcome by exact `(source_signal_id, batch_version)`. It did not infer a latest outcome.

---

## 2. Live execution

Implementation PR:

```text
PR #166
exact approved head:
0fc3080bf7692d6400184048df56dad213896294
```

Verification:

```text
PR CI #539 = SUCCESS
PIE #157 = SUCCESS
merge main = 82861e3acca58b5f706d75cfc838774a680aaa31
merged-main CI #540 = SUCCESS
live workflow run = 33137998007 = SUCCESS
artifact id = 9672788162
artifact digest = sha256:d3af545629990a6a13096a6c2bd16787e9fb711aac2d7c47973303bc8bc2bb54
```

Live Formation result:

```text
assessment batch = phase15.9u-exact-csc-second-formation-v0.1
status = unresolved
formation_state = review
resolved = false
reason_codes = [source_formation_invalid_evidence_quote]
context SHA256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context chars = 3035
context truncated = false
provider = openai
model = gpt-5-mini-2025-08-07
recovery_attempted = true
recovery_recovered = false
recovery_attempt_count = 2
recovery_trigger_reason_code = source_formation_provider_incomplete
```

No semantic enum fields or evidence quote were durably accepted because the bounded provider sequence did not produce a valid grounded quote.

---

## 3. Independent production readback

Independent Supabase readback after the workflow confirmed:

```text
Formation assessments = 2
target Source Formation rows = 1
Incidents = 7
Source→Incident links = 8
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

The exact target row independently read back as:

```text
status = unresolved
formation_state = review
resolved = false
reason = source_formation_invalid_evidence_quote
context hash/length = exact 15.9T authority
recovery attempted = true
recovery recovered = false
attempt count = 2
```

Thus the live artifact and production database agree.

---

## 4. Authority interpretation

`source_formation_invalid_evidence_quote` is not an eligibility decision and is not an Incident rejection. It is an unresolved grounding failure.

The following remain false:

```text
incident_persistence_authorized = false
source_incident_link_authorized = false
public_problem_authorized = false
public_evidence_persistence_authorized = false
publication_authorized = false
```

The existing 15.9K provider recovery is intentionally insufficient for this terminal condition because it is scoped to `source_formation_provider_incomplete`. A later recovery phase must treat the exact durable 15.9U row as its frozen baseline and may repair only the evidence-grounding failure without silently rewriting semantic authority.

---

## 5. Closeout

The temporary `Source Exact CSC Formation 15.9U` merged-main live workflow is removed by the closeout PR and its contract test requires it to remain absent.

Phase 15.9U is closed after that closeout PR passes CI / PIE, expected-head merge, and merged-main CI.

---

## 6. Downstream boundary

The next permitted work is a bounded grounding-recovery phase for the exact `source_formation_invalid_evidence_quote` result.

If that later recovery produces an integrity-bound `eligible` Formation, work must stop at the curator boundary. Incident creation or reuse still requires a separate explicit human curator approval.
