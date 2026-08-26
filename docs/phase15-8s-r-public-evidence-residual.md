# Phase 15.8S-R — Residual Public Evidence Completion

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.8S-R was a bounded read-only recovery for the single Phase 15.8S Evidence item that ended in `public_evidence_provider_incomplete` after two semantic attempts.

The phase is complete at the live-result level. The residual item did **not** become publication-grade Public Evidence.

Final combined readiness remains:

```text
required Evidence plans: 2
ready:                   1
residual review:         1
all_evidence_ready:      false
```

Public Evidence persistence and publication remain **NOT AUTHORIZED**.

---

## 1. Upstream authority

Phase 15.8S closed with:

```text
total:   2
ready:   1
review:  1
blocked: 0
```

Existing ready authority:

```text
incident_key: agoda_reservation_fulfillment_gap_case
excerpt_length: 83
excerpt_sha256: 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
source_key_sha256: 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
```

Residual authority entering 15.8S-R:

```text
incident_key: yeogieottae_reservation_fulfillment_gap_case
reason: public_evidence_provider_incomplete
prior semantic attempts: 2
historical fetch version: source-full-context-fetch-v0.1
historical context hash: 8c9db5684507752f2e9d77af3de5968ff25622a4ad6c923630acac5af8ad640f
source_key_sha256: 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
```

---

## 2. Initial v0.1 live attempts failed closed

Original S-R implementation:

```text
PR #111
exact head: 591aa35f8983d67766caf80797d50fa7bc9d8497
CI #412: SUCCESS
PIE #83: SUCCESS
merged main: 1a7b3f9aa6ebfc7ba719c8152f191d47186f2f7e
merged-main CI #413: SUCCESS
```

Workflow run:

```text
32922302987
```

The first attempt failed before any semantic call because the fetched v0.1 hash was:

```text
f5333967da13305042d3be63f01599be12bce0baefc3e73dbe55ce2a8b4ded94
```

A controlled re-run of the same exact main failed at the same guard with:

```text
89b50a4a6b5e951cbf6bb985e8c7b672d90ba27dc53950816bf2bd5f9226f52f
```

Artifacts:

```text
first attempt artifact: 9590239195
first digest: sha256:2fe6e2b0f47a0a5311b25adf1df467ab018a9af05360720ae3dc940d3d9ac948

re-run artifact: 9591050209
re-run digest: sha256:faa7ad1a75596a6bc75c602e097532fec0ebc0e6344c45bdad9a4e031ecc9534
```

Both attempts had:

```text
paid semantic calls: 0
Public Evidence writes: 0
Problem mutations: 0
status transitions: 0
publication mutations: 0
```

---

## 3. Parser-boundary diagnosis

Disposable read-only diagnostic:

```text
run: 32924871316
artifact: 9591131170
digest: sha256:6ded4e98a92c66a2914af0410784d8ebefd9a8162991303010cc7ceeff35e9f6
```

Four independent fetches had:

```text
char_count: 4170
line_count: 209
identical title hash
unique content hashes: 3
```

The first 4,075 characters were identical. Only roughly 80 trailing characters changed, consisting of Naver platform metadata whose JSON key ordering varied between requests.

Observed varying keys included:

```text
smartEditorVersion
blogDisplay
meDisplay
outsideDisplay
lineDisplay
cafeDisplay
```

Conclusion:

```text
source-author content drift: not demonstrated
source-full-context-fetch-v0.1 parser overflow: demonstrated
```

The v0.1 parser located the opening `se-main-container` but did not stop at its matching closing tag.

---

## 4. Canonicalization correction

Correction PR:

```text
PR #112
exact head: 5071a625db95e3c542d5815e3463b614351a6826
CI #414: SUCCESS
PIE #84: SUCCESS
merged main: 264e3d1cd44a209cf087952dff5f1e8857acdd6c
merged-main CI #415: SUCCESS
```

`source-full-context-fetch-v0.2` now extracts the selected Naver post body to its matching closing element using balanced nesting.

Post-container platform metadata is excluded from canonical `content_text` and therefore from the canonical hash.

Regression tests freeze that identical post bodies with different trailing metadata key order produce identical text and hash.

The Evidence semantics were not relaxed.

---

## 5. v0.2 residual authority

Phase authority version:

```text
phase15.8s-r-evidence-residual-v0.2
```

Before the paid semantic call the runner requires exactly two independent current canonical context fetches and exact equality for:

```text
fetch authority version
status = resolved
content_scope = full_post
truncated = false
content hash
original character count
title
canonical content_text
```

The historical v0.1 hash remains provenance only and is not compared to the corrected v0.2 hash.

The residual observer otherwise preserves the original 15.8S contract.

The only semantic-request change is:

```text
max_output_tokens: 800 -> 4000
```

Exactly one new semantic attempt is authorized.

---

## 6. Authoritative v0.2 live result

Workflow:

```text
Source Public Evidence Residual 15.8S-R
```

Authoritative run:

```text
run: 32925560405
head: 264e3d1cd44a209cf087952dff5f1e8857acdd6c
result: SUCCESS
```

Artifact:

```text
id: 9591376560
digest: sha256:edfc3e0fb39fad937e926cda027cc90ef2e31326d2ad8e70aafe0ce653e47ed9
```

Canonical context:

```text
fetch version: source-full-context-fetch-v0.2
stability fetches: 2
stable_context: true
canonical_context_hash: dce258f3c6191bcd46372f7da29f637dfaf4c110f59ac414f5ae79381409f8ec
canonical_context_char_count: 3823
content_scope: full_post
truncated: false
```

Residual semantic result:

```text
evidence_state: review
ready: false
reason: public_evidence_invalid_exact_excerpt
support_level: null
excerpt_length: 0
excerpt_sha256: null
```

The provider-incomplete condition was therefore no longer the terminal failure. The semantic response completed, but the candidate excerpt failed the deterministic exact-contiguous-substring validator.

The phase does not authorize another semantic retry or excerpt repair.

---

## 7. Final combined readiness

```text
total_required: 2
ready_count: 1
all_evidence_ready: false
distinct_source_key_fingerprints: 2
distinct_incident_keys: 2
residual_ready: false
would_meet_current_publication_cardinality_if_exact_plans_were_persisted: false
```

The second Incident/Source identity is independent, but it does not have an authorized publication-grade exact Evidence excerpt.

Therefore the existing one ready Evidence plan cannot be persisted as a partial publication set for this draft under the current governed flow.

---

## 8. Database zero-mutation proof

Artifact before/after counts were identical:

```text
source_signals: 3245
source_observations: 3537
source_ingestion_runs: 132
raw_inputs: 10
pain_evidences: 27
public_problems: 3
public_evidence: 5
public_feed: 2
source_incidents: 6
source_incident_links: 7
full_context_outcomes: 82
```

Independent Supabase post-readback matched:

```text
target active draft: 1
target Evidence: 0
target public feed: 0
```

Downstream mutations:

```text
database write statements: 0
Public Evidence rows written: 0
existing Problem mutations: 0
status transitions: 0
publication mutations: 0
full source bodies persisted: 0
exact excerpt persisted in artifact: false
```

---

## 9. Final authority boundary

Phase 15.8S-R establishes:

```text
one publication-grade Evidence plan: YES
second publication-grade Evidence plan: NO
combined Evidence readiness 2/2: NO
```

It does not authorize:

```text
Public Evidence INSERT
partial one-row Evidence persistence for the target draft
Canonical Problem edits
status transition
publication
additional automatic semantic retry for this residual item
model-generated excerpt repair
```

The next governed step must obtain a second publication-grade Evidence authority through a separate source/evidence path or explicitly redesign the Evidence acquisition authority. It must not treat the rejected model excerpt as Evidence.

---

## 10. Closeout condition

Closeout requires:

```text
remove temporary agent/phase15-8s-r-live-execution push trigger
retain workflow_dispatch only
closeout exact-head CI / PIE SUCCESS
merge closeout changeset
merged-main CI SUCCESS
```

After those conditions are satisfied:

```text
Phase 15.8S-R = CLOSED
Public Evidence persistence = NOT AUTHORIZED
Publication = NOT AUTHORIZED
```
