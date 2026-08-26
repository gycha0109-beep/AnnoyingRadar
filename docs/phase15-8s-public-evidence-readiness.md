# Phase 15.8S — Public Evidence Readiness

## Status

**IMPLEMENTED / LIVE READ-ONLY VERIFICATION NOT YET RUN**

Phase 15.8S evaluates whether the two curator-approved, persisted lodging Incidents can supply publication-grade external Public Evidence for the Phase 15.8R Canonical Problem draft.

This phase is deliberately read-only.

It does not insert Evidence, mutate the draft, transition status, or publish anything.

---

## 1. Upstream authority

Phase 15.8R closed with:

```text
problem_signature:
  lodging_reservation_fulfillment_gap

Public Problems: 3
Published:       2
Drafts:          1
Target Evidence: 0
Target public feed rows: 0
```

The target Canonical Problem remains:

```text
status = draft
published_at = NULL
archived_at = NULL
```

The two approved Incident identities remain:

```text
agoda_reservation_fulfillment_gap_case
yeogieottae_reservation_fulfillment_gap_case
```

Each is already bound to one distinct persisted Source Signal by Phase 15.8P authority.

---

## 2. Current publication invariant

The live database publication gate requires a Public Problem to have, among other conditions:

```text
title non-empty
summary non-empty
Evidence snapshots >= 2
distinct source_key >= 2
incident identity on every Evidence row
distinct incident_id >= 2
external_public Evidence bound to an actual Source→Incident link
```

Phase 15.8S does not call the publication gate and does not claim the draft is publishable now because no Evidence rows exist yet.

It only simulates whether two exact Evidence plans would satisfy the Evidence cardinality and lineage portion of the current gate if a later governed phase persisted them unchanged.

---

## 3. Full-context rule

Both approved Sources are currently `naver_blog`, which is supported by:

```text
fetchSourceFullContext()
```

The full source body is fetched ephemerally.

Evidence readiness fails closed to review when:

```text
full context unavailable
content_scope != full_post
full post truncated
```

Full source bodies are never written to Supabase, repository files, or the disposable readiness artifact.

---

## 4. Evidence observer

Observer:

```text
public-evidence-readiness-v0.1
public-evidence-excerpt-observer-v0.1
```

The model receives:

```text
Canonical Problem title
Canonical Problem summary
Source platform
Source title
full visible Source text
```

Its authority is narrow: identify whether the source directly supports the already-authorized Canonical Problem mechanism and, if so, return the shortest supporting excerpt.

It does not decide:

```text
Problem identity
Incident identity
publication
ranking
product action
```

---

## 5. Exact excerpt invariant

A ready Evidence excerpt must be:

```text
1..600 characters
exactly present in the fetched source text
one contiguous passage
not rewritten
not summarized
not spliced from multiple passages
not model-redacted
```

The observer schema limits the excerpt to 600 characters and the deterministic normalizer independently verifies exact substring membership.

A generated paraphrase cannot become Public Evidence.

---

## 6. Deterministic readiness states

```text
support_level = direct + exact excerpt
  → ready
  → public_evidence_direct_exact_excerpt

support_level = partial
  → review

support_level = unclear
  → review

support_level = none
  → blocked
```

Only `ready` items may be considered by a later Evidence persistence phase.

Provider recovery is bounded to one retry and only for:

```text
public_evidence_provider_incomplete
```

No generic retry product is activated.

---

## 7. Source / Incident lineage plan

For each ready item, a later persistence phase can reconstruct the required Evidence fields from current authority:

```text
excerpt            = exact ready excerpt
publication_basis  = external_public
source_type         = Source platform
source_label        = fetched source title
source_url          = persisted canonical URL
source_key          = persisted canonical URL
source_observed_at  = persisted published_at
source_signal_id    = persisted Source identity
incident_id         = already-linked Incident identity
```

15.8S does not persist this plan.

The artifact hashes `source_key` rather than exposing the raw URL as identity metadata.

---

## 8. Runner boundary

Runner:

```text
scripts/run-public-evidence-readiness-15-8s.mjs
```

It:

1. requires exactly one active Canonical draft for `lodging_reservation_fulfillment_gap`;
2. requires the two approved Incident identities;
3. requires exactly one governed Source link per Incident and two distinct Sources;
4. requires target Evidence count = 0 and target public-feed rows = 0 before audit;
5. fetches full source context ephemerally;
6. evaluates exact excerpt readiness;
7. simulates the current Evidence cardinality/lineage requirements;
8. verifies all database counts remain exactly unchanged;
9. verifies target Evidence remains 0 and target public feed remains 0.

The runner contains no:

```text
rpc()
insert()
upsert()
update()
delete()
```

---

## 9. Disposable artifact boundary

The one-day artifact may contain:

```text
problem_signature
Incident keys
source platform
readiness state
reason codes
support level
exact candidate Evidence excerpt
excerpt length / SHA-256
source-key SHA-256
full-context hash/count metadata
aggregate DB counts
```

It does not contain:

```text
Source Signal UUID
Incident UUID
Public Problem UUID
canonical URL
fetched URL
raw Source text
full source body
provider request ID
```

The excerpt is the narrow candidate public Evidence itself, not the full source body.

---

## 10. Structural simulation

When both Evidence items are ready, the runner may report:

```text
proposed_evidence_count = 2
distinct_source_key_count = 2
distinct_incident_count = 2
source_incident_bindings_valid = true
```

and:

```text
would_meet_current_publication_cardinality_if_exact_plans_were_persisted = true
```

This is not publication authority.

It means only that the exact plans would satisfy the current cardinality/lineage portion of the gate after a separate governed persistence phase.

---

## 11. Explicit exclusions

Phase 15.8S does not authorize:

```text
ar_add_incident_bound_public_problem_evidence(...)
Public Evidence INSERT
Canonical Problem edits
status transition
publication
existing published Problem mutation or merge
```

Expected database mutation:

```text
0 rows
0 write statements
```

---

## 12. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ authoritative one-shot read-only live run
→ artifact + independent DB verification
→ remove temporary live trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
→ Phase 15.8S CLOSED
```

Only after 15.8S is closed should a later governed phase decide whether the exact ready Evidence plans may be persisted.
