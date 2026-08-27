# Phase 15.9D — Telecom Rejection Diagnostics

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.9D follows the Phase 15.9C result:

```text
400 fetched
313 distinct newly inserted Sources
Candidate = 0
Review = 0
Reject = 313
```

A third search expansion is not authorized yet. The unresolved question is whether this zero-yield result reflects the source supply itself or false negatives in Source Admission.

---

## 1. Diagnostic question

15.9D distinguishes between:

```text
A. search-supply mismatch
   Naver results are genuinely information/guide/no-event material

B. Source Admission false negative
   a rejected search snippet actually resolves to first-hand external friction in full context
```

This phase is diagnostic only. It does not modify Source Admission policy.

---

## 2. Frozen source cohort

The source authority is the unique eight-run Phase 15.9C campaign:

```text
phase15.9c-expanded-telecom-search-v0.1
campaign observations = 351
newly inserted reject cohort = 313
```

The runner reconstructs this cohort from durable ingestion provenance and Source first-seen time. It refuses to proceed unless the exact authoritative counts still hold.

---

## 3. Blind protection

The existing blind evaluation 120 remains protected.

Before sampling, 15.9D loads the blind evaluation Source IDs and excludes any overlap from diagnostic eligibility.

```text
blind evaluation labels are never read
blind sample content is never fetched by this phase
```

Only the ID exclusion set is used.

---

## 4. Deterministic bounded sample

The four dominant Phase 15.9C rejection strata are frozen:

```text
title_no_complaint_signal
snippet_information_only
title_truncated_no_complaint_signal
title_information_or_guide
```

Selection:

```text
4 Sources per stratum
4 strata
sample size = 16
```

Within each stratum, selection is deterministic by SHA-256 over phase version + rejection reason + Source identity.

This is deliberately not a 313-body campaign.

---

## 5. Full-context diagnostic authority

15.9D reuses existing authorities without modification:

```text
source-full-context-fetch-v0.2
source-full-context semantic judge
resolveFullContextSemantic()
```

For each sampled Source:

```text
fetch one public full post
→ if unavailable/truncated: diagnostic unavailable
→ otherwise semantic judge
→ derive candidate / review / reject using existing full-context resolver
```

Interpretation for this diagnostic:

```text
full-context candidate = confirmed Source Admission false negative
full-context review    = possible false negative / uncertainty
full-context reject    = sampled rejection is policy-consistent
unavailable            = no conclusion for that Source
```

No result is an Incident decision.

---

## 6. Privacy and artifact boundary

Full post bodies and exact evidence quotes are ephemeral.

The artifact may contain only:

```text
Source identity/content fingerprints
original rejection stratum
full-context hash and character count
semantic categorical facts
exact quote length + SHA-256 only
full-context decision and reason codes
model + token usage
aggregate diagnostic conclusion
```

It must not contain:

```text
Source UUID
canonical URL
author handle
raw search snippet
full post body
exact evidence quote
Incident UUID
Public Problem UUID
```

---

## 7. Database boundary

15.9D is read-only.

```text
database writes = 0
```

Before/after exact row counts are compared for:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
ar_source_incidents
ar_source_incident_links
ar_source_full_context_resolution_outcomes
```

In particular, diagnostic full-context results are **not** persisted to the normal outcome table.

---

## 8. Result routing

The live result determines the next governed phase.

```text
confirmed false negative > 0
→ design a bounded telecom Source Admission recovery / calibration phase

confirmed = 0, possible > 0
→ targeted second diagnostic or curator review; no policy mutation yet

confirmed = 0, possible = 0, all contexts resolved
→ evidence supports search-supply mismatch; diversify acquisition surface instead of weakening policy

context unavailable > 0 with no positive finding
→ diagnostic remains inconclusive
```

15.9D itself authorizes none of those mutations.

---

## 9. Still not authorized

```text
Source Admission policy change
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

Release flow remains:

```text
implementation PR
→ exact-head CI / PIE
→ merge main
→ merged-main CI
→ one-shot live diagnostic
→ artifact inspection
→ independent DB readback
→ closeout
```
