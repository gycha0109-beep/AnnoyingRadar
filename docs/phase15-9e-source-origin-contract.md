# Phase 15.9E — Search Provider / Source Origin Contract Repair

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.9E repairs the contract defect exposed by Phase 15.9D:

```text
search provider/channel != actual content origin
```

NAVER API HUB Blog Search is a discovery provider. Its results can point to Naver Blog, Tistory, or independent web hosts. Historical normalization used the legacy `source_platform = naver_blog` identity namespace for all of those results, while `source-full-context-fetch-v0.2` only supports actual Naver Blog pages.

The frozen Phase 15.9C cohort proved the mismatch:

```text
newly inserted Sources = 313
actual Naver Blog origin = 5
external web origin = 308
invalid origin = 0
```

---

## 1. Final authority split

### Discovery provider

Provider remains ingestion-run authority:

```text
ar_source_ingestion_runs.request_metadata.provider = naver_api_hub
ar_source_ingestion_runs.request_metadata.resource = blog_search
```

### Historical Source identity

Source identity remains unchanged:

```text
source_platform + external_content_id
```

15.9E does not re-key historical Sources and does not change the unique identity constraint.

### Actual content origin

Migration 038 adds nullable Source-level fields:

```text
source_origin_kind
source_origin_host
source_origin_classifier_version
```

Classifier:

```text
source-origin-v0.1
```

Classification:

```text
blog.naver.com / m.blog.naver.com -> naver_blog
other valid HTTP(S) hosts          -> external_web
```

---

## 2. Historical provenance protection

Migration 038 contains no `UPDATE ar_source_signals` and performs no backfill.

Immediately after live migration:

```text
explicit origin rows = 0
Source→Incident-linked Sources = 7
linked Sources with all new origin columns null = 7
```

The seven linked Sources infer from their canonical URLs as:

```text
naver_blog = 7
external_web = 0
invalid = 0
```

Their durable historical identity/provenance was not rewritten.

The historical platform constraint also remains:

```text
source_platform IN ('threads', 'naver_blog')
```

and identity uniqueness remains:

```text
UNIQUE (source_platform, external_content_id)
```

---

## 3. New NAVER search normalization

Adapter authority:

```text
naver-api-hub-blog-search-v3-origin-contract
```

Newly normalized NAVER API HUB results retain:

```text
source_platform = naver_blog
source_metadata.provider = naver_api_hub
source_metadata.resource = blog_search
```

and additionally carry:

```text
source_origin_kind
source_origin_host
source_origin_classifier_version
```

This preserves the existing identity namespace while making actual content origin explicit.

---

## 4. Full-context dispatch repair

The Naver body parser remains:

```text
source-full-context-fetch-v0.2
```

Its Naver body extraction and canonical text/hash behavior are unchanged.

New dispatch authority:

```text
source-origin-dispatch-v0.1
```

Routing:

```text
origin = naver_blog
  -> existing v0.2 Naver PostView fetch/parser

origin = external_web
  -> full_context_origin_unsupported
  -> no Naver-parser network request

legacy Source with null origin fields
  -> infer origin ephemerally from canonical_url
  -> do not persist inference
```

The previous misleading path:

```text
external web result
-> source_platform naver_blog
-> full_context_url_invalid
```

is now separated from actual URL validity.

Generic external-web body acquisition is intentionally outside Phase 15.9E.

---

## 5. Implementation authority

```text
implementation PR = #130
exact head = d08fe39df6421d5bdf4df305ae3d0361896575e1
CI #454 = SUCCESS
PIE #108 = SUCCESS
implementation main = 6ced13c125c324c89eaeaa90785540d5a278f70b
merged-main CI #455 = SUCCESS
```

Changed implementation surface:

```text
lib/sources/source-origin.mjs
lib/sources/naver-blog-adapter.mjs
lib/sources/source-full-context-fetch.mjs
supabase/migrations/038_source_origin_contract.sql
scripts/run-source-origin-contract-verification-15-9e.mjs
.github/workflows/source-origin-contract-verification-15-9e.yml
tests/phase15-9e-source-origin-contract.test.mjs
docs/phase15-9e-source-origin-contract.md
```

---

## 6. Live migration authority

Repository migration:

```text
038_source_origin_contract.sql
```

Live Supabase migration:

```text
20260827032611 source_origin_contract
```

Independent schema readback verified:

```text
source_origin_kind = text nullable
source_origin_host = text nullable
source_origin_classifier_version = text nullable
explicit origin rows = 0
linked origin-null rows = 7/7
historical source_platform CHECK unchanged
historical Source identity UNIQUE unchanged
```

---

## 7. Authoritative live verification

One-shot branch:

```text
agent/phase15-9e-live-execution
```

Run:

```text
run = 33036391945
head = 6ced13c125c324c89eaeaa90785540d5a278f70b
status = SUCCESS
```

Artifact:

```text
id = 9632154083
name = source-origin-contract-verification-15-9e
digest = sha256:2716c5972dd2d2b07a0dac7a8bbf8ac8489722883dce530478769ade197f0dc6
retention = 1 day
```

Frozen campaign reconstruction:

```text
provider = naver_api_hub
resource = blog_search
runs = 8
observations = 351
newly inserted Sources = 313
blind overlap = 0
historical explicit origin rows = 0
```

In-memory origin classification:

```text
naver_blog = 5
external_web = 308
invalid = 0
```

Durable Source→Incident lineage:

```text
linked Sources = 7
historical explicit origin rows = 0
naver_blog inferred = 7
external_web inferred = 0
invalid = 0
```

Operational boundary:

```text
database writes = 0
full-context body fetches = 0
model calls = 0
```

---

## 8. Independent DB readback after live verification

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

These counts equal the live artifact before/after snapshots.

Additional readback:

```text
explicit origin rows = 0
linked Sources = 7
linked origin-null rows = 7
```

No governed data mutation occurred during verification.

---

## 9. Closeout state

The temporary live push trigger is retired in the closeout branch. The workflow returns to `workflow_dispatch` only.

Phase 15.9E authorizes none of the following:

```text
historical Source origin backfill
source_platform re-keying
generic external-web body acquisition
Source Admission policy changes
Incident creation
Source→Incident linking
problem_signature assignment
Canonical Problem creation
Public Evidence persistence
publication
```

The next governed phase should address bounded `external_web` full-context acquisition before the telecom rejection diagnostic is rerun.
