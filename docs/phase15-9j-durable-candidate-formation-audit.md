# Phase 15.9J — Durable Candidate Problem Formation Audit

## Status

**CLOSED**

Phase 15.9J evaluated the three durable Phase 15.9I Source Admission Candidates under the existing Problem Formation authority without creating Incident, problem, evidence, or publication authority.

Final empirical conclusion:

```text
formation_inconclusive_due_context_drift
```

This is not a Formation eligibility approval.

## 1. Upstream authority

```text
Phase 15.9I final main = d8a12671c5e04f75eb3e71f17bad13edf99ddc22
full-context outcomes = 85
source batch = phase15.9i-confirmed-false-negative-candidates-v0.1
batch rows = 3
target ordinals = 4, 9, 16
sample fingerprint = 2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e
```

All three durable rows remained exact `resolved / candidate / full_context_first_hand_external_friction` authority at the start of the audit.

## 2. Implementation release lineage

Initial implementation PR:

```text
PR #140
exact head = 774121523ea3d1f5dc4b5aedf8a82b3d12bbd6aa
CI #479 = SUCCESS
PIE #123 = SUCCESS
implementation main = 6f509ca290ed8b705f4081948b38daf60e15f19f
merged-main CI #480 = SUCCESS
```

### First live attempt

```text
run #1 = 33044887515
execution SHA = 6f509ca290ed8b705f4081948b38daf60e15f19f
result = FAILURE
artifact = 9635238500
```

The run failed before any Formation model evaluation because the first target no longer matched the frozen H/I content hash:

```text
Phase 15.9J first.content_hash drifted from frozen authority
```

The fail-closed integrity boundary was correct, but v0.1 stopped at the first drift and did not preserve enough privacy-safe diagnostics or evaluate independent stable targets.

## 3. Context-drift correction

Correction PR:

```text
PR #141
exact head = 80dd783db769ea169012d449e618d7e5c617a01b
CI #481 = SUCCESS
PIE #124 = SUCCESS
v0.2 main = a3e244e1e8c9826aa936cbfd67391b8c497d7162
merged-main CI #482 = SUCCESS
```

v0.2 did not weaken context authority.

Per target:

```text
stable pair + exact H/I match
  -> Formation observer may evaluate

stable pair + H/I mismatch
  -> context_drift
  -> model calls = 0 for that Source

unstable pair
  -> context_pair_unstable
  -> model calls = 0 for that Source
```

Changed current content is never substituted silently for the H/I Candidate context.

## 4. Authoritative live run

```text
workflow = Source Durable Candidate Formation Audit 15.9J
run #2 = 33045446281
execution SHA = a3e244e1e8c9826aa936cbfd67391b8c497d7162
result = SUCCESS
artifact = 9635465894
artifact digest = sha256:fe513a5fde52a509a28bd4cb1ede1bfeff35600377229c21fd0a8b8a0edcdf7e
```

Global execution:

```text
targets = 3
Blind overlap before URL/body read = 0
source network requests = 6 / max 24
model calls = 4 / max 6
database writes = 0
actual semantic source platform = external_web
```

Audit accounting:

```text
formation_evaluated = 2
context_drift = 1
context_pair_unstable = 0

eligible = 0
provenance_review = 0
review = 2
reject = 0
resolved Formation = 0
unresolved Formation = 2
```

Provider recovery:

```text
attempted = 2
recovered = 0
```

Reason distribution:

```text
first_content_hash_drift = 1
second_content_hash_drift = 1
source_formation_provider_incomplete = 2
```

## 5. Per-ordinal result

### Ordinal 4 — context drift

Prior snippet rejection stratum:

```text
title_no_complaint_signal
```

Current acquisitions were internally stable but did not match the H/I content hash:

```text
pair stable = true
expected content hash = 41f15cace5262a57cdd1fc439c2b61caf0b101b20d1b9595552c7c8802dcc1eb
observed content hash = a821f482f7e42184bd83fdc528bc47ecc254d997239564b357939199ff538106
```

The following remained unchanged:

```text
original char count = 5752
content scope = full_post
extraction scope = main_element
title SHA-256 = c75c730c0c0321bd7a3902bad30a9c28cbf335953f6b36cd4885ddb51537f9ff
truncated = false
```

Therefore:

```text
audit_status = context_drift
Formation model calls = 0
Formation state = none
```

Phase 15.9J does not infer what changed in the body and does not reuse the old Candidate semantic result against the changed context.

### Ordinal 9 — Formation unresolved

Prior snippet rejection stratum:

```text
title_truncated_no_complaint_signal
```

Context integrity remained exact H/I authority.

Formation result:

```text
audit_status = formation_evaluated
formation_state = review
resolved = false
reason = source_formation_provider_incomplete
attempts = 2
recovery attempted = true
recovery recovered = false
```

No Formation semantic facts or mechanism proposals were accepted.

### Ordinal 16 — Formation unresolved

Prior snippet rejection stratum:

```text
title_information_or_guide
```

Context integrity remained exact H/I authority.

Formation result:

```text
audit_status = formation_evaluated
formation_state = review
resolved = false
reason = source_formation_provider_incomplete
attempts = 2
recovery attempted = true
recovery recovered = false
```

No Formation semantic facts or mechanism proposals were accepted.

## 6. Evidence and privacy boundary

No target reached Formation `eligible`, so no grounded evidence quote became Formation authority.

The disposable artifact contains no:

```text
Source UUID
canonical URL
fetched URL
raw snippet
full body
author handle
exact evidence quote
provider request ID
```

Context-drift diagnostics are limited to privacy-safe hashes, counts, scopes, truncation, ordinal, and reason codes.

## 7. Independent production DB readback

Artifact before/after and independent Supabase readback agree:

```text
source_signals = 3562
source_observations = 3892
source_ingestion_runs = 144
raw_inputs = 10
pain_evidences = 27
public_problems = 3
public_evidence = 7
public_feed = 3
source_incidents = 6
source_incident_links = 7
full_context_outcomes = 85
Phase 15.9I batch rows = 3
```

All protected domains remained unchanged.

Authorized DB writes:

```text
0
```

## 8. Closed authority boundary

Phase 15.9J establishes only:

```text
ordinal 4 -> current context differs from frozen H/I body hash
ordinal 9 -> frozen context intact, Formation provider-incomplete after 2 attempts
ordinal 16 -> frozen context intact, Formation provider-incomplete after 2 attempts
```

It does **not** establish:

```text
Formation eligibility for any Source
Incident identity
Incident persistence
Source -> Incident linking
problem_signature
Canonical/Public Problem
Public Evidence
publication
current-context replacement authority for ordinal 4
```

## 9. Next governed work

A curator/Incident phase is not justified because `eligible = 0`.

The unresolved work should remain split by cause:

1. **Formation provider-incomplete reliability** for ordinals 9 and 16, using their unchanged frozen contexts and no quote retry.
2. **Current-context revalidation** for ordinal 4, because its current body hash differs from the durable H/I context.

These are separate authorities and should not be collapsed into Incident formation.

The Phase 15.9J workflow is manual-only after closeout.
