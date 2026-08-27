# Phase 15.9E — Search Provider / Source Origin Contract Repair

## Status

**IMPLEMENTED / MIGRATION NOT YET APPLIED / LIVE VERIFICATION NOT YET RUN**

Phase 15.9E follows the closed Phase 15.9D diagnostic. The 15.9D bounded sample did not reach semantic judging because all 16 sampled Sources returned `full_context_url_invalid` before body fetch.

Independent diagnosis of the frozen Phase 15.9C cohort established:

```text
newly inserted Sources = 313
actual blog.naver.com origin = 5
external blog/web origin = 308
```

The defect is a contract conflation:

```text
search provider/channel != actual content origin
```

NAVER API HUB Blog Search is the discovery provider, but its result set can link to Naver Blog, Tistory, and independent web hosts. Historical normalization stored all of those results under the legacy `source_platform = naver_blog` identity namespace, while `source-full-context-fetch-v0.2` only parses actual Naver Blog pages.

---

## 1. Authority split

15.9E freezes three separate concepts.

### Discovery provider authority

Provider belongs to the ingestion event/run:

```text
ar_source_ingestion_runs.request_metadata.provider = naver_api_hub
ar_source_ingestion_runs.request_metadata.resource = blog_search
```

A Source can be rediscovered through another provider later, so provider is not Source identity.

### Historical Source identity namespace

The existing identity remains unchanged:

```text
source_platform + external_content_id
```

15.9E does not re-key existing Sources and does not change the unique constraint or the historical `source_platform` values.

### Actual content origin authority

Migration 038 adds nullable Source-level fields:

```text
source_origin_kind
source_origin_host
source_origin_classifier_version
```

The initial classifier is:

```text
source-origin-v0.1
```

Current classifications used by NAVER Blog Search normalization:

```text
blog.naver.com / m.blog.naver.com -> naver_blog
other valid HTTP(S) hosts          -> external_web
```

---

## 2. Zero historical backfill

Migration 038 is additive only.

It contains no update/backfill of `ar_source_signals`.

Existing Sources therefore remain:

```text
source_origin_kind = null
source_origin_host = null
source_origin_classifier_version = null
```

until a separately governed operation explicitly persists origin data.

This is intentional. Historical Source identity and provenance are not silently rewritten.

The seven durable Source rows participating in Source→Incident links were independently checked before implementation and all resolve from their canonical URLs to actual `blog.naver.com` origins. 15.9E still leaves their new origin columns null.

---

## 3. New NAVER search normalization

`naver-api-hub-blog-search-v3-origin-contract` keeps:

```text
source_platform = naver_blog
source_metadata.provider = naver_api_hub
source_metadata.resource = blog_search
```

and additionally records the actual origin classification for newly normalized results:

```text
source_origin_kind
source_origin_host
source_origin_classifier_version
```

The adapter identity namespace is therefore preserved while provider and origin become explicit orthogonal facts.

---

## 4. Full-context dispatch repair

The Naver body parser itself remains:

```text
source-full-context-fetch-v0.2
```

Its body extraction and canonical text/hash behavior are not changed by 15.9E.

A new pre-fetch dispatch contract is added:

```text
source-origin-dispatch-v0.1
```

Dispatch now resolves actual origin first.

```text
origin = naver_blog
  -> existing v0.2 Naver PostView fetch/parser

origin = external_web
  -> unavailable: full_context_origin_unsupported
  -> no network request through the Naver parser

legacy Source with null origin columns
  -> infer origin ephemerally from canonical_url
  -> do not persist the inference
```

This changes the previous misleading failure mode:

```text
external origin mislabeled as naver_blog
-> full_context_url_invalid
```

into the correct contract result:

```text
external_web
-> full_context_origin_unsupported
```

Generic external-web full-context acquisition is not implemented in 15.9E.

---

## 5. Migration contract

Repository migration:

```text
supabase/migrations/038_source_origin_contract.sql
```

It adds only nullable origin columns, completeness checks, and a partial origin index.

It does not modify:

```text
source_platform CHECK
(source_platform, external_content_id) identity uniqueness
Source→Incident rows
Incident rows
Canonical Problems
Public Evidence
Public Feed
```

Migration backfill count must remain zero.

---

## 6. Bounded live verification

After implementation is merged and migration 038 is applied, the one-shot verifier reconstructs the exact Phase 15.9C campaign:

```text
8 ingestion runs
351 observations
313 newly inserted Sources
```

Blind protection occurs before reading canonical URLs:

```text
load blind-evaluation Source IDs only
reconstruct cohort from IDs + first_seen_at
assert blind overlap = 0
only then read canonical URLs
```

The verifier must reproduce:

```text
naver_blog = 5
external_web = 308
invalid = 0
```

It also checks the seven Source→Incident-linked Sources:

```text
explicit origin columns = null
inferred actual origin = naver_blog for 7/7
```

The live verification is strictly read-only:

```text
database data writes = 0
full-context body fetches = 0
model calls = 0
```

Only aggregate counts are written to the disposable artifact. No Source UUID, canonical URL, body, quote, author, Incident UUID, or evaluation label is exported.

---

## 7. Not authorized

Phase 15.9E does not authorize:

```text
historical Source origin backfill
source_platform re-keying
external-web body acquisition
Source Admission policy changes
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

The likely next phase after successful closeout is a bounded external-web full-context acquisition authority, followed by a rerun of rejection diagnostics. That next phase is not part of 15.9E.

---

## 8. Release sequence

```text
implementation PR
-> exact-head CI / PIE
-> merge main
-> merged-main CI
-> apply migration 038
-> independent schema + zero-backfill readback
-> one-shot read-only origin verification
-> artifact inspection
-> independent DB readback
-> closeout PR
-> merged-main CI
```
