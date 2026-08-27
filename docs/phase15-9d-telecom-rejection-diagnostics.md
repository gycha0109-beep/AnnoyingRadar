# Phase 15.9D — Telecom Rejection Diagnostics

## Status

**CLOSED / LIVE VERIFIED / DIAGNOSTIC INCONCLUSIVE**

Phase 15.9D followed the Phase 15.9C result:

```text
400 fetched
313 distinct newly inserted Sources
Candidate = 0
Review = 0
Reject = 313
```

Its purpose was to distinguish search-supply mismatch from Source Admission false negatives without weakening policy or reading all 313 bodies.

---

## 1. Diagnostic contract

The frozen diagnostic sample was:

```text
4 rejection strata
× 4 Sources each
= 16 Sources total
```

Strata:

```text
title_no_complaint_signal
snippet_information_only
title_truncated_no_complaint_signal
title_information_or_guide
```

Selection was deterministic by SHA-256 over phase version + rejection reason + Source identity.

Blind evaluation Source IDs were loaded only as an exclusion set. Blind labels/content were not read, and sampled blind overlap was zero.

---

## 2. Implementation authority

Initial implementation head:

```text
66ed6b01ddfe576e704308d915709cf4d2f78d4e
PIE #103 = SUCCESS
CI #448 = FAILED
```

CI #448 failure was a test false positive, not a DB mutation. The static test matched crypto `createHash(...).update()` as if it were a database `.update()` call.

The test was narrowed to Supabase mutation patterns. Model-call attempt accounting was also made explicit so failed semantic calls would still count as attempted calls.

Final authority:

```text
PR #128
exact head = 37f81e7de303eaa154c93328fdef63ad4f03bb2d
CI #450 = SUCCESS
PIE #106 = SUCCESS
implementation main = 1b67b3dbf427c9da2632e1310546701e21a16d23
merged-main CI #451 = SUCCESS
```

---

## 3. Authoritative live execution

```text
run = 33034486700
status = SUCCESS
artifact = 9631490993
digest = sha256:8de67c9cff0dfe6207633e568190fb34a0c754a650dab23920e5028a2e01398c
```

Live diagnostic result:

```text
reconstructed reject cohort = 313
blind overlap excluded = 0
sample size = 16
full-source fetch attempts = 16
external model call attempts = 0
resolved full contexts = 0
unavailable full contexts = 16
candidate = 0
review = 0
reject = 0
```

All 16 sampled Sources failed before semantic judging with:

```text
full_context_url_invalid
```

Therefore the diagnostic conclusion is:

```text
diagnostic_inconclusive_due_to_unavailable_context
```

This result provides no evidence for or against Source Admission false negatives.

---

## 4. Root cause found after live execution

The failure was not random network loss and not a sample-size issue.

The existing source adapter has a provider/origin contract mismatch:

```text
Naver API Hub blog-search provider result
→ normalized unconditionally as source_platform = naver_blog
```

but `source-full-context-fetch-v0.2` intentionally supports only actual Naver Blog origins:

```text
blog.naver.com
m.blog.naver.com
```

Independent DB inspection of the exact Phase 15.9C newly inserted cohort showed:

```text
cohort total = 313
actual Naver Blog host = 5
other blog/web hosts = 308
```

Thus a provider search channel was incorrectly treated as an origin/platform identity. The deterministic 16-record sample consisted entirely of URLs outside the current Naver Blog fetcher's supported origin contract, causing 16/16 `full_context_url_invalid` before any model call.

This distinction is now authoritative:

```text
search provider ≠ content origin/platform
```

---

## 5. Database verification

15.9D remained read-only.

Artifact before/after and independent Supabase readback agree exactly:

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
full_context_outcomes = 82
```

```text
database writes = 0
Incident mutations = 0
problem_signature mutations = 0
Public Evidence mutations = 0
publication mutations = 0
```

Diagnostic full-context outcomes were not persisted.

---

## 6. Privacy boundary

The live artifact contains only safe fingerprints, lengths, categorical fields, fetch status, and aggregate counts.

It does not contain:

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

No full post body was successfully resolved in this run.

---

## 7. Closeout

The temporary one-shot live push trigger is removed during closeout. The workflow remains `workflow_dispatch` only.

Phase 15.9D is closed as an **inconclusive semantic diagnostic that successfully exposed an upstream contract defect**.

---

## 8. Next governed authority

The next phase is:

```text
Phase 15.9E — Search Provider / Source Origin Contract Repair
```

It must address the invariant:

```text
search provider metadata
≠
source origin/platform identity
```

Before another telecom rejection semantic audit, 15.9E must make origin compatibility explicit and prevent unsupported external-blog URLs from being silently represented as `naver_blog`.

The repair must preserve historical provenance and must not relabel existing Incident-linked Sources without an explicit migration design.

Still not authorized:

```text
Source Admission policy change
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```
