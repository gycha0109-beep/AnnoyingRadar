# Phase 15.9F — External Web Full-Context Acquisition Pilot

## Status

**IMPLEMENTED / LIVE PILOT NOT YET RUN**

Phase 15.9F follows the closed Phase 15.9E Source Origin Contract Repair.

15.9E established that the Phase 15.9C newly inserted telecom cohort contains:

```text
313 Sources total
actual Naver Blog origin = 5
actual external web origin = 308
blind-120 overlap = 0
```

15.9F does not rerun semantic rejection diagnostics yet. It establishes a bounded acquisition authority for external public HTML pages first.

---

## 1. Authority

The existing Naver full-context implementation remains:

```text
source-full-context-fetch-v0.2
```

External web acquisition is added separately as:

```text
external-web-full-context-fetch-v0.1
```

Dispatch becomes:

```text
source-origin-dispatch-v0.2
```

External acquisition is not enabled by default.

A caller must explicitly pass:

```text
bounded_public_html
```

through the dispatcher policy. Without that explicit policy, existing behavior remains:

```text
external_web -> full_context_origin_unsupported
```

This prevents Phase 15.9F from silently changing all historical full-context callers.

---

## 2. External fetch safety contract

The external fetcher is deliberately conservative.

Before every request and every redirect it requires:

```text
HTTP(S) only
no URL credentials
no non-default ports
no localhost / .local / .internal / .home / .lan
no private / loopback / link-local / CGNAT / documentation / multicast / reserved literal IP
DNS resolution must return only public Internet addresses
same normalized host across redirects
maximum 3 redirects
```

Response acceptance requires:

```text
text/html or application/xhtml+xml when Content-Type is present
maximum response bytes = 2 MiB
maximum canonical context chars = existing 60,000-char bound
```

15.9F does not claim that a DNS preflight is a universal network sandbox. It is a fail-closed application guard for the bounded public-source workflow. The workflow itself runs without internal network credentials beyond the required Supabase read credential.

---

## 3. Extraction contract

15.9F does not accept arbitrary body text as a full post.

High-confidence extraction targets are limited to:

```text
<article>
known post/article content containers
<main>
```

Page chrome inside the selected container is stripped for:

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

A selected context must contain at least 120 readable characters.

If no high-confidence container exists, the result is:

```text
full_context_external_body_not_found
```

There is intentionally no generic `<body>` fallback in 15.9F.

This protects the later semantic diagnostic from treating menus, related-post modules, navigation, or site chrome as user-authored complaint context.

---

## 4. Bounded pilot cohort

The live pilot reconstructs the exact Phase 15.9C campaign:

```text
8 completed ingestion runs
351 observations
313 newly inserted Sources
```

Before canonical URLs are read, it loads blind evaluation IDs and requires:

```text
blind overlap = 0
```

Only then are canonical URLs loaded and the 15.9E origin authority is reproduced:

```text
naver_blog = 5
external_web = 308
```

The pilot selects exactly 16 external-web Sources:

```text
4 x title_no_complaint_signal
4 x snippet_information_only
4 x title_truncated_no_complaint_signal
4 x title_information_or_guide
```

Selection is deterministic and external-only.

---

## 5. Live pilot limits

The live pilot permits:

```text
sampled public HTML fetches only
maximum network requests = 64 including redirects
sequential acquisition
12-second per-source dispatcher timeout
```

It forbids:

```text
LLM/model calls
Source Admission mutation
full-context outcome persistence
historical origin backfill
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

Database writes must remain exactly zero.

---

## 6. Artifact privacy

The disposable one-day artifact may contain only safe acquisition diagnostics such as:

```text
rejection stratum
existing external identity hash
existing content hash
origin host SHA-256
fetch status/error code
fetch/dispatch version
extraction scope
context hash/character count
truncation flag
redirect count
HTTP status
aggregate DB counts
```

It must not contain:

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

## 7. Success interpretation

15.9F answers only:

> Can a conservative, bounded external-web acquisition path recover semantically usable-looking post bodies from a deterministic sample without changing governed data?

It does not answer whether the recovered Sources are actual false negatives.

That semantic question belongs to a later Phase 15.9G rejection-diagnostic rerun after 15.9F is closed.

---

## 8. Release sequence

```text
implementation PR
-> exact-head CI / PIE
-> merge main
-> merged-main CI
-> one-shot bounded live pilot
-> artifact inspection
-> independent DB readback
-> remove temporary push trigger
-> closeout PR
-> merged-main CI
```
