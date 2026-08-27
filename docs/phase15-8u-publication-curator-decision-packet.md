# Phase 15.8U — Publication Curator Decision Packet

## Status

**CLOSED — 2026-08-27**

Phase 15.8U completed the read-only human/curator gate between persisted Public Evidence and any later publication transition.

The phase did **not** publish the Canonical Problem.

---

## 1. Upstream authority

Phase 15.8T closed with:

```text
problem_signature = lodging_reservation_fulfillment_gap
status = draft
Evidence rows = 2
distinct source_key = 2
distinct Incident = 2
target public feed rows = 0
```

Persisted Evidence fingerprints remained:

```text
order 0 / Agoda
excerpt length = 83
excerpt SHA-256 = 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
source-key SHA-256 = 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99

order 1 / Yeogieottae
excerpt length = 19
excerpt SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
source-key SHA-256 = 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
```

---

## 2. Implementation authority

Implementation PR:

```text
PR #118
exact head = b78c7e4239758d62f7dceb4146c5e9aca6cf0976
CI #426 = SUCCESS
PIE #90 = SUCCESS
```

Merged implementation main:

```text
6896320bd168c0ba493ee2175a3a0b3d98802b54
```

Merged-main verification:

```text
CI #427 = SUCCESS
```

---

## 3. Authoritative live run

One-shot branch:

```text
agent/phase15-8u-live-execution
```

Authoritative run:

```text
run = 33026457657
head = 6896320bd168c0ba493ee2175a3a0b3d98802b54
conclusion = SUCCESS
```

Artifact:

```text
id = 9628577829
name = source-publication-curator-packet-15-8u
retention = 1 day
digest = sha256:9e01579973fb1823c79628ad18177cc08b8d9b740055c3db3b237b415b3f4ba7
```

Artifact authority:

```text
publication_curator_decision_packet_not_a_decision
```

---

## 4. Packet result

Canonical Problem shown to the curator packet:

```text
title = 숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다
status = draft
category = travel_booking
```

Structural readiness:

```text
Evidence = 2
distinct Sources = 2
distinct Incidents = 2
exact Source→Incident lineage = true
publication_basis = external_public
ar_assert_public_problem_publishable = PASS
public feed exposure = 0
```

Curator decision template remained exactly blank:

```json
{
  "publication_decision": null,
  "decision_reason": null,
  "metadata_edits_authorized": false,
  "evidence_edits_authorized": false,
  "publication_authorized": false
}
```

A structurally publishable result is therefore recorded without converting it into human publication authority.

---

## 5. Zero-mutation proof

Workflow before/after counts were identical:

```text
Source Signals = 3245
Source Observations = 3537
Source Ingestion Runs = 132
Raw Inputs = 10
Pain Evidences = 27
Public Problems = 3
Public Evidence = 7
Public Feed = 2
Source Incidents = 6
Source→Incident Links = 7
Full-context Outcomes = 82
```

Independent Supabase readback after the live run matched the same counts and confirmed:

```text
target Evidence = 2
target status = draft
target public feed = 0
```

Phase 15.8U performed:

```text
0 database writes
0 status transitions
0 Evidence mutations
0 published_at mutations
0 public-feed exposure
```

---

## 6. Closeout state

The temporary push trigger used for the authoritative run has been removed.

The workflow is retained as:

```text
workflow_dispatch only
```

This prevents branch creation or pushes from silently recreating curator packets.

---

## 7. Downstream authority boundary

Phase 15.8U proves only:

```text
current persisted lineage is structurally publishable
current public copy and Evidence are available for curator review
```

It does not prove or authorize:

```text
publication_decision = approve
draft → published
published_at mutation
public feed exposure
publication
```

Those remain **NOT AUTHORIZED** until an explicit curator publication decision is supplied.

If the exact packet is later explicitly approved without edits, the next governed phase may persist that approval authority and execute the existing `ar_set_public_problem_status(..., 'published')` transition with exact preflight/post-readback verification.
