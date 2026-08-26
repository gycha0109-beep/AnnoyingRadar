# Phase 15.8S-R — Residual Public Evidence Completion

## Status

**V0.2 CANONICALIZATION CORRECTION IMPLEMENTED / AUTHORITATIVE LIVE RE-RUN NOT YET RUN**

Phase 15.8S-R is a bounded residual recovery for the single Phase 15.8S Evidence item that ended in `public_evidence_provider_incomplete` after two semantic attempts.

It is not a generic retry product and does not reopen the already-ready Evidence item.

The first v0.1 residual live attempts failed closed before any semantic call because the Naver full-context parser included nondeterministic platform metadata after the actual post container. That parser boundary defect is corrected before the residual observer is allowed to run again.

---

## 1. Upstream authority

Phase 15.8S closed with:

```text
total:   2
ready:   1
review:  1
blocked: 0
```

Ready authority:

```text
incident_key:  agoda_reservation_fulfillment_gap_case
excerpt_length: 83
excerpt_sha256: 1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa
source_key_sha256: 9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99
```

Residual authority:

```text
incident_key: yeogieottae_reservation_fulfillment_gap_case
reason: public_evidence_provider_incomplete
prior semantic attempts: 2
context_scope: full_post
context_truncated: false
historical v0.1 context_hash: 8c9db5684507752f2e9d77af3de5968ff25622a4ad6c923630acac5af8ad640f
source_key_sha256: 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
```

The residual item was not judged unsupported. The provider failed to complete the semantic observation.

The historical v0.1 context hash remains provenance only. It is not a valid equality gate for the corrected v0.2 parser because v0.1 included text outside the actual Naver post container.

---

## 2. First v0.1 live attempts — fail closed

Implementation authority before the correction:

```text
PR #111
exact head: 591aa35f8983d67766caf80797d50fa7bc9d8497
CI #412: SUCCESS
PIE #83: SUCCESS
merged main: 1a7b3f9aa6ebfc7ba719c8152f191d47186f2f7e
merged-main CI #413: SUCCESS
```

Authoritative residual workflow run:

```text
run: 32922302987
```

First attempt failed before the OpenAI call because the fetched v0.1 hash was:

```text
f5333967da13305042d3be63f01599be12bce0baefc3e73dbe55ce2a8b4ded94
```

instead of the historical 15.8S v0.1 hash.

A controlled re-run of the same exact main failed at the same guard with another hash:

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

Both attempts:

```text
paid semantic calls: 0
Public Evidence writes: 0
Problem mutations: 0
status transitions: 0
publication mutations: 0
```

The guard therefore prevented the parser instability from being silently treated as source drift or Evidence authority.

---

## 3. Context-stability diagnosis

A disposable read-only diagnostic fetched the exact same Naver Source four times without an OpenAI secret.

```text
workflow run: 32924871316
artifact: 9591131170
digest: sha256:6ded4e98a92c66a2914af0410784d8ebefd9a8162991303010cc7ceeff35e9f6
```

All four fetches had:

```text
char_count: 4170
line_count: 209
identical title hash
```

but produced three distinct content hashes.

The first 4,075 characters were identical. The changing region was only about 80 characters near the tail and consisted of the same Naver platform metadata keys in different JSON ordering, including:

```text
smartEditorVersion
blogDisplay
meDisplay
outsideDisplay
lineDisplay
cafeDisplay
```

Therefore:

```text
source-author content drift: not demonstrated
parser boundary defect: demonstrated
```

`source-full-context-fetch-v0.1` located the opening `se-main-container` but did not stop at its matching closing tag, allowing post-container platform metadata to enter `content_text` and therefore the content hash.

---

## 4. Full-context canonicalization v0.2

`source-full-context-fetch-v0.2` changes the Naver parser boundary, not the Evidence semantics.

For the selected post body container it now:

1. locates the selected opening element;
2. tracks nested elements of the same tag name;
3. ignores comments and script/style bodies during depth scanning;
4. stops exactly at the matching closing element;
5. excludes Naver metadata after that closing element;
6. retains the previous footer-marker behavior only as a malformed-HTML fallback.

Regression tests freeze that two HTML responses with identical visible post content but different trailing metadata key order produce:

```text
identical content_text
identical content_hash
```

This is a source-context authority correction. It does not change Source Admission, Incident, Canonical Problem, Evidence, or publication authority.

---

## 5. Residual recovery strategy v0.2

The original 15.8S observer request used:

```text
max_output_tokens = 800
```

15.8S-R still reuses the exact same observer, prompt, JSON schema, exact-substring validator, model selection, and Source identity.

The only semantic-request shape change remains:

```text
max_output_tokens = 4000
```

The wrapper asserts that the request entering the residual boundary still has the original 800-token value before applying the bounded override.

No prompt relaxation, alternate Evidence rule, alternate source, or generic retry loop is introduced.

---

## 6. Current canonical stability gate

15.8S-R resolves only:

```text
yeogieottae_reservation_fulfillment_gap_case
```

Before the paid semantic call it must verify:

```text
source platform = naver_blog
current source_key SHA-256 = authoritative 15.8S source-key hash

canonical fetch #1:
  version = source-full-context-fetch-v0.2
  status = resolved
  content_scope = full_post
  truncated = false

canonical fetch #2:
  version = source-full-context-fetch-v0.2
  status = resolved
  content_scope = full_post
  truncated = false

fetch #1 == fetch #2 for:
  content hash
  original character count
  title
  exact canonical content_text
```

Any current instability fails closed before the model call.

The historical v0.1 hash is recorded in the artifact as provenance but is not compared to the corrected v0.2 hash.

---

## 7. Attempt budget

This phase permits exactly one new semantic attempt after the v0.2 stability gate passes.

```text
Phase 15.8S semantic attempts:   2
failed v0.1 S-R semantic calls:  0
Phase 15.8S-R v0.2 attempts:     1 maximum
maximum semantic total:          3
```

`maxSemanticAttempts` inside the residual runner remains `1`.

If the provider remains incomplete, or if the result is partial/unclear/none, no further automatic recovery is authorized by this phase.

---

## 8. Readiness contract

The exact 15.8S contract remains unchanged:

```text
support_level = direct
+ exact contiguous source excerpt
+ excerpt length <= 600
→ ready
```

Partial/unclear/none remain review or blocked under the existing deterministic gate.

The residual phase cannot reinterpret a non-direct result as ready.

---

## 9. Artifact/privacy boundary

15.8S-R does not persist the candidate excerpt text in its artifact.

It may persist only:

```text
incident key
readiness state
reason codes
support level
excerpt length
excerpt SHA-256
source-key SHA-256
source observed time
historical v0.1 context hash
current v0.2 canonical context hash/count/version
context stability fetch count
completion budget metadata
combined readiness aggregates
```

It must not persist:

```text
Source Signal UUID
Incident UUID
Public Problem UUID
canonical URL
fetched URL
raw text
full source body
provider request ID
exact excerpt text
```

---

## 10. Combined readiness

The Phase 15.8S ready item is carried forward by hash/length authority only.

If the residual item becomes ready, the combined state may become:

```text
ready_count = 2
all_evidence_ready = true
distinct source-key fingerprints = 2
distinct Incident keys = 2
would_meet_current_publication_cardinality_if_exact_plans_were_persisted = true
```

This remains a simulation. It is not Evidence persistence or publication authority.

---

## 11. Database boundary

15.8S-R remains read-only.

Expected mutation:

```text
0 database write statements
0 Public Evidence rows
0 Problem mutations
0 status transitions
0 publication mutations
```

The runner snapshots all protected counts before/after and requires exact equality. Target Evidence must remain zero and the target draft must remain absent from the public feed.

The independent Supabase readback after the failed v0.1 live attempts remained:

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
target active draft: 1
target Evidence: 0
target public feed: 0
```

---

## 12. Corrected release flow

```text
v0.2 canonicalization correction PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ fast-forward the existing one-shot residual live trigger branch
→ authoritative v0.2 residual live run
→ artifact + independent DB verification
→ remove temporary live trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

Only if the residual item becomes exact-ready may a later Phase 15.8T design deterministic Evidence persistence from the two hash/length authorities.

Public Evidence persistence and publication remain NOT AUTHORIZED in 15.8S-R.
