# Phase 15.8V — Explicit Curator-Approved Publication Execution

## Status

**CLOSED — 2026-08-27**

Phase 15.8V executed the explicit curator approval received after Phase 15.8U.

Approved action:

```text
publication_decision = approve
metadata edits = none
Evidence edits = none
draft → published = authorized
```

Target:

```text
problem_signature = lodging_reservation_fulfillment_gap
```

---

## 1. Approval and upstream authority

Phase 15.8U packet:

```text
run = 33026457657
artifact = 9628577829
digest = sha256:9e01579973fb1823c79628ad18177cc08b8d9b740055c3db3b237b415b3f4ba7
Evidence = 2
distinct Sources = 2
distinct Incidents = 2
publishability guard = PASS
status = draft
public feed rows = 0
```

Explicit curator publication approval was then given on 2026-08-27 KST with no requested copy or Evidence edits.

Normalized approval:

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

## 2. Implementation authority

```text
PR #120
exact head = 473cc35b0a23c767acd304918a5ae8c659983e82
CI #430 = SUCCESS
PIE #92 = SUCCESS
```

Merged implementation main:

```text
f7e11fd9631a603821f193e274665bb92711f388
merged-main CI #431 = SUCCESS
```

No new migration was required.

The live runner used only the existing curator-gated function:

```text
ar_set_public_problem_status(problem_id, curator_user_id, 'published')
```

The existing RPC reruns `ar_assert_public_problem_publishable(...)` before the status mutation.

Function privileges were independently verified before execution:

```text
service_role = true
anon = false
authenticated = false
```

---

## 3. Exact pre-publication guards

Before the state-changing RPC, the runner required exact agreement with:

```text
problem_signature
Phase 15.8Q title / summary / target_user / situation / category
Phase 15.8T Evidence fingerprints
Phase 15.8T Incident identities
exact Source→Incident lineage
```

The target also had to remain:

```text
status = draft
published_at = null
archived_at = null
public feed rows = 0
```

No metadata or Evidence changes were authorized or performed.

---

## 4. Authoritative live publication

```text
one-shot branch = agent/phase15-8v-live-execution
authoritative main = f7e11fd9631a603821f193e274665bb92711f388
run = 33028360345
result = SUCCESS
artifact = 9629272947
digest = sha256:202675babdd6710b1843c6bcf3dd3b0736ce4fd41e646f6ac85e8e5dc4bcf0c5
authority = explicit_curator_approved_publication_execution
```

Live transition:

```text
status: draft → published
published_at: null → 2026-08-27T00:54:33.63144+00:00
target public feed: 0 → 1
status RPC calls: 1
metadata edits: 0
Evidence edits: 0
external model calls: 0
```

---

## 5. Verified database transition

Workflow before/after:

```text
Source Signals             3245 → 3245
Source Observations        3537 → 3537
Source Ingestion Runs       132 → 132
Raw Inputs                   10 → 10
Pain Evidences               27 → 27
Public Problems               3 → 3
Public Evidence               7 → 7
Public Feed                   2 → 3
Source Incidents              6 → 6
Source→Incident links         7 → 7
Full-context Outcomes        82 → 82
published Problems            2 → 3
draft Problems                1 → 0
target feed rows               0 → 1
```

Independent Supabase post-readback matched:

```text
target status = published
target published_at = 2026-08-27 00:54:33.63144+00
target archived_at = null
target Evidence = 2
target public feed = 1
published Problems = 3
draft Problems = 0
public feed = 3
```

---

## 6. Evidence integrity after publication

```text
order 0
incident = agoda_reservation_fulfillment_gap_case
excerpt length = 83
excerpt SHA-256 = 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
source-key SHA-256 = 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
publication_basis = external_public
source_type = naver_blog
exact Source→Incident lineage = true
```

```text
order 1
incident = yeogieottae_reservation_fulfillment_gap_case
excerpt length = 19
excerpt SHA-256 = 78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b
source-key SHA-256 = 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
publication_basis = external_public
source_type = naver_blog
exact Source→Incident lineage = true
```

No Evidence or Source lineage mutation accompanied publication.

---

## 7. Closeout authority

Closeout PR:

```text
PR #121
initial closeout validation:
CI #432 = SUCCESS
PIE #93 = SUCCESS
```

The temporary `agent/phase15-8v-live-execution` push trigger was removed. The publication workflow is now `workflow_dispatch` only.

The final closeout commit is required to pass exact-head CI / PIE before merge, followed by merged-main CI. Those immutable run and merge identifiers are recorded on PR #121 and the completion report rather than recursively embedded into the commit they validate.

Phase 15.8V has no remaining authorized mutation.
