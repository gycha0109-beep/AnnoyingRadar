# Phase 15.8D — Bounded New-Review Full-Context Resolution

## Status

**CLOSED**

Phase 15.8D completed one bounded deterministic exact-new Review sample using the existing Phase 15.5F full-context resolution authority.

The empirical result is:

```text
sampled exact-new Reviews: 24
Candidate: 4
Reject: 15
unresolved Review: 5
resolved: 19
Review → Candidate promotion rate: 4 / 24 = 16.67%
```

This is a bounded diagnostic result, not a population-level confidence claim.

## Why this phase existed

Phase 15.8C closed with exact new-source acquisition telemetry:

```text
exact runs: 24
newly inserted Sources: 961
new Candidates: 0
new Reviews: 166
new Rejects: 795
```

The remaining acquisition question was whether snippet-level `REVIEW` represented merely noisy ambiguity or contained meaningful first-hand pain evidence that only becomes visible in full post context.

Phase 15.8D answers that question empirically without lowering Source Admission thresholds.

## Authority

Phase 15.8D reused the existing Phase 15.5F authority unchanged:

```text
classifySourceAdmission()
→ REVIEW + requires_full_context only
→ fetchSourceFullContext()
→ semantic observation
→ resolveFullContextSemantic()
```

Existing implementation:

```text
lib/sources/source-full-context-fetch.mjs
lib/sources/source-full-context-resolution.mjs
```

No new semantic admission rule, Candidate threshold, Formation rule, Incident rule, or publication rule was introduced.

## Exact-new Review reconstruction

A Source identity is reconstructed as newly inserted by an exact telemetry run when:

```text
Source observation belongs to the exact run
AND
source.first_seen_at >= run.started_at
AND
source.first_seen_at <= run.completed_at
```

The live pilot exposed and fixed one operational defect before semantic interpretation.

### Pagination defect

The two Phase 15.8C exact batches contained:

```text
continued Source observations: 1,009
exact newly inserted Sources: 961
```

The first 15.8D live attempt read only 1,000 observation rows because the observation query did not paginate beyond the Supabase row cap.

That produced a fail-closed assertion:

```text
reconstructed exact-new Sources: 952
expected inserted telemetry: 961
```

No paid semantic calls were made in that failed attempt.

PR #75 fixed the runner by paging observation reads in deterministic 1,000-row ranges ordered by:

```text
ingestion_run_id
source_signal_id
```

The successful empirical attempt then proved:

```text
observation_rows: 1,009
exact_new_sources: 961
exact_new_reviews: 166
```

Thus exact-new identity and Review reconstruction matched telemetry authority before full-context resolution.

## Bounded deterministic sample

Version:

```text
exact-new-review-sample-v0.1
```

Sample size:

```text
24
```

Selection remained deterministic:

1. reconstruct exact-new identities;
2. classify with unchanged snippet-level Source Admission;
3. keep only `review + requires_full_context`;
4. group by `domain × family`;
5. stable-hash order inside each stratum;
6. round-robin across strata until the sample budget is filled.

### Sample distribution

By domain:

```text
account      6
billing      4
commerce     5
delivery     2
healthcare   1
housing      2
lodging      2
mobility     1
refund       1
```

By family:

```text
damage  16
delay    8
```

## Live execution

Authoritative pilot:

```text
workflow: Source Review Resolution Pilot
run: 32803527457
job: 97669039003
artifact: 9547401938
authoritative main: 52e0d8a1a958e3a6379eb92788c0e9c667539d25
model: gpt-5-mini-2025-08-07
sample size: 24
```

The GitHub Actions job conclusion was `failure` because the runner intentionally exits with code `2` when unresolved items remain and reports:

```text
status: CONTINUATION_REQUIRED
```

This does not invalidate the empirical sample. The stage close criterion explicitly permits transparent unresolved fetch/provider failures while no-write and authority boundaries remain intact.

## Empirical outcomes

### Aggregate

```text
Candidate: 4
Reject: 15
Review / unresolved: 5
resolved: 19
unresolved: 5
promotion_rate: 16.67%
```

### Candidate promotions

The four full-context Candidate promotions were:

```text
a66285ae-4847-42ec-a7be-e344fdc1f689
account / delay
query: account__delay__1
reason: full_context_first_hand_external_friction

44bf39a9-4f28-45f2-a2c5-2398dca2854d
delivery / delay
query: delivery__delay__1
reason: full_context_first_hand_external_friction

1b49ead3-7cc5-4b0b-ba01-27d0c234348a
lodging / damage
query: lodging__damage__1
reason: full_context_first_hand_external_friction

ca1ac35c-3ee4-4698-8b76-9ed25f9b5f94
commerce / delay
query: commerce__delay__1
reason: full_context_first_hand_external_friction
```

No Candidate result was persisted to the database by this stage.

### Reject reasons

```text
full_context_informational_content: 12
full_context_not_first_hand: 2
full_context_nonorganic_or_borrowed: 1
```

The dominant failure mode was therefore informational/generic content rather than a lack of any pain-related language.

This validates the reason for keeping the cheap snippet-level Review state separate from final Candidate authority.

### Unresolved reasons

Five sampled Reviews remained technically unresolved:

```text
source_full_context_provider_incomplete: 2
full_context_url_invalid: 2
source_full_context_invalid_evidence_quote: 1
```

The two URL-invalid items were external blog hosts returned through the Naver Blog acquisition surface. The current Phase 15.5F full-context fetcher intentionally supports Naver Blog post URLs only.

No generic arbitrary-host fetcher was introduced in this phase.

The unresolved outcomes remain `REVIEW`; they are not silently promoted or rejected.

## Outcomes by family

```text
damage
  total: 16
  Candidate: 1
  Reject: 11
  unresolved Review: 4

delay
  total: 8
  Candidate: 3
  Reject: 4
  unresolved Review: 1
```

The bounded sample suggests `delay` may have higher full-context promotion yield than `damage`, but `n=24` is too small to justify aggressive allocation changes by itself.

Any later adaptive use must retain minimum-sample safeguards and an exploration budget.

## Outcomes by domain

```text
account     6 → Candidate 1 / Reject 3 / Review 2
billing     4 → Candidate 0 / Reject 4 / Review 0
commerce    5 → Candidate 1 / Reject 3 / Review 1
delivery    2 → Candidate 1 / Reject 0 / Review 1
healthcare  1 → Candidate 0 / Reject 1 / Review 0
housing     2 → Candidate 0 / Reject 2 / Review 0
lodging     2 → Candidate 1 / Reject 1 / Review 0
mobility    1 → Candidate 0 / Reject 0 / Review 1
refund      1 → Candidate 0 / Reject 1 / Review 0
```

These counts are diagnostic observations only. They are not sufficient to declare domain-level production rankings.

## Privacy / persistence boundary

Full public post bodies remained ephemeral.

The runner did not:

- write full bodies to Supabase;
- write semantic outcomes to Supabase;
- commit full bodies to Git;
- print full post bodies in diagnostics;
- print `evidence_quote` in diagnostics.

The OpenAI request used:

```text
store: false
```

## No-write / authority verification

The live runner reported identical pre/post counts:

```text
source_signals: 2260
source_observations: 2461
source_ingestion_runs: 108
raw_inputs: 10
pain_evidences: 27
public_problems: 2
public_evidence: 5
source_incidents: 4
```

Independent post-run readback confirmed:

```text
Published Problems: 2
Public Evidence: 5
Source Incidents: 4
Blind evaluation membership: 120
  representative: 60
  challenge: 60
```

Execution scope:

```text
DB writes: 0
Blind evaluation reads by runner: 0
full source bodies persisted: 0
publication mutations: 0
```

## Operational workflow after closeout

The temporary push trigger used to launch the empirical pilot is removed at closeout.

The workflow remains available only through:

```text
workflow_dispatch
```

and continues to check out authoritative `main` before secrets are used.

## Conclusion

Phase 15.8D establishes two facts simultaneously:

1. the widened Review pool contains substantial noise, especially informational/generic material;
2. it is not merely a garbage pool — 4 of 24 sampled Reviews promoted to valid first-hand external-friction Candidates after full-context inspection.

Therefore the correct next step is **not** to lower Source Admission thresholds and **not** to credit every Review equally.

The next acquisition calibration should measure and cautiously incorporate:

```text
Review → full-context Candidate promotion yield
```

while preserving:

- exact new-source yield telemetry;
- strict Source Admission;
- no Blind tuning;
- minimum sample safeguards;
- an explicit exploration budget;
- existing Incident and publication authority.

Phase 15.8D is **CLOSED**.
