# Phase 15.8M-A — Full-Context Resolution Outcome Persistence

## Status

**IMPLEMENTED — pending CI/PIE and live migration verification**

## Why this phase exists

Phase 15.8K and 15.8L deliberately emitted aggregate-only full-context diagnostics. That was correct for calibration, but it creates a new operational problem before resolving the remaining 15.8J Review cohort:

```text
full-context resolution
→ Candidate identity exists only in process memory
→ aggregate log discards the identity
→ later Formation would need another paid refetch + semantic rerun
```

That would introduce avoidable cost and provider nondeterminism.

Phase 15.8M-A creates a durable, private authority for **current full-context Source Admission outcomes** before any broad remaining-Review batch is executed.

It does not itself perform new paid resolution work.

## Legacy semantic table is not reused

The existing table:

```text
ar_source_signal_semantic_judgments
```

belongs to the older Phase 15.5D semantic-gate schema.

Its contract differs materially from the current full-context semantic authority:

```text
legacy problem_claim: yes / no / uncertain
current problem_claim: yes / no / unclear

legacy fields:
- problem_claim
- experience_actor
- friction_specificity
- content_kind
- evidence_quote

current additional fields:
- friction_cause
- pain_centrality
```

The legacy schema also requires an evidence quote for `problem_claim = yes`, while current full-context resolution permits a null quote.

Live inspection before 15.8M-A found the legacy semantic-judgment table empty, but emptiness does not make its schema semantically compatible.

Therefore 15.8M-A does **not** alter, backfill, repurpose, or write to the legacy table.

## New durable authority

Migration:

```text
034_source_full_context_resolution_outcomes.sql
```

New table:

```text
ar_source_full_context_resolution_outcomes
```

Authority granularity:

```text
(batch_version, source_signal_id)
```

The table is append-only at the service-role privilege layer:

```text
service_role: SELECT + INSERT
no UPDATE
no DELETE
anon/authenticated/public: no privileges
RLS: enabled
```

A batch cannot silently overwrite a prior outcome. A later rerun must use a new batch version.

## Persisted fields

The table stores only the minimum structured metadata needed to preserve the exact resolution decision and later recover Candidate identities safely:

```text
outcome schema version
batch version
source_signal_id
resolution version
recovery version
status
final decision
reason codes

problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind

context fetch status
context scope
SHA-256 of the exact text shown to the semantic judge
judged character count
truncation flag

prompt version
provider
model name

recovery attempted/recovered/attempt count
recovery trigger/terminal reason
timestamps
```

## Data intentionally not persisted

The new table has no columns for:

```text
full source body
raw_text
canonical URL
fetched URL
author handle
evidence quote
provider request id
provider request/response payload
```

The persistence helper computes the SHA-256 digest from the ephemeral `content_text` and then discards the body from the durable row.

This means future Formation can use the durable Candidate identity to refetch public context ephemerally without retaining the full body in the resolution authority.

## Semantic shape

Current semantic enums are preserved exactly:

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

Semantic fields are either:

```text
all six present
or
all six absent
```

A resolved Candidate/Reject outcome requires all six fields.

An unresolved Review may have all fields present when the semantic facts remain uncertain, or all fields absent when the fetch/provider failed before a semantic result existed.

## Decision contract

Persistable statuses are only:

```text
resolved
unresolved
```

Decision mapping is constrained:

```text
resolved   → candidate | reject
unresolved → review
```

`not_required` snippet-level decisions are not part of this table. This prevents the full-context outcome authority from being polluted by records that never entered full-context resolution.

## Context integrity

For successfully fetched context:

```text
context_status = resolved
context_scope = full_post
context_content_sha256 = SHA-256(ephemeral judged content_text)
context_char_count >= 20
```

For unavailable context:

```text
context_status = unavailable
context_scope = null
context_content_sha256 = null
context_char_count = null
```

No body is retained.

## Blind protection

The operational discovery pool already excludes the Blind 120.

15.8M-A adds defense in depth at the database boundary:

```text
before INSERT/UPDATE
if source_signal_id exists in ar_source_signal_evaluation_samples
→ reject with SQLSTATE 23514
```

Therefore a future batch bug cannot persist full-context AI outcomes for any Blind member even when using service-role credentials.

This trigger is intentionally independent of evaluation-set lock state; Blind membership itself is sufficient to deny the write.

## Persistence helper

Module:

```text
lib/sources/source-full-context-outcome-persistence.mjs
```

Responsibilities:

1. validate current status/decision contracts;
2. validate complete-or-absent semantic shape;
3. fail closed on non-`full_post` resolved context;
4. hash ephemeral judged text;
5. map recovery metadata;
6. construct a safe row with no source body or identity-bearing fetch metadata;
7. perform an INSERT only;
8. return only safe identity/decision metadata.

The helper does not expose Formation or publication behavior.

## Formation boundary

A persisted `decision = candidate` means only:

```text
Source Admission Candidate under the exact batch authority
```

It does **not** mean:

```text
independent incident
repeated mechanism
canonical Problem
publishable Problem
```

Future Formation must still:

1. select an explicitly authorized Candidate batch;
2. refetch required public full context ephemerally;
3. detect incident identity;
4. require independent incident support for repetition;
5. remain separate from publication.

## Planned 15.8M-B

After 15.8M-A is verified live, the next bounded operation is the **82-record complement** of the exact 130 Review cohort from Phase 15.8J after excluding the 48-record Phase 15.8K calibration sample.

Planned authority:

```text
130 exact-new Reviews
- 48 K calibration sample
= 82 unsampled remainder
```

15.8M-B should:

- reconstruct that complement deterministically;
- use provider-incomplete-only one-retry behavior proven in 15.8L;
- persist exactly one outcome per attempted Source under one fixed batch version;
- never persist full source bodies;
- keep Source/Observation/Ingestion/Raw/Pain/Public/Incident/Blind boundaries unchanged;
- perform no Formation or publication mutation.

The 48 K calibration results are not retroactively converted into Formation authority. Re-running them solely to populate this table would add cost and provider nondeterminism without a prior operational authorization.

## Close criterion for 15.8M-A

15.8M-A closes only after:

1. CI is green;
2. PIE prospective shadow is green;
3. migration 034 is merged;
4. migration 034 is applied live;
5. live schema/constraints/indexes are verified;
6. RLS and grants confirm service-role SELECT/INSERT only;
7. Blind trigger exists;
8. legacy semantic tables remain untouched;
9. new outcome table row count remains 0 before 15.8M-B.

No paid full-context batch is part of 15.8M-A.