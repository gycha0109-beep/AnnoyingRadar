# Phase 15.9I — Confirmed False-Negative Candidate Outcome Persistence

## Status

**IMPLEMENTED — pending PR / CI / PIE / one-shot live persistence**

Phase 15.9I follows the closed Phase 15.9H provider-incomplete recovery reproduction.

Phase 15.9H confirmed three current snippet-level Source Admission false negatives:

```text
ordinal 4  -> candidate
ordinal 9  -> candidate
ordinal 16 -> candidate
```

All three resolved under the existing `source-full-context-semantic-v0.1` authority as:

```text
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic

final decision = candidate
reason = full_context_first_hand_external_friction
```

Phase 15.9H was intentionally read-only. Its Candidate identities therefore still have no durable full-context outcome row.

Phase 15.9I performs the smallest authorized persistence step needed to preserve those already-confirmed Candidate outcomes without asking the semantic provider to decide them again.

---

## 1. Why Phase 15.9I does not rerun the model

A fresh semantic call would create an avoidable nondeterminism boundary:

```text
H already observed Candidate
→ rerun provider in I
→ provider may return a different structured result
→ durable authority no longer corresponds to the H finding being preserved
```

Phase 15.9I therefore has:

```text
semantic-provider calls = 0
OpenAI credential required = false
```

It freezes only privacy-safe Phase 15.9H observations needed by the existing durable outcome schema and revalidates the public context those observations were made against.

---

## 2. Existing durable authority reused

Phase 15.9I does not create a new table or persistence model.

It reuses the closed Phase 15.8M authority:

```text
ar_source_full_context_resolution_outcomes
source-full-context-outcome-v0.1
buildSourceFullContextOutcomeRow()
persistSourceFullContextOutcomeRows()
```

The table remains private and append-only at the service-role privilege boundary.

Authority key:

```text
(batch_version, source_signal_id)
```

Phase 15.9I batch:

```text
phase15.9i-confirmed-false-negative-candidates-v0.1
```

The live baseline before Phase 15.9I is:

```text
ar_source_full_context_resolution_outcomes = 82 rows
```

The three Phase 15.9H Candidate Sources currently have zero rows in this table.

Expected successful poststate:

```text
82 + 3 = 85 rows
```

No existing row is updated or deleted.

---

## 3. Frozen Phase 15.9H Candidate authority

Exact Phase 15.9G/H deterministic sample fingerprint:

```text
2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e
```

Candidate ordinals:

```text
4, 9, 16
```

### Ordinal 4

```text
original rejection stratum = title_no_complaint_signal
context SHA-256 = 41f15cace5262a57cdd1fc439c2b61caf0b101b20d1b9595552c7c8802dcc1eb
context chars = 5752
extraction scope = main_element
title SHA-256 = c75c730c0c0321bd7a3902bad30a9c28cbf335953f6b36cd4885ddb51537f9ff

H recovery:
  attempted = true
  recovered = true
  attempt_count = 2
  trigger = source_full_context_provider_incomplete
```

### Ordinal 9

```text
original rejection stratum = title_truncated_no_complaint_signal
context SHA-256 = 4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463
context chars = 3407
extraction scope = content_container
title SHA-256 = 309927f9a8f9359310e90f53078eb5c2c178dc6a1c70ddd2eb8b112c15e22988

H recovery:
  attempted = false
  recovered = false
  attempt_count = 1
```

### Ordinal 16

```text
original rejection stratum = title_information_or_guide
context SHA-256 = cff1a57a383f6a903e6828117bf5115a04d412d54241982bf463748b97dea53c
context chars = 3149
extraction scope = article_element
title SHA-256 = cc886d2f25206da7d5269718779383532ff09b759b3eca34fc121d60232a2d9e

H recovery:
  attempted = false
  recovered = false
  attempt_count = 1
```

No Source UUID, canonical URL, author handle, body text, exact evidence quote, or provider request identifier is frozen in repository authority.

---

## 4. Reconstruction boundary

The live runner reconstructs the same Phase 15.9C campaign and Phase 15.9G/H deterministic sample.

Required reconstruction:

```text
8 ingestion runs
351 observations
313 newly inserted Sources
all 313 remain snippet-level reject under current Source Admission authority
blind overlap = 0 before canonical URL/body reads
origin authority = 5 naver_blog / 308 external_web
sample size = 16
sample fingerprint = exact H fingerprint
```

Only then are ordinals 4, 9, and 16 selected.

The selected targets must still have:

```text
actual content origin = external_web
original rejection strata = exact H strata
Blind membership = false
existing durable full-context outcomes = 0
```

Any mismatch fails closed before persistence.

---

## 5. Context-integrity gate

Each of the three targets is refetched twice under the closed external-web acquisition authority.

The pair must first satisfy the Phase 15.9G stability contract:

```text
resolved
not truncated
same content_hash
same original_char_count
same extraction_scope
same title
```

Then both acquisitions must match the exact Phase 15.9H observation:

```text
content_hash = frozen H context SHA-256
original_char_count = frozen H count
content_text.length = frozen H count
content_scope = full_post
extraction_scope = frozen H scope
SHA-256(title) = frozen H title SHA-256
```

This is the critical authority bridge:

```text
same public Source identity
+ same deterministic H sample position
+ same fetched context bytes after extraction
+ same title/scope
→ H semantic observation may be persisted without a new semantic draw
```

If any one target fails integrity validation, no outcome row is written for any target.

---

## 6. Frozen semantic facts

For all three targets Phase 15.9H observed:

```text
problem_claim = yes
experience_actor = self
friction_cause = external_service_or_product
friction_specificity = concrete
pain_centrality = central
content_kind = organic
```

Before building durable rows, Phase 15.9I passes these frozen facts through the existing pure resolver:

```text
resolveFullContextSemantic()
```

Required result:

```text
decision = candidate
reason = full_context_first_hand_external_friction
```

This is not a model call and does not create a new policy.

If the current resolver no longer maps the frozen H semantic facts to Candidate, Phase 15.9I fails closed rather than silently persisting a stale interpretation.

---

## 7. Persistence semantics

After all three targets pass reconstruction, Blind, origin, context-integrity, and resolver checks, the runner builds three safe rows in memory using:

```text
buildSourceFullContextOutcomeRow()
```

No row is persisted while target validation is still in progress.

Immediately before insertion, required state remains:

```text
batch rows = 0
outcome total = 82
protected domains = unchanged
all 3 safe rows built
all 3 Source identities unique
```

Then exactly one existing bulk persistence call is authorized:

```text
persistSourceFullContextOutcomeRows()
```

with:

```text
expected batch version = phase15.9i-confirmed-false-negative-candidates-v0.1
expected count = 3
```

Expected readback:

```text
batch rows = 3
all status = resolved
all decision = candidate
all reason = full_context_first_hand_external_friction
outcome total = 85
```

---

## 8. Durable fields

The existing outcome schema may preserve:

```text
batch/source identity key
resolution/recovery versions
resolved/candidate/reason
six semantic facts
context SHA-256
context char count
full_post scope
truncation flag
prompt/provider/model metadata
bounded H recovery metadata
```

It does not persist:

```text
full source body
raw search snippet
canonical URL
fetched URL
author handle
evidence quote
provider request ID
provider payload
```

Phase 15.9I does not weaken those constraints.

---

## 9. Mutation boundary

The only authorized production mutation is:

```text
ar_source_full_context_resolution_outcomes
+ exactly 3 append-only rows
```

The following domains must remain exactly unchanged:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
ar_source_incidents
ar_source_incident_links
```

Not authorized:

```text
Source row update
snippet-level Source Admission policy change
Source Admission recovery overlay
Incident creation
Source -> Incident linking
problem_signature assignment
Canonical/Public Problem creation
Public Evidence persistence
publication
```

A durable Candidate outcome still means only:

```text
Candidate under the exact full-context batch authority
```

It does not mean an independent Incident or publishable Problem exists.

---

## 10. Cost boundary

Targets:

```text
3
```

External source acquisitions:

```text
3 targets x 2 acquisitions = 6 successful page acquisitions
```

Maximum HTTP request budget including redirects:

```text
3 x 2 x 4 = 24
```

Semantic-provider calls:

```text
0
```

Maximum DB write statements:

```text
1 bulk INSERT
```

Maximum inserted rows:

```text
3
```

---

## 11. One-shot workflow

Workflow:

```text
.github/workflows/source-confirmed-fn-outcome-persistence-15-9i.yml
```

Temporary live branch:

```text
agent/phase15-9i-live-execution
```

The workflow always checks out authoritative `main`.

Required secrets are Supabase credentials only. No OpenAI API key is provided to the job.

The temporary push trigger must be removed during closeout.

---

## 12. Close criterion

Phase 15.9I may close only after:

1. implementation diff review passes;
2. exact-head CI passes;
3. PIE prospective shadow passes;
4. expected-head implementation merge succeeds;
5. merged-main CI passes;
6. exact Phase 15.9G/H sample reconstructs;
7. candidate ordinals 4/9/16 reconstruct exactly;
8. Blind overlap is zero before URL/body access;
9. all six live fetches form three stable pairs;
10. every context-integrity field matches the frozen H authority;
11. model calls remain exactly zero;
12. exactly one bulk INSERT persists exactly three rows;
13. outcome total moves exactly 82 -> 85;
14. all protected domains remain unchanged;
15. independent production DB readback confirms the poststate;
16. disposable artifact is inspected;
17. temporary push trigger is removed;
18. closeout exact-head CI/PIE and merged-main CI pass.

---

## 13. Decision boundary after closeout

Phase 15.9I preserves the confirmed false-negative Candidate identities durably without changing how future Sources are admitted.

A later phase must separately decide whether to:

```text
A. form Incidents from only these three durable Candidates;
B. investigate broader policy correction for the three affected snippet-reject strata;
C. add a selective external-web full-context rescue path to production;
D. do none of the above until broader calibration exists.
```

Those are separate authorities. Phase 15.9I grants none of them.
