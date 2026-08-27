# Phase 15.9F — External Web Full-Context Acquisition Pilot

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.9F follows the closed Phase 15.9E Source Origin Contract Repair and establishes a bounded, explicit opt-in acquisition path for actual `external_web` Sources.

It does **not** authorize semantic Source Admission judgement or any governed-data mutation.

---

## 1. Frozen implementation authority

Implementation PR:

```text
PR #132
exact final head = ba81cf81ed67ad42dde4d436860e89cc02e72869
CI #460 = SUCCESS
PIE #112 = SUCCESS
```

The first PR CI attempt exposed a test-only false positive: a static mutation guard interpreted `createHash(...).update(...)` as a database `.update()` call. The guard was narrowed to Supabase mutation shapes and the final exact head passed the complete CI contract.

Merged implementation main:

```text
a9696fba33f5f898539c15efefbf199d74d084ab
merged-main CI #461 = SUCCESS
```

No migration is part of Phase 15.9F.

---

## 2. Acquisition contract

The existing Naver full-context implementation remains:

```text
source-full-context-fetch-v0.2
```

External web acquisition is separate:

```text
external-web-full-context-fetch-v0.1
```

Dispatcher authority:

```text
source-origin-dispatch-v0.2
```

External acquisition remains fail-closed by default. It is enabled only when a caller explicitly supplies:

```text
bounded_public_html
```

Without that policy:

```text
external_web -> full_context_origin_unsupported
```

Therefore 15.9F does not silently alter historical callers.

---

## 3. External fetch safety contract

Before every request and redirect the fetcher requires:

```text
HTTP(S) only
no URL credentials
no non-default ports
no localhost / .local / .internal / .home / .lan
no private / loopback / link-local / CGNAT / documentation / multicast / reserved literal IP
DNS resolution must contain only public Internet addresses
same normalized host across redirects
maximum 3 redirects
```

Response acceptance requires:

```text
text/html or application/xhtml+xml when Content-Type is present
maximum response bytes = 2 MiB
maximum canonical context chars = 60,000
```

The DNS preflight is a fail-closed application guard for this bounded public-source workflow; it is not claimed as a universal network sandbox.

---

## 4. Extraction contract

Only high-confidence page regions are accepted:

```text
<article>
known post/article content containers
<main>
```

Page chrome is stripped for:

```text
script
style
noscript
svg
canvas
template
nav
header
footer
aside
form
```

Minimum readable context length:

```text
120 characters
```

There is no generic `<body>` fallback.

A page without an accepted body container returns:

```text
full_context_external_body_not_found
```

---

## 5. Frozen live pilot authority

One-shot live branch:

```text
agent/phase15-9f-live-execution
```

Authoritative run:

```text
run = 33038468135
head = a9696fba33f5f898539c15efefbf199d74d084ab
status = SUCCESS
```

Disposable artifact:

```text
artifact id = 9632937597
name = source-external-web-full-context-pilot-15-9f
digest = sha256:2b2c835de8d54fe971f5c843129d4d31d978f971e5260f3cc24ddf50245b8e0d
retention = 1 day
```

The workflow checked out authoritative `main`, validated only the Supabase credential needed for read access, and carried no model credential.

---

## 6. Cohort and blind protection

The live pilot reconstructed the exact Phase 15.9C campaign:

```text
8 completed ingestion runs
351 observations
313 newly inserted Sources
```

Blind protection occurred before canonical URL read:

```text
blind overlap = 0
```

The Phase 15.9E origin authority reproduced exactly:

```text
naver_blog = 5
external_web = 308
```

The deterministic pilot sample contained exactly 16 external-web Sources:

```text
4 x title_no_complaint_signal
4 x snippet_information_only
4 x title_truncated_no_complaint_signal
4 x title_information_or_guide
```

---

## 7. Live acquisition result

All sixteen sampled Sources resolved successfully:

```text
total = 16
resolved = 16
unavailable = 0
truncated = 0
```

Extraction scopes:

```text
content_container = 8
article_element = 7
main_element = 1
```

Network budget:

```text
actual requests = 16
maximum authorized requests = 64
redirects = 0 for all sampled Sources
```

Every resolved item reported HTTP 200 and a non-null full-context hash and character count.

This establishes that the failure observed in Phase 15.9D was an acquisition-contract limitation for this deterministic sample, not evidence that the source bodies were inaccessible.

It does **not** establish that any of the sixteen are semantic false negatives. That question remains unjudged in 15.9F.

---

## 8. Durable-state invariance

The live artifact reported identical before/after counts, and an independent Supabase readback reproduced the same authority:

```text
source_signals          3562
source_observations     3892
source_ingestion_runs    144
raw_inputs                10
pain_evidences            27
public_problems             3
public_evidence             7
public_feed                 3
source_incidents            6
source_incident_links        7
full_context_outcomes       82
explicit_origin_rows         0
```

Therefore:

```text
database writes = 0
full-context outcome persistence = 0
historical origin backfill = 0
model calls = 0
```

---

## 9. Artifact privacy

The disposable artifact contains only bounded acquisition diagnostics:

```text
rejection stratum
external identity hash
source content hash
origin host SHA-256
fetch status/error code
fetch/dispatch version
extraction scope
full-context hash/character count
truncation flag
redirect count
HTTP status
aggregate DB counts
```

It contains no:

```text
Source Signal UUID
canonical URL
raw search text
full body text
author handle
evidence quote
Incident UUID
Public Problem UUID
```

---

## 10. Not authorized

Phase 15.9F does not authorize:

```text
default external-web dispatch enablement
semantic Source Admission judgement
Source Admission mutation
full-context outcome persistence
historical Source origin backfill
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

---

## 11. Next governed phase

After Phase 15.9F closeout, the appropriate next phase is a read-only semantic rejection diagnostic over the **15.9F-resolved contexts**.

That future phase may determine whether the four rejection strata contain actual Source Admission false negatives, but it must preserve:

```text
blind protection
frozen deterministic cohort
no Source Admission mutation
no Incident/problem/publication mutation
```

until separate authority is established.

---

## 12. Closeout sequence

```text
implementation PR #132
-> exact-head CI #460 / PIE #112 SUCCESS
-> merge main a9696fba33f5f898539c15efefbf199d74d084ab
-> merged-main CI #461 SUCCESS
-> one-shot live run 33038468135 SUCCESS
-> artifact 9632937597 inspected
-> independent DB readback matched
-> temporary push trigger removed
-> closeout PR
-> merged-main CI
```
