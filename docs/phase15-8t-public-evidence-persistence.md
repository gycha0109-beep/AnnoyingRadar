# Phase 15.8T — Atomic Public Evidence Pair Persistence

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.8T persisted exactly the two publication-grade Evidence plans established by Phase 15.8S and Phase 15.8S-X into the existing Canonical Problem draft.

It did **not** publish the Problem and did not change its status.

---

## 1. Frozen upstream authority

Target:

```text
problem_signature = lodging_reservation_fulfillment_gap
status = draft
```

Evidence #1:

```text
incident_key = agoda_reservation_fulfillment_gap_case
source-key SHA-256 = 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
excerpt length = 83
excerpt SHA-256 = 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
readiness authority = Phase 15.8S
```

Evidence #2:

```text
incident_key = yeogieottae_reservation_fulfillment_gap_case
source-key SHA-256 = 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
excerpt length = 19
excerpt SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
readiness authority = Phase 15.8S-X
```

The repository does not contain either real excerpt text.

---

## 2. Implementation authority

Implementation PR:

```text
PR #116
exact head:
bafd92a8a1437410187daedc0a3ec5f82857278f

CI #422: SUCCESS
PIE #88: SUCCESS
```

Merged implementation main:

```text
453dc0751d5cf93f7a50db223c13e6eeffad8e2b
```

Merged-main verification:

```text
CI #423: SUCCESS
```

---

## 3. Migration authority

Repository migration:

```text
037_atomic_incident_bound_public_evidence_pair.sql
```

Applied Supabase migration:

```text
20260826035456 atomic_incident_bound_public_evidence_pair
```

RPC:

```text
ar_add_incident_bound_public_problem_evidence_pair(
  p_problem_id uuid,
  p_curator_user_id uuid,
  p_evidences jsonb
)
```

Privilege verification:

```text
service_role execute:  true
anon execute:          false
authenticated execute: false
```

The function requires exactly two items, a draft target with zero pre-existing Evidence, two distinct Sources, two distinct Incidents, two distinct source keys, and order indexes 0 then 1.

Each item delegates to existing curator-authoritative:

```text
ar_add_incident_bound_public_problem_evidence(...)
```

After both inserts, the same transaction calls:

```text
ar_assert_public_problem_publishable(p_problem_id)
```

Any insert or publishability-lineage failure rolls back the complete pair. The function never calls `ar_set_public_problem_status()`.

---

## 4. Current-source reconstruction

No external model was used.

Each curator-bound Naver Source was fetched twice using:

```text
source-full-context-fetch-v0.2
```

Both Sources passed byte-identical current-context stability and unique exact-span reconstruction.

Agoda current context:

```text
content hash = d0dc24475e8daecbd4cc11d9204bcb29a3f95715e303d0c2cf5438ac16331621
chars = 1089
stable = true
exact span reconstructed uniquely = true
```

Yeogieottae current context:

```text
content hash = dce258f3c6191bcd46372f7da29f637dfaf4c110f59ac414f5ae79381409f8ec
chars = 3823
stable = true
exact span reconstructed uniquely = true
```

The exact excerpt strings were reconstructed only at runtime and sent directly to the atomic persistence RPC.

---

## 5. Authoritative live execution

Workflow:

```text
Source Public Evidence Persistence 15.8T
run: 32928264182
head: 453dc0751d5cf93f7a50db223c13e6eeffad8e2b
conclusion: SUCCESS
```

Disposable artifact:

```text
artifact id: 9592295647
name: source-public-evidence-persistence-15-8t
digest:
sha256:068375338281d4d9f8320345e78f5fb4f4f20571345e6d109151d27bbf4aa7bb
retention: 1 day
```

Result:

```text
Evidence rows created = 2
distinct Sources = 2
distinct Incidents = 2
atomic RPC calls = 1
publishability asserted inside atomic RPC = true
status transition performed = false
publication performed = false
```

---

## 6. Database transition

Authoritative workflow before:

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

After:

```text
Source Signals             3245
Source Observations        3537
Source Ingestion Runs       132
Raw Inputs                   10
Pain Evidences               27
Public Problems               3
Public Evidence               7
Public Feed                   2
Source Incidents              6
Source→Incident links         7
Full-context Outcomes        82
```

Only the authorized row-count mutation occurred:

```text
Public Evidence 5 → 7
```

Target transition:

```text
target Evidence rows 0 → 2
target status = draft
target public feed rows = 0
```

---

## 7. Independent DB verification

Independent Supabase readback reproduced:

```text
3245 / 3537 / 132 / 10 / 27 / 3 / 7 / 2 / 6 / 7 / 82
```

The two persisted target rows independently matched frozen authority:

```text
order 0
  incident = agoda_reservation_fulfillment_gap_case
  excerpt length = 83
  excerpt SHA-256 = 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
  source-key SHA-256 = 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
  publication_basis = external_public
  source_type = naver_blog
  exact Source→Incident lineage = true

order 1
  incident = yeogieottae_reservation_fulfillment_gap_case
  excerpt length = 19
  excerpt SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
  source-key SHA-256 = 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
  publication_basis = external_public
  source_type = naver_blog
  exact Source→Incident lineage = true
```

Independent invocation of:

```text
ar_assert_public_problem_publishable(target)
```

completed without exception.

Therefore the draft is structurally publishable under current database rules, but it remains unpublished.

---

## 8. Privacy boundary

The live artifact does not contain:

```text
Evidence excerpt text
Source Signal UUID
Incident UUID
Public Problem UUID
canonical/source URL
source_key literal
full source body
provider request ID
```

It retains only hashes, lengths, Incident keys, context fingerprints and aggregate readback.

The two Evidence excerpts are durable only where required by the existing Public Evidence snapshot table.

---

## 9. Workflow closeout

The temporary autonomous trigger:

```text
agent/phase15-8t-live-execution
```

is removed in closeout.

Retained trigger:

```text
workflow_dispatch
```

---

## 10. Downstream boundary

After Phase 15.8T the following are authoritative:

```text
two incident-bound external_public Evidence snapshots exist
two distinct Source keys exist
two distinct Incident IDs exist
both Source→Incident bindings are exact
database publishability guard passes
target Canonical Problem remains draft and absent from public feed
```

The following remain **NOT AUTHORIZED** by Phase 15.8T:

```text
draft → published status transition
published_at mutation
public feed exposure
publication
```

Publication requires a separate governed phase and explicit authority.
