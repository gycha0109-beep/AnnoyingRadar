# Phase 15.8S-X — Historical Exact-Span Public Evidence Readiness

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.8S-X established the second publication-grade Evidence readiness authority for the lodging reservation-fulfillment Canonical Problem without generating a new excerpt and without writing to the database.

---

## 1. Upstream boundary

Phase 15.8S-R closed with:

```text
combined Evidence ready: 1 / 2
target Public Evidence rows: 0
target public feed rows: 0
```

The residual Source was curator-accepted and Formation-eligible, but its generated candidate excerpt failed the exact contiguous substring validator:

```text
public_evidence_invalid_exact_excerpt
```

15.8S-X did not retry or repair that generated excerpt. It used a separate historical exact-span acquisition authority.

---

## 2. Historical exact-span authority

Authoritative Phase 15.8N Formation artifact:

```text
run: 32830601494
artifact: 9556656861
digest:
sha256:5f6523737c1339e5bacad8ab99ea6f0c5ec7ed5922ef856170b1bf9fa21afd0e
```

For the Source later persisted as:

```text
yeogieottae_reservation_fulfillment_gap_case
```

15.8N produced an exact `evidence_quote`. Phase 15.8O/P later supplied curator acceptance for that same Source and persisted its independent Incident identity.

The repository freezes the historical quote only by:

```text
length = 19
SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
```

The quote text itself is not committed.

Target Source identity:

```text
source-key SHA-256 =
5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
```

---

## 3. Implementation authority

Implementation PR:

```text
PR #114
exact head:
b137c24c6b786c5ef1171a55632f21d48ff1f423

CI #418:  SUCCESS
PIE #86: SUCCESS
```

Merged implementation main:

```text
82dbacb473872f9ee4de12fb3e641fe7f7535132
```

Merged-main verification:

```text
CI #419: SUCCESS
```

No migration was added.

---

## 4. Deterministic current-source reconstruction

Current fetch authority:

```text
source-full-context-fetch-v0.2
```

The authoritative live run fetched the exact Source twice and both canonical contexts were identical:

```text
status = resolved
content_scope = full_post
truncated = false
stable fetches = 2 / 2

content_hash =
dce258f3c6191bcd46372f7da29f637dfaf4c110f59ac414f5ae79381409f8ec

original_char_count = 3823
```

The runner then scanned every contiguous 19-character window and compared SHA-256 values against the historical Formation quote fingerprint.

Result:

```text
historical span reconstructed uniquely = true
match count = 1
```

The reconstructed span text remained ephemeral.

---

## 5. Fixed-span semantic authority

Observer:

```text
historical-evidence-fixed-span-support-v0.1
```

The model did not generate an excerpt. Its schema contained only:

```text
support_level:
  direct | partial | none | unclear
```

Exactly one semantic attempt was executed.

Authoritative result:

```text
support_level = direct
evidence_state = ready
reason = historical_evidence_fixed_exact_span_direct
```

Therefore the exact historical 19-character span is now a publication-grade read-only Evidence readiness authority for:

```text
yeogieottae_reservation_fulfillment_gap_case
```

---

## 6. Authoritative live execution

Workflow:

```text
Source Historical Evidence Span Readiness 15.8S-X
run: 32927314229
head: 82dbacb473872f9ee4de12fb3e641fe7f7535132
conclusion: SUCCESS
```

Disposable artifact:

```text
artifact id: 9591981001
name: source-historical-evidence-span-readiness-15-8s-x
digest:
sha256:c634db237331777b058faa1a6e274f90ca2fcba774e13d5c4a6a327bc750e562
retention: 1 day
```

Artifact authority:

```text
historical_exact_span_public_evidence_readiness_read_only
```

The artifact does not contain the historical span text or full source body.

---

## 7. Combined Evidence readiness

The earlier Phase 15.8S ready authority remains:

```text
incident_key:
agoda_reservation_fulfillment_gap_case

excerpt_length: 83
excerpt_sha256:
1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa

source_key_sha256:
9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
```

Combined authoritative readiness after 15.8S-X:

```text
total required = 2
ready count = 2
all Evidence ready = true
distinct source-key fingerprints = 2
distinct Incident keys = 2
publication-cardinality simulation = true
```

This establishes sufficient read-only Evidence plans for a later deterministic persistence phase.

It does not itself create Evidence rows.

---

## 8. Zero-mutation verification

Workflow pre/post protected counts were identical:

```text
Source Signals             3245
Source Observations        3537
Source Ingestion Runs       132
Raw Inputs                   10
Pain Evidences               27
Public Problems               3
Public Evidence               5
Public Feed                   2
Source Incidents              6
Source→Incident links         7
Full-context Outcomes        82
```

Independent Supabase readback reproduced the same counts and additionally verified:

```text
target active draft rows = 1
target Evidence rows     = 0
target public feed rows  = 0
```

Therefore:

```text
database writes = 0
Public Evidence writes = 0
Canonical Problem mutations = 0
status transitions = 0
publication mutations = 0
```

---

## 9. Privacy boundary

The repository and artifact do not persist:

```text
historical exact span text
full source body
canonical URL
fetched URL
raw Source Signal UUID
Incident UUID
Public Problem UUID
provider request ID
```

Persisted authority is limited to hashes, lengths, Incident key, support state, current canonical context fingerprint, and aggregate DB counts.

---

## 10. Workflow closeout

The temporary autonomous trigger:

```text
agent/phase15-8s-x-live-execution
```

is removed in closeout.

Retained trigger:

```text
workflow_dispatch
```

---

## 11. Downstream boundary

After 15.8S-X the following are authoritative:

```text
two distinct curator-governed Incidents exist
both have distinct Source identities
both now have exact publication-grade Evidence readiness authority
combined Evidence cardinality = 2 / 2
```

The following remain **NOT AUTHORIZED** until a later governed phase explicitly grants them:

```text
Public Evidence row persistence
Canonical Problem status transition
publication
public feed mutation
```

The next governed phase may design an atomic deterministic persistence of exactly the two approved Evidence snapshots from the frozen hash/length authorities.
