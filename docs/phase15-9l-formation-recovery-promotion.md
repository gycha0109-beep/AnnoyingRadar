# Phase 15.9L — Formation Provider Recovery Promotion

## Status

**CLOSED**

Phase 15.9L promoted the provider-incomplete recovery mechanics proven in Phase 15.9K into the reusable Problem Formation observer and verified the promoted path against the exact frozen ordinal 9/16 contexts.

It did not change Formation semantic policy, Incident identity, Problem identity, Public Evidence, publication, ranking, or Source Admission.

---

## 1. Implementation authority

Implementation PR:

```text
PR #145
exact head:
4b5e6ce5067bdd2612e76ae84bff57df25f88de8

CI #489: SUCCESS
PIE #128: SUCCESS
```

Expected-head merge produced:

```text
implementation main:
a20d2d0abc5eec31966d3e1f35c87e9b666cf91b

merged-main CI #490: SUCCESS
```

No migration was added.

---

## 2. Promoted observer authority

Reusable observer:

```text
source-problem-formation-observer-v0.2
```

Semantic prompt remains:

```text
source-problem-formation-semantic-v0.1
```

Recovery mechanics:

```text
source-problem-formation-provider-recovery-v0.1
```

The semantic schema and deterministic `resolveProblemFormationSemantic()` authority are unchanged.

---

## 3. Recovery contract

Base attempt:

```text
attempt = 1
max_output_tokens = 1200
recovery instruction = absent
```

Exactly one recovery attempt is allowed only when:

```text
error.code = source_formation_provider_incomplete
error.retryable = true
```

Recovery attempt:

```text
attempt = 2
max_output_tokens = 2400
same model
same source title/body/platform
same strict JSON schema
same semantic authority instructions
+ concise recovery instruction
```

The observer hard-caps total semantic attempts at 2.

The recovery policy does not extend to timeout, network, provider rejection, invalid JSON, missing output, or invalid evidence quote errors.

---

## 4. Upstream evidence for promotion

Historical Phase 15.8N observed:

```text
8 durable Candidates
provider-incomplete retry attempted = 3
recovered = 2
exhausted = 1
```

Those retries reused the same 1200-token Formation budget.

Phase 15.9K then directly observed ordinal 9 fail with:

```text
provider status = incomplete
incomplete_details.reason = max_output_tokens
```

and recover under a bounded 2400-token retry.

This established that provider-incomplete was not merely an abstract transient condition; at least one real Formation attempt was blocked by the output ceiling.

---

## 5. Authoritative live verification

Workflow:

```text
Source Formation Recovery Promotion 15.9L
run #1
Actions run id:
33049313973

execution SHA:
a20d2d0abc5eec31966d3e1f35c87e9b666cf91b

conclusion: SUCCESS
```

Artifact:

```text
artifact id:
9636946230

name:
source-formation-recovery-promotion-15-9l

digest:
sha256:95268f584029671988a75b23e7c6a869b9b78dfc4471b685d06f9e234b1279bb
```

Artifact authority:

```text
read_only_shadow_verification_of_promoted_formation_provider_recovery_policy
```

---

## 6. Live aggregate result

```text
targets = 2
context integrity passed = 2
context drift = 0

resolved = 2
unresolved = 0

provider recovery attempted = 2
provider recovery recovered = 2
provider recovery exhausted = 0

incomplete reason:
max_output_tokens = 2

eligible = 0
provenance_review = 0
review = 0
reject = 2
```

Execution budget:

```text
source network requests = 4 / max 16
model calls = 4 / max 4
database writes = 0
```

Conclusion:

```text
production_formation_recovery_policy_shadow_verified
```

---

## 7. Ordinal 9

Frozen upstream stratum:

```text
title_truncated_no_complaint_signal
```

Production observer request sequence:

```text
attempt 1
  max_output_tokens = 1200
  recovery instruction = false
  semantic authority instruction = true
  HTTP = 200
  provider status = incomplete
  incomplete reason = max_output_tokens

attempt 2
  max_output_tokens = 2400
  recovery instruction = true
  semantic authority instruction = true
  HTTP = 200
  provider status = completed
```

Recovery metadata:

```text
attempted = true
recovered = true
attempt_count = 2
trigger = source_formation_provider_incomplete
```

Final deterministic Formation result:

```text
reject
reason = formation_incidental_friction
```

Observed semantic facts included:

```text
problem_claim = yes
experience_actor = self
friction_specificity = concrete
pain_centrality = incidental
content_kind = organic
source_origin = original
friction_responsibility = external_process_or_policy
```

The evidence quote was exact-grounded, but only its SHA-256 and character count were retained in the disposable artifact.

---

## 8. Ordinal 16

Frozen upstream stratum:

```text
title_information_or_guide
```

Production observer request sequence:

```text
attempt 1
  max_output_tokens = 1200
  recovery instruction = false
  semantic authority instruction = true
  HTTP = 200
  provider status = incomplete
  incomplete reason = max_output_tokens
  output tokens = 1200
  reasoning tokens = 1024

attempt 2
  max_output_tokens = 2400
  recovery instruction = true
  semantic authority instruction = true
  HTTP = 200
  provider status = completed
```

Recovery metadata:

```text
attempted = true
recovered = true
attempt_count = 2
trigger = source_formation_provider_incomplete
```

Final deterministic Formation result:

```text
reject
reason = formation_non_evidence_content
```

Observed semantic facts included:

```text
problem_claim = yes
experience_actor = self
friction_specificity = concrete
pain_centrality = central
content_kind = informational
source_origin = original
friction_responsibility = mixed
```

This also resolves the 15.9K variability in which ordinal 16 had once completed at 1200 and remained Review. Under the authoritative 15.9L live run, the first 1200 request was incomplete and the promoted 2400 recovery completed to deterministic Reject.

This does not rewrite historical 15.9K output; it records a later independent Formation observation.

---

## 9. Database read-only verification

Artifact before/after counts were identical:

```text
ar_source_signals                         3562
ar_source_signal_observations             3892
ar_source_ingestion_runs                   144
ar_raw_inputs                               10
ar_pain_evidences                           27
ar_public_problems                           3
ar_public_problem_evidence_snapshots         7
ar_public_problem_feed                       3
ar_source_incidents                          6
ar_source_incident_links                     7
ar_source_full_context_resolution_outcomes  85
```

Independent post-live Supabase readback reproduced the same counts exactly.

Therefore:

```text
DB mutations = 0
full-context outcomes remain 85
Incident rows remain 6
Incident links remain 7
Public Problems remain 3
Public Evidence remains 7
```

---

## 10. Blind and context-integrity boundary

Before canonical URL/body reads:

```text
Blind overlap = 0
```

Both targets passed double-fetch integrity against the frozen Phase 15.9H/I context authority:

```text
context integrity passed = 2 / 2
context drift = 0
```

No target with context drift would have received a model call.

---

## 11. Artifact privacy

The disposable artifact excludes:

```text
Source Signal ID
canonical URL
fetched URL
raw/full source body
author handle
provider request ID
raw evidence quote
```

It retains only privacy-safe provider diagnostics and hashed/length evidence-grounding metadata.

---

## 12. Authority explicitly not granted

Phase 15.9L does not authorize:

```text
new Source Admission decisions
Incident identity or persistence
Source→Incident links
problem_signature assignment
repeated-problem clustering
Public Evidence creation
Canonical Problem creation
publication
ordinal 4 current-context replacement
```

A recovered semantic observation still passes through the unchanged deterministic Formation resolver and all existing downstream curator-governed boundaries.

---

## 13. Closeout state

The temporary push trigger was removed. The Phase 15.9L workflow is now manual `workflow_dispatch` only and always checks out authoritative `main`.

Phase 15.9L is CLOSED after closeout PR exact-head CI/PIE and merged-main CI succeed.
