# Phase 15.8V — Explicit Curator-Approved Publication Execution

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.8V executes the explicit curator approval received after Phase 15.8U.

The approved action is exactly:

```text
publication_decision = approve
metadata edits = none
Evidence edits = none
draft → published = authorized
```

The approval applies only to the exact Phase 15.8U packet for:

```text
problem_signature = lodging_reservation_fulfillment_gap
```

---

## 1. Upstream authority

Phase 15.8U closed with:

```text
status = draft
Evidence = 2
distinct Sources = 2
distinct Incidents = 2
exact Source→Incident lineage = true
ar_assert_public_problem_publishable() = PASS
public feed rows = 0
```

Authoritative 15.8U packet:

```text
run = 33026457657
artifact = 9628577829
digest = sha256:9e01579973fb1823c79628ad18177cc08b8d9b740055c3db3b237b415b3f4ba7
```

After that packet was explained to the curator, explicit publication approval was given on 2026-08-27 KST with no requested copy or Evidence edits.

Normalized authority:

```json
{
  "publication_decision": "approve",
  "decision_reason": "explicit_curator_publication_approval_without_edits",
  "metadata_edits_authorized": false,
  "evidence_edits_authorized": false,
  "publication_authorized": true
}
```

---

## 2. Exact publication target

Phase 15.8V refuses execution if any approved Canonical Problem field has drifted from the Phase 15.8Q authority:

```text
title
summary
target_user
situation
category
problem_signature
```

It also revalidates the exact two durable Evidence rows against the frozen Phase 15.8T fingerprints and Incident identities.

The target must still be:

```text
status = draft
published_at = null
archived_at = null
public feed rows = 0
```

---

## 3. Existing publication authority

No new migration is required.

Phase 15.8V uses the existing curator-gated function:

```text
ar_set_public_problem_status(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_status text
)
```

with:

```text
p_status = published
```

The existing function:

1. requires a Radar curator,
2. locks the target Problem,
3. validates the `draft → published` transition,
4. calls `ar_assert_public_problem_publishable(...)`,
5. sets `status = published`,
6. sets `published_at = now()`,
7. clears `archived_at`,
8. records the curator in `updated_by_user_id`.

Current execute privilege remains:

```text
service_role = true
anon = false
authenticated = false
```

---

## 4. Write boundary

The live runner is allowed exactly one state-changing RPC call:

```text
ar_set_public_problem_status(..., 'published')
```

It does not perform direct:

```text
insert
upsert
update
delete
```

and does not mutate Canonical Problem copy or Evidence.

External model calls:

```text
0
```

---

## 5. Expected database transition

Expected target transition:

```text
status: draft → published
published_at: null → timestamp
target public feed rows: 0 → 1
```

Expected aggregate transition:

```text
published Problems: 2 → 3
draft Problems: 1 → 0
public feed rows: 2 → 3
```

Expected unchanged row counts:

```text
Source Signals = 3245
Source Observations = 3537
Source Ingestion Runs = 132
Raw Inputs = 10
Pain Evidences = 27
Public Problems = 3
Public Evidence = 7
Source Incidents = 6
Source→Incident links = 7
Full-context Outcomes = 82
```

`ar_public_problem_feed` is a publication projection, so its row count is expected to increase by exactly one when the existing Problem becomes published.

---

## 6. Post-publication verification

The authoritative live run must independently reload:

```text
same problem_signature
same title / summary / target_user / situation / category
status = published
published_at != null
archived_at = null
same exact 2 Evidence rows
same exact Incident identities
same exact Source→Incident lineage
target public feed rows = 1
```

Aggregate counts must show only the expected publication projection change.

---

## 7. Artifact privacy

The disposable one-day artifact may contain:

```text
problem signature and public copy
normalized curator approval
status before/after
published_at
Evidence hashes/lengths and Incident keys
aggregate DB counts
public-feed counts
```

It must not contain raw internal:

```text
Source Signal UUID
Incident UUID
Public Problem UUID
Evidence excerpt text
source URLs / source_key literals
full source bodies
```

---

## 8. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ one-shot agent/phase15-8v-live-execution branch
→ authoritative publication RPC
→ artifact inspection
→ independent Supabase readback
→ remove temporary live trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

Phase 15.8V is complete only after the final merged-main CI and independent live readback both pass.
