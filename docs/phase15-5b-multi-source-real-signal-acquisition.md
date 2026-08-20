# Phase 15.5B — Multi-Source Real Signal Acquisition

## Status

Implementation track for acquiring real Source Signals before Complaint Relevance calibration.

This is not a new Problem-generation stage. External search results remain editorial supply data and must not be promoted directly into private Raw Inputs, Pain Evidence, or Public Problems.

## Why Phase 15.5B changed

The Threads official adapter remains implemented, but live verification established the following boundary:

- OAuth token authentication: working.
- `threads_basic`: working.
- `threads_keyword_search`: granted on the tested token.
- `/keyword_search`: HTTP 200.
- Unreviewed/test access: returned zero public results across representative queries.
- Meta App Review requires an authenticated Business Portfolio for the current account path.

Therefore Threads remains a future reviewed source instead of the only acquisition dependency.

## Primary source: Naver Blog Search API

Phase 15.5B adds the official Naver Search API blog endpoint as the first accessible Korean-language acquisition source.

Server credentials:

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

Provider request dimensions:

- query
- `sort=date|sim`
- display, bounded to 50 by Annoying Radar
- start, bounded to the provider's first 1000 search positions

Generic run mapping:

- `date` -> `search_type=RECENT`
- `sim` -> `search_type=TOP`
- `search_mode=KEYWORD`
- provider-specific `sort`, `start`, and `display` are preserved in `request_metadata`.

## Critical semantic boundary: search snippet is not full content

Naver blog search returns a title, canonical result link, a summarized passage, blog name/link, and post date. Annoying Radar stores the visible title + passage as a Source Signal candidate with:

- `source_platform=naver_blog`
- `acquisition_method=official_api`
- `content_scope=search_snippet`
- `media_type=BLOG_SEARCH_SNIPPET`

The provider title/description and provider metadata are preserved separately in `source_metadata` for auditability.

A curator or classifier must not infer facts from content that is not present in the stored snippet. In particular, `first_hand_experience`, `concrete_friction`, and `core_evidence` must be grounded in visible Source Signal text.

## Multi-source identity and dedupe

Source identity is the pair:

`(source_platform, external_content_id)`

Naver blog search has no provider content ID in its search result schema, so `external_content_id` is the SHA-256 digest of the canonical result URL. Threads continues using its provider post ID.

`persistSourceSignals` dedupes on the full platform + external identity rather than assuming Threads.

Repeated retrieval of the same Source Signal must:

- not create another Source Signal row;
- create a new Observation for the new ingestion run;
- preserve query/rank provenance.

## Database provenance additions

Migration `025_multi_source_signal_acquisition.sql`:

- allows `threads` and `naver_blog` source platforms;
- adds `request_metadata` to ingestion runs;
- adds `acquisition_method`, `content_scope`, and `source_metadata` to Source Signals;
- preserves existing RLS/service-role ownership and source-domain separation.

No migration in this phase references:

- `ar_raw_inputs`
- `ar_pain_evidences`
- `ar_public_problems`

## Source Lab

`/curator/sources` remains curator-only and now exposes:

1. Naver Blog Search — primary acquisition path.
2. Threads official adapter — retained as a review-dependent future source.
3. recent ingestion runs with source platform provenance.
4. the existing Complaint Relevance / Gold Set review queue.

## Live verification authority

Run after Naver credentials are configured:

```bash
npm run verify:naver:live
```

The live harness checks:

- complaint-heavy, neutral, and noise queries;
- date and relevance sorting;
- pagination position;
- normalization and provenance;
- hosted Source Signal persistence;
- repeated retrieval dedupe;
- new Observation creation;
- unchanged Raw Input / Pain Evidence / Public Problem counts.

Unlike the superseded Threads harness, zero usable Source Signals can never produce PASS. If every live scenario returns no usable signal, verification terminates with:

`BLOCKED_NO_LIVE_SIGNALS`

## Gold acquisition policy

Target Gold v0.1 remains approximately 300 human-reviewed signals. Do not force all samples to be complaints. The benchmark must contain positive, negative, ambiguous, promotional/noise, and generic informational examples.

Recommended eventual mix is multi-source rather than provider-monoculture. Naver is the initial primary source; additional official providers can be added under the same provenance contract.

## Explicit non-goals

Phase 15.5B does not:

- crawl Naver blog pages for full text;
- treat search snippets as full original posts;
- bypass Meta App Review;
- create fake production seeds;
- auto-promote Source Signals into Pain Evidence or Problems;
- enable Vercel automatic production deployment.
