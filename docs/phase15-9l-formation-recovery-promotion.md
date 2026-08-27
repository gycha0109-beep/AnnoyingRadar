# Phase 15.9L — Formation Provider Recovery Promotion

## Status

**IMPLEMENTATION READY / LIVE NOT YET RUN**

Phase 15.9L promotes the provider-incomplete recovery mechanics proven in Phase 15.9K into the reusable Problem Formation observer.

It does not change Formation semantic policy, Incident identity, Problem identity, Public Evidence, publication, ranking, or Source Admission.

---

## 1. Upstream authority

Phase 15.9K closed with:

```text
final main:
58fc84127a21cb2f54c466355131550990bd38e8

CI #488: SUCCESS
```

The authoritative 15.9K live reproduction established:

```text
ordinal 9
  first attempt max_output_tokens = 1200
  provider status = incomplete
  incomplete_details.reason = max_output_tokens
  bounded retry max_output_tokens = 2400
  retry completed
  deterministic Formation = reject / formation_incidental_friction

ordinal 16
  fresh 1200-token request completed
  deterministic Formation = review / formation_semantic_uncertain

Formation eligible = 0
DB writes = 0
```

Historical Phase 15.8N also observed provider-incomplete recovery pressure:

```text
8 durable Candidates
provider-incomplete retry attempted = 3
recovered = 2
exhausted = 1
```

The 15.8N observer retried the same 1200-token request. Phase 15.9K supplied the missing provider diagnostic showing that at least one such failure was directly caused by the output-token ceiling and was recoverable with a bounded larger response budget.

---

## 2. Promoted observer authority

Reusable observer version:

```text
source-problem-formation-observer-v0.2
```

Semantic prompt version remains:

```text
source-problem-formation-semantic-v0.1
```

Recovery mechanics version:

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
semantic prompt/schema/input = existing Formation contract
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

The recovery instruction asks only for the required structured fields and shorter proposals. It does not alter semantic labels or Formation eligibility rules.

The observer caps semantic attempts at 2 even if a caller supplies a larger `maxSemanticAttempts` value.

---

## 4. Errors that do not receive this recovery

15.9L does not widen retry policy to:

```text
source_formation_provider_timeout
source_formation_provider_network_error
source_formation_provider_rejected
source_formation_provider_invalid_json
source_formation_invalid_evidence_quote
source_formation_provider_missing_output
```

Only retryable `source_formation_provider_incomplete` receives the enlarged-budget retry.

Invalid evidence quote remains terminal for the semantic attempt because exact quote grounding is an evidence boundary, not a provider-output-budget failure.

---

## 5. Runtime metadata

Resolved and unresolved observer results expose bounded recovery metadata:

```text
version
attempted
recovered
attempt_count
trigger_reason_code
base_max_output_tokens
recovery_max_output_tokens
```

Recovered semantics additionally record:

```text
provider_recovery_version
provider_recovery_applied
```

These fields describe provider transport/recovery only. They do not change deterministic Formation state authority.

---

## 6. Verification target

The live shadow verification reuses only the two frozen Phase 15.9J/K targets:

```text
ordinals = [9, 16]
full-context outcome baseline = 85
```

Before any canonical URL or body read, the runner proves zero overlap with the Blind evaluation set.

Each target is fetched twice and must match the frozen Phase 15.9H/I context authority through the existing 15.9J integrity check before any model call.

If context drifts, that target receives zero model calls.

---

## 7. Production observer verification

The live runner does not use the Phase 15.9K phase-local recovery wrapper.

It invokes:

```text
resolveSourceProblemFormationAudit()
```

directly with the promoted observer v0.2 and instrumented provider transport.

The transport records only privacy-safe request/provider metadata:

```text
requested max_output_tokens
recovery instruction present/absent
semantic authority instruction present/absent
HTTP status
provider status
incomplete reason
output token count
reasoning token count
```

A valid live result requires:

```text
first request = 1200, no recovery instruction
second request, if any = 2400, recovery instruction present
second request only when recovery.trigger_reason_code = source_formation_provider_incomplete
provider attempts per target = 1 or 2
```

Provider nondeterminism is not converted into a false failure: if both targets complete on their first 1200-token requests, the shadow verifies the base production path while unit/contract tests and Phase 15.9K remain the recovery-path authority.

---

## 8. Budgets and mutation boundary

```text
targets = 2
source network requests max = 16
model calls max = 4
database writes = 0
```

Protected domains are snapshotted before and after and must be exactly equal.

The runner additionally requires no existing Incident links or Public Evidence rows for the two targets.

---

## 9. Artifact privacy

The disposable one-day artifact may contain:

```text
baseline ordinal
prior rejection stratum
Formation state/reason
safe semantic facts
SHA-256 and length of grounded evidence quote
recovery metadata
privacy-safe provider attempt metadata
aggregate protected-table counts
```

It must not contain:

```text
Source Signal ID
canonical/fetched URL
raw/full source body
author handle
provider request ID
raw evidence quote
```

---

## 10. Authority explicitly not granted

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

A recovered Formation result remains subject to the existing deterministic Formation mapper and downstream curator-governed boundaries.

---

## 11. Closeout requirements

15.9L can close only after:

1. implementation PR exact-head CI succeeds;
2. PIE prospective shadow succeeds;
3. expected-head merge succeeds;
4. merged-main CI succeeds;
5. one-shot live shadow runs from exact merged implementation main;
6. artifact confirms the production observer request contract;
7. independent DB readback confirms protected domains unchanged;
8. temporary live push trigger is removed;
9. closeout PR exact-head CI/PIE and merged-main CI succeed.
