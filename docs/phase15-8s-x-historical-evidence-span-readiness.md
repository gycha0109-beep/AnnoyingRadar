# Phase 15.8S-X — Historical Exact-Span Public Evidence Readiness

## Status

**IMPLEMENTED / AUTHORITATIVE LIVE NOT YET RUN**

Phase 15.8S-X is a new read-only Evidence acquisition path for the one lodging Source that remained non-ready after Phase 15.8S and 15.8S-R.

It is not another 15.8S-R retry and it does not ask a model to generate or repair an Evidence excerpt.

---

## 1. Why this phase exists

Phase 15.8S-R closed with:

```text
combined Evidence ready: 1 / 2
target Public Evidence rows: 0
target public feed rows: 0
```

The residual Source itself remained curator-accepted and Formation-eligible, but the generated candidate excerpt failed the exact contiguous substring validator:

```text
public_evidence_invalid_exact_excerpt
```

Additional automatic excerpt generation or repair was explicitly not authorized.

Phase 15.8S-X therefore changes the acquisition mechanism rather than relaxing the Evidence rule.

---

## 2. Historical exact-span authority

The authoritative Phase 15.8N Formation artifact is still available:

```text
run: 32830601494
artifact: 9556656861
digest:
sha256:5f6523737c1339e5bacad8ab99ea6f0c5ec7ed5922ef856170b1bf9fa21afd0e
```

For the exact Source later persisted as:

```text
yeogieottae_reservation_fulfillment_gap_case
```

15.8N produced an exact `evidence_quote` while the Source was machine-eligible, original, organic, and externally caused.

Phase 15.8O/P later supplied the curator authority:

```text
evidence_decision = accept
incident_action = create_new
```

The repository does not store the historical quote text. It freezes only:

```text
length = 19
SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
```

The target Source identity is likewise frozen by canonical source-key SHA-256:

```text
5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
```

---

## 3. Current source canonicalization authority

Phase 15.8S-R exposed and corrected a Naver parser boundary defect.

Current fetch authority is:

```text
source-full-context-fetch-v0.2
```

Before historical-span reconstruction, 15.8S-X fetches the exact Source twice and requires both current canonical contexts to be identical for:

```text
version
status
content_scope
truncated
content_hash
original_char_count
title
content_text
```

Required state:

```text
status = resolved
content_scope = full_post
truncated = false
stable fetches = 2 / 2
```

Any instability fails closed before a model call.

---

## 4. Deterministic span reconstruction

The current canonical full post is scanned across every contiguous 19-character window.

For each window:

```text
SHA-256(window)
```

is compared with the frozen Phase 15.8N historical quote fingerprint.

Exactly one match is required.

```text
0 matches  → fail closed
1 match    → fixed historical span reconstructed
2+ matches → fail closed as ambiguous
```

The reconstructed text remains ephemeral.

It is not committed to Git, written to Supabase, included in the one-day artifact, or printed to workflow logs.

---

## 5. Fixed-span semantic observer

Only after deterministic reconstruction does one semantic observation occur.

Observer authority:

```text
historical-evidence-fixed-span-support-v0.1
```

The model receives:

```text
Canonical Problem title
Canonical Problem summary
Source title
current canonical full post
already-fixed exact span
```

Its output schema contains exactly one field:

```text
support_level:
  direct | partial | none | unclear
```

There is no `evidence_excerpt` output field.

The model is explicitly forbidden from rewriting, replacing, shortening, extending, or proposing another span.

Exactly one semantic call is authorized in this phase.

---

## 6. Deterministic readiness mapping

```text
direct  → READY
partial → REVIEW
none    → BLOCKED
unclear → REVIEW
```

READY reason:

```text
historical_evidence_fixed_exact_span_direct
```

The direct result means only that the already-fixed exact source span directly supports the current Canonical Problem mechanism.

It does not authorize persistence or publication.

---

## 7. Canonical Problem authority

The target remains the already-persisted draft:

```text
problem_signature:
lodging_reservation_fulfillment_gap

status:
draft
```

Phase 15.8S-X requires the draft to remain active and unpublished before and after the run.

It does not edit the title, summary, signature, status, or lineage.

---

## 8. Combined Evidence simulation

The first Phase 15.8S ready authority remains frozen as:

```text
incident_key:
agoda_reservation_fulfillment_gap_case

excerpt_length: 83
excerpt_sha256:
1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa

source_key_sha256:
9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
```

If the S-X historical span is classified `direct`, the read-only combined simulation may become:

```text
ready_count = 2
all_evidence_ready = true
distinct source-key fingerprints = 2
distinct Incident keys = 2
publication-cardinality simulation = true
```

This still does not create Public Evidence rows.

---

## 9. Database and privacy boundary

Phase 15.8S-X is strictly read-only.

Expected mutation:

```text
0 database write statements
0 Public Evidence rows
0 Canonical Problem mutations
0 status transitions
0 publication mutations
```

Protected domain counts are snapshotted before and after and must be identical.

The one-day artifact may contain only aggregate/readiness authority such as:

```text
Incident key
source-key SHA-256
historical span length/SHA-256
support level
readiness state/reason
current canonical context hash/count/version
combined readiness simulation
protected DB counts
```

It must not contain:

```text
Source Signal UUID
Incident UUID
Public Problem UUID
canonical URL
fetched URL
raw text
full source body
fixed span text
Evidence excerpt text
provider request ID
```

---

## 10. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ fast-forward one-shot agent/phase15-8s-x-live-execution branch
→ authoritative live run
→ one-day artifact inspection
→ independent Supabase zero-mutation readback
→ closeout removes temporary push trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

Only if the exact historical span is reconstructed uniquely and classified `direct` may a later governed phase design deterministic two-row Public Evidence persistence.

Public Evidence persistence and publication remain **NOT AUTHORIZED** by Phase 15.8S-X.
