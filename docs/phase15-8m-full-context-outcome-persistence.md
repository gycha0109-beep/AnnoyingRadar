# Phase 15.8M-A — Full-Context Resolution Outcome Persistence

## Status

**CLOSED**

Implementation PR #94 was merged before the live migration was applied.

```text
implementation merge: e00a5dbea751965bf2cfe098ac87240a206d716a
CI #374: SUCCESS
PIE #62: SUCCESS
migration: 034_source_full_context_resolution_outcomes.sql
live project: yjdubukqkcvkymabskzd
migration apply: SUCCESS
```

15.8M-A performed no paid full-context batch.

## Why this phase exists

Phase 15.8K and 15.8L intentionally produced aggregate-only calibration diagnostics. Repeating that model for the remaining Review cohort would lose Candidate identities after the process exits and force a later Formation audit to pay for another refetch + semantic rerun.

15.8M-A creates a durable, private authority for current full-context Source Admission outcomes before any broader remaining-Review resolution.

## Legacy semantic table is not reused

The existing:

```text
ar_source_signal_semantic_judgments
```

belongs to the older Phase 15.5D semantic-gate schema and is not compatible with current full-context v0.1 semantics.

Important differences include:

```text
legacy problem_claim: yes / no / uncertain
current problem_claim: yes / no / unclear

current fields absent from legacy table:
- friction_cause
- pain_centrality
```

The legacy schema also requires a non-null evidence quote for `problem_claim = yes`, while current full-context resolution permits a null quote.

Live verification before and after migration 034 confirmed:

```text
ar_source_signal_semantic_judgments rows: 0
```

Migration 034 did not alter or backfill that table.

## New durable authority

New table:

```text
ar_source_full_context_resolution_outcomes
```

Authority granularity:

```text
(batch_version, source_signal_id)
```

The Source FK is:

```text
ON DELETE RESTRICT
```

so an authoritative outcome cannot silently lose its Source provenance through parent deletion.

Service-role access is append-only at the privilege layer:

```text
service_role: SELECT + INSERT
no UPDATE
no DELETE
anon/authenticated/public: no table privileges
RLS: enabled
```

The PostgreSQL owner retains normal owner privileges; that is not application/service-role authority.

A rerun must use a new batch version rather than overwrite an existing row.

## Persisted fields

The durable row stores only structured resolution metadata:

```text
outcome schema version
batch version
source_signal_id
resolution version
recovery version
status / final decision / reason codes

problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind

context fetch status
context scope
SHA-256 of the exact ephemeral text judged
judged character count
truncation flag

prompt version
provider
model name

recovery attempted/recovered/attempt count
recovery trigger/terminal reason
evaluated_at / created_at
```

## Data intentionally not persisted

Live schema inspection confirmed **zero forbidden columns** for:

```text
content_text
raw_text
canonical_url
fetched_url
author_handle
evidence_quote
provider_request_id
```

Provider payloads are also not persisted.

The helper hashes the ephemeral `content_text` and then discards the body from the durable row.

## Semantic contract

Current enum authority is preserved:

```text
problem_claim:
  yes | no | unclear
experience_actor:
  self | other | generic | unknown
friction_cause:
  external_service_or_product | self_caused | mixed | unknown
friction_specificity:
  concrete | vague | none | unknown
pain_centrality:
  central | incidental | unclear
content_kind:
  organic | advertisement | informational | news | repost | unknown
```

Semantic facts must be either all six present or all six absent.

Decision contract:

```text
resolved   → candidate | reject
unresolved → review
```

A resolved Candidate/Reject requires all six semantic fields. An unresolved Review may contain all six semantic facts when semantic uncertainty remains, or none when fetch/provider failure prevented a semantic result.

`not_required` snippet-level decisions cannot enter this table.

## Context integrity

Resolved context requires:

```text
context_status = resolved
context_scope = full_post
context_content_sha256 = 64-char lowercase SHA-256
context_char_count >= 20
```

Unavailable context requires null scope/hash/count and `context_truncated = false`.

The persistence helper fails closed if a resolved result claims any scope other than `full_post`.

## Blind protection

The operational discovery pool already excludes Blind, but 15.8M-A adds a database-level guard:

```text
before INSERT or UPDATE
if source_signal_id exists in ar_source_signal_evaluation_samples
→ raise SQLSTATE 23514
```

A live Blind probe was executed against an existing Blind member using an otherwise valid outcome row.

Result:

```text
insert blocked: YES
SQLSTATE: 23514
outcome rows after probe: 0
```

The guard is independent of evaluation lock state. Blind membership itself is sufficient to deny an AI full-context outcome write.

## Live schema verification

Verified live:

```text
RLS enabled: true
service_role privileges: INSERT, SELECT only
unique(batch_version, source_signal_id): present
Source FK ON DELETE RESTRICT: present
batch/decision index: present
source/created index: present
Blind guard trigger: present
forbidden persisted columns: 0
new outcome rows: 0
legacy semantic rows: 0
```

The new table therefore started empty and ready for an explicitly versioned operational batch.

## Persistence helper

Module:

```text
lib/sources/source-full-context-outcome-persistence.mjs
```

It:

1. validates status/decision contracts;
2. validates complete-or-absent semantic shape;
3. validates `full_post` context scope;
4. computes SHA-256 from ephemeral judged text;
5. strips body/URL/author/quote/request-id data from the durable row;
6. maps recovery metadata;
7. performs INSERT only;
8. returns only safe identity/decision metadata.

## Formation boundary

A persisted `decision = candidate` means only:

```text
Source Admission Candidate under the exact batch authority
```

It does not grant:

```text
independent incident authority
repeated mechanism authority
canonical Problem authority
publication authority
```

Formation remains a later phase and must still refetch public context ephemerally and prove independent incident support.

## Next phase — 15.8M-B

The next bounded cohort is the deterministic complement of the exact Phase 15.8J Review cohort after excluding the Phase 15.8K calibration sample:

```text
130 exact-new Reviews
- 48 K calibration sample
= 82 unsampled Reviews
```

15.8M-B may now:

- reconstruct those exact 82 records fail-closed;
- use provider-incomplete-only one-retry behavior validated in 15.8L;
- persist exactly one outcome per attempted Source under one fixed batch version;
- keep full source bodies ephemeral;
- keep Source/Observation/Ingestion/Raw/Pain/Public/Incident/Blind boundaries unchanged;
- perform no Formation or publication mutation.

The 48 K calibration records are not retroactively converted into operational Formation authority.

## Close decision

All 15.8M-A close criteria were met.

Phase 15.8M-A is **CLOSED**.