# Phase 15.8U — Publication Curator Decision Packet

## Status

**IMPLEMENTED / AUTHORITATIVE LIVE NOT YET RUN**

Phase 15.8U is the read-only human/curator gate between the completed Public Evidence persistence work and any possible publication transition.

It does not publish the Canonical Problem.

---

## 1. Upstream authority

Phase 15.8T closed with the target Canonical Problem still active as:

```text
problem_signature = lodging_reservation_fulfillment_gap
status = draft
published_at = null
archived_at = null
```

Persisted Evidence authority:

```text
Evidence rows = 2
distinct source_key = 2
distinct Incident = 2
publication_basis = external_public
```

Both durable Evidence rows were independently read back and matched their frozen Phase 15.8S / 15.8S-X excerpt and source-key fingerprints.

The target remained absent from `ar_public_problem_feed`.

---

## 2. Purpose

The database can determine whether the current draft satisfies structural publication rules.

It cannot decide whether the curator actually wants to publish it.

Phase 15.8U therefore separates:

```text
structural publishability
```

from:

```text
human publication authority
```

A passing database guard is not publication approval.

---

## 3. Read-only packet contents

The disposable one-day packet contains the material needed for a curator decision:

```text
Canonical Problem signature
current title
current summary
target user
situation
category
status

2 persisted Evidence excerpts
Evidence order
Incident key
publication basis
source type
source label
source URL
excerpt length / SHA-256
source-key SHA-256
Source→Incident lineage confirmation

structural readiness summary
blank curator decision template
protected database counts before / after
```

The packet does not expose raw internal Source Signal, Incident, or Public Problem UUIDs.

---

## 4. Structural readiness check

The runner calls the existing database authority:

```text
ar_assert_public_problem_publishable(problem_id)
```

Current publication rules require at least:

```text
2 Evidence snapshots
2 distinct source_key values
Incident identity for every Evidence snapshot
2 distinct Incidents
publishable publication_basis values
valid external Source→Incident binding
```

The function is invoked only as a validator.

Phase 15.8U does not call:

```text
ar_set_public_problem_status(...)
```

and does not perform any insert, update, upsert, or delete.

---

## 5. Curator authority template

The artifact must contain exactly a blank decision boundary:

```json
{
  "publication_decision": null,
  "decision_reason": null,
  "metadata_edits_authorized": false,
  "evidence_edits_authorized": false,
  "publication_authorized": false
}
```

Artifact authority:

```text
publication_curator_decision_packet_not_a_decision
```

The packet itself can never be interpreted as approval.

---

## 6. Database mutation contract

Expected mutation:

```text
0 database writes
0 status transitions
0 published_at mutations
0 Evidence changes
0 public-feed exposure
```

Protected domain counts must be byte-for-byte equal before and after the run.

The target must remain:

```text
status = draft
public feed rows = 0
```

---

## 7. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ one-shot agent/phase15-8u-live-execution branch
→ authoritative read-only packet run
→ one-day artifact inspection
→ independent Supabase zero-mutation readback
→ closeout removes temporary push trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

---

## 8. Downstream boundary

Only an explicit later curator decision may authorize publication.

Until then:

```text
draft → published = NOT AUTHORIZED
published_at mutation = NOT AUTHORIZED
public feed exposure = NOT AUTHORIZED
publication = NOT AUTHORIZED
```

If the curator approves the exact packet without edits, a later governed phase may execute the existing `ar_set_public_problem_status(..., 'published')` authority with pre/post verification.

If metadata or Evidence changes are requested, publication must remain blocked until those changes pass their own governed review and the publishability guard is rerun.
