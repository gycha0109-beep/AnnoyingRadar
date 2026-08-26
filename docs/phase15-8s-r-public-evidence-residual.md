# Phase 15.8S-R — Residual Public Evidence Completion

## Status

**IMPLEMENTED / LIVE READ-ONLY VERIFICATION NOT YET RUN**

Phase 15.8S-R is a bounded residual recovery for the single Phase 15.8S Evidence item that ended in `public_evidence_provider_incomplete` after two attempts.

It is not a generic retry product and does not reopen the already-ready Evidence item.

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
prior attempts: 2
context_scope: full_post
context_truncated: false
context_hash: 8c9db5684507752f2e9d77af3de5968ff25622a4ad6c923630acac5af8ad640f
source_key_sha256: 5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c
```

The residual item was not judged unsupported. The provider failed to complete the semantic observation.

---

## 2. Recovery strategy

The original 15.8S observer request used:

```text
max_output_tokens = 800
```

15.8S-R reuses the exact same observer, prompt, JSON schema, exact-substring validator, model selection, and source context.

The only request-shape change is:

```text
max_output_tokens = 4000
```

The wrapper asserts that the request entering the residual boundary still has the original 800-token value before applying the bounded override.

No prompt relaxation, alternate Evidence rule, alternate source, or generic retry loop is introduced.

---

## 3. Exact residual identity

15.8S-R resolves only:

```text
yeogieottae_reservation_fulfillment_gap_case
```

Before the paid semantic call it must verify:

```text
source platform = naver_blog
current source_key SHA-256 = authoritative 15.8S source-key hash
full context = resolved
content_scope = full_post
truncated = false
current content hash = authoritative 15.8S context hash
```

Any drift fails closed before the model call.

---

## 4. Attempt budget

This phase permits exactly one new semantic attempt.

```text
Phase 15.8S attempts:   2
Phase 15.8S-R attempts: 1
maximum total:          3
```

`maxSemanticAttempts` inside the residual runner is `1`.

If the provider remains incomplete, the item remains unresolved and no further automatic recovery is authorized.

---

## 5. Readiness contract

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

## 6. Artifact/privacy boundary

Unlike the 15.8S disposable artifact, 15.8S-R does not persist even the candidate excerpt text in its artifact.

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
context hash/count/scope/truncation
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

## 7. Combined readiness

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

## 8. Database boundary

15.8S-R is read-only.

Expected mutation:

```text
0 database write statements
0 Public Evidence rows
0 Problem mutations
0 status transitions
0 publication mutations
```

The runner snapshots all protected counts before/after and requires exact equality. Target Evidence must remain zero and the target draft must remain absent from the public feed.

---

## 9. Release flow

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ one-shot residual live run
→ artifact + independent DB verification
→ remove temporary live trigger
→ closeout PR / CI / PIE
→ merge
→ merged-main CI
```

Only if the residual item becomes exact-ready may a later Phase 15.8T design deterministic Evidence persistence from the two hash/length authorities.

Public Evidence persistence and publication remain NOT AUTHORIZED in 15.8S-R.
