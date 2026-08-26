# Phase 15.8T — Atomic Public Evidence Pair Persistence

## Status

**IMPLEMENTED / MIGRATION NOT YET APPLIED / LIVE NOT YET RUN**

Phase 15.8T persists exactly the two publication-grade Evidence plans established by Phase 15.8S and Phase 15.8S-X into the existing Canonical Problem draft.

It does not publish the Problem and does not change its status.

---

## 1. Frozen upstream authority

Target Canonical Problem:

```text
problem_signature = lodging_reservation_fulfillment_gap
status = draft
```

Evidence authority #1:

```text
incident_key = agoda_reservation_fulfillment_gap_case
source-key SHA-256 = 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
excerpt length = 83
excerpt SHA-256 = 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
readiness authority = Phase 15.8S
```

Evidence authority #2:

```text
incident_key = yeogieottae_reservation_fulfillment_gap_case
source-key SHA-256 = 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
excerpt length = 19
excerpt SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
readiness authority = Phase 15.8S-X
```

The repository does not contain either real excerpt text.

---

## 2. Current-source revalidation

Before persistence, each curator-bound Source is fetched twice using:

```text
source-full-context-fetch-v0.2
```

Both fetches must be resolved, full-post, untruncated, and byte-identical.

Each frozen excerpt is then reconstructed by exhaustive contiguous-window SHA-256 matching against the current canonical full post.

For each Source exactly one matching span is required.

Therefore Phase 15.8T does not trust stale excerpt text copied from an artifact and does not ask an LLM to reproduce the excerpt.

External model calls:

```text
0
```

---

## 3. Atomic persistence RPC

Migration:

```text
037_atomic_incident_bound_public_evidence_pair.sql
```

New RPC:

```text
ar_add_incident_bound_public_problem_evidence_pair(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_evidences jsonb
)
```

The RPC requires:

```text
exactly 2 Evidence items
target Problem status = draft
target existing Evidence count = 0
2 distinct Source Signal IDs
2 distinct Incident IDs
2 distinct source_key values
order_index exactly 0 then 1
```

Each item is delegated to the existing curator-authoritative:

```text
ar_add_incident_bound_public_problem_evidence(...)
```

That existing authority validates Source→Incident binding and creates `external_public` Evidence lineage.

Both inserts occur inside one PostgreSQL function statement. Any failure rolls back the complete pair.

After both rows are inserted, the same transaction calls:

```text
ar_assert_public_problem_publishable(p_problem_id)
```

This proves the resulting two-row lineage satisfies current publication cardinality and binding requirements before commit.

It does **not** publish the Problem.

---

## 4. Database transition contract

Expected target transition:

```text
target Evidence rows: 0 → 2
total Public Evidence: 5 → 7
```

Expected unchanged row counts:

```text
Source Signals
Source Observations
Source Ingestion Runs
Raw Inputs
Pain Evidences
Public Problems
Public Feed
Source Incidents
Source→Incident links
Full-context Outcomes
```

The target Canonical Problem must remain:

```text
status = draft
published_at = null
archived_at = null
public feed rows = 0
```

The Evidence RPC may update the draft's normal `updated_by_user_id` / `updated_at` metadata. It does not change Problem identity or publication state.

---

## 5. Evidence snapshot shape

Each persisted row uses the existing Public Evidence schema:

```text
excerpt = exact reconstructed current-source span
publication_basis = external_public
source_type = naver_blog
source_label = current canonical source title
source_url = canonical public Source URL
source_key = same canonical public Source URL
source_observed_at = Source published timestamp when available
source_signal_id = governed Source Signal
incident_id = curator-approved Incident
order_index = 0 or 1
created_by_user_id = Radar owner curator
```

The two exact excerpt strings necessarily become durable Public Evidence snapshots. Full source bodies do not.

---

## 6. Privilege boundary

The pair RPC is:

```text
SECURITY DEFINER
```

Execution is revoked from:

```text
public
anon
authenticated
```

and granted only to:

```text
service_role
```

The function itself still invokes `ar_require_radar_curator()` and the runner resolves exactly one Radar owner curator.

---

## 7. Artifact privacy

The disposable one-day live artifact may retain only:

```text
problem signature
Incident keys
source-key SHA-256
excerpt length / SHA-256
readiness authority
current context hash / char count
safe Evidence readback hashes/counts
aggregate DB counts
```

It must not contain:

```text
Source Signal UUID
Incident UUID
Public Problem UUID
canonical/source URL
source_key literal
Evidence excerpt text
full source body
provider request ID
```

---

## 8. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ apply migration 037 to Supabase
→ verify function privileges
→ fast-forward one-shot agent/phase15-8t-live-execution branch
→ authoritative atomic Evidence persistence
→ artifact inspection
→ independent Supabase readback
→ remove temporary live trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

---

## 9. Downstream boundary

Phase 15.8T authorizes only the persistence of the exact two frozen Evidence plans.

It does **not** authorize:

```text
draft → published status transition
published_at mutation
public feed exposure
publication
```

A later governed phase must separately decide and execute publication after independently confirming the persisted lineage.
