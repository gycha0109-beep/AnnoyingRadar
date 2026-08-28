# Phase 15.9V — Exact CSC Evidence Grounding Recovery

## Status

**IMPLEMENTATION IN REVIEW / LIVE RECOVERY NOT EXECUTED**

Phase 15.9U closed with one exact durable Formation row for the second CSC Source:

```text
status = unresolved
formation_state = review
reason = source_formation_invalid_evidence_quote
```

Phase 15.9V is a narrow recovery phase for that exact grounding failure. It may append one new Formation assessment. It does not mutate or delete the 15.9U baseline row.

No Incident, Source→Incident link, Public Problem, Public Evidence, or publication authority is granted.

---

## 1. Frozen authority

Source authority:

```text
source_identity_sha256 = b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c
source_content_sha256 = db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4
```

Exact Source Admission authority:

```text
batch = phase15.9t-exact-csc-outcome-v0.1
status = resolved
decision = candidate
context_sha256 = 751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540
context_chars = 3035
context_scope = full_post
context_truncated = false
```

Exact failed Formation baseline:

```text
batch = phase15.9u-exact-csc-second-formation-v0.1
status = unresolved
formation_state = review
resolved = false
reason_codes = [source_formation_invalid_evidence_quote]
semantic enum fields = all null
evidence quote = absent
context hash/length = exact 15.9T authority
provider recovery attempted = true
provider recovery recovered = false
provider recovery attempts = 2
provider recovery trigger = source_formation_provider_incomplete
```

The 15.9U row persisted no semantic enum facts. Therefore Phase 15.9V cannot truthfully reuse or reconstruct a prior semantic decision.

---

## 2. Recovery semantics

Phase 15.9V performs one new semantic observation using the existing Formation schema and the existing provider-recovery-sized output budget. The resulting semantic enum fields are normalized and immediately frozen for that execution.

After that point the quote-recovery model cannot change those fields.

If the first semantic observation already contains an exact excerpt of the current 3035-character full post, no quote-selection call is needed.

If the quote is absent or not an exact substring, Phase 15.9V builds bounded, server-owned exact text windows from the verified full post. A second model call may return only:

```text
candidate_id = one enumerated server-owned id
or
candidate_id = null
```

The model never returns replacement evidence text. The server maps the selected id back to the exact source substring and the deterministic Formation gate then evaluates the frozen semantic facts plus that exact excerpt.

This prevents a model-authored paraphrase from becoming durable evidence.

---

## 3. Bounded execution

```text
assessment batch = phase15.9v-exact-csc-evidence-grounding-recovery-v0.1
expected full-context outcomes = 86
expected Formation rows before = 2
target Source Formation rows before = exactly 1
source network requests max = 1
model calls max = 2
Formation database writes = 1
```

The target must remain outside Blind evaluation and have zero Incident links and zero Public Evidence assignment.

Rerun is forbidden if the 15.9V batch already exists.

---

## 4. Durable semantics

The old 15.9U row remains immutable audit evidence of the failed attempt.

The new 15.9V row is appended through the existing governed Formation persistence builder. No existing DB constraint or table is weakened.

The legacy `recovery_*` columns remain reserved for the existing provider-incomplete retry semantics. Phase 15.9V does not mislabel quote selection as that legacy retry; its grounding-recovery provenance is carried by the exact assessment batch, observer version, live artifact, and closeout record.

---

## 5. Possible outcomes

After exact context validation and bounded recovery, the deterministic Formation gate may produce:

```text
eligible
provenance_review
review
reject
```

`eligible` still means only **Formation eligible**. It is not Incident approval.

If no exact supporting excerpt can be selected, the phase persists a new unresolved `review` row rather than inventing or fuzzily repairing evidence text.

---

## 6. Mutation boundary

Only one append to `ar_source_formation_assessments` is authorized.

The following must remain unchanged:

```text
Source Signals / Observations / Ingestion Runs
Raw Inputs / Pain Evidence
full-context outcomes
Incidents
Source→Incident links
curator Incident decisions
Incident executions
Public Problems
Public Evidence
Public Feed
```

---

## 7. Live gate and closeout

The temporary live workflow may run only after:

```text
exact PR-head CI = SUCCESS
PIE = SUCCESS
expected-head merge = complete
merged-main CI = SUCCESS
```

It checks out the exact CI-verified main SHA.

After one live write and independent Supabase readback, the temporary workflow must be removed in a closeout PR.

If the recovered Formation is `eligible`, work stops at the curator boundary and a separate explicit human curator decision is required before any Incident creation or reuse.
