# Phase 15.5C — Real Gold Acquisition Campaign

## Purpose

Phase 15.5C turns the verified NAVER API HUB source adapter into a reproducible real-signal acquisition and Gold benchmark workflow.

This phase does not promote Source Signals into Raw Inputs, Pain Evidence, or Public Problems. It creates evaluation supply and benchmark governance only.

## Acquisition campaign v1

Campaign version:

`gold-v0.1-acquisition-v1`

The fixed plan contains 40 NAVER Blog Search queries, each requesting 20 results, for 800 result opportunities.

Buckets:

- complaint-heavy: 8 queries
- domain friction: 16 queries
- domain neutral: 8 queries
- noise: 8 queries

Domains include delivery, taxi, travel, banking, shopping, jobs, fitness, healthcare, and general cross-domain language.

Every ingestion run stores the following in `request_metadata`:

- campaign version
- campaign query key
- campaign bucket
- campaign domain
- campaign ordinal
- NAVER API HUB provider request dimensions

The runner is resumable. A successfully completed campaign query is skipped on later runs. Failed queries remain eligible for retry.

## Live execution

With `.env.local` containing the verified NAVER API HUB credentials:

```bash
npm run acquire:gold:live
```

The runner:

1. resolves an existing Radar curator for provenance;
2. executes unfinished fixed campaign queries sequentially;
3. persists Source Signals and Observations through the existing service-role pipeline;
4. preserves dedupe on `(source_platform, external_content_id)`;
5. verifies Raw Input, Pain Evidence, and Public Problem counts are unchanged;
6. reports campaign unique pool size.

The minimum review-pool target is 600 unique Source Signals.

A completed query plan with fewer than 600 unique campaign signals is not PASS. It returns:

`CONTINUATION_REQUIRED_POOL_BELOW_TARGET`

Any failed or unfinished campaign query returns:

`CONTINUATION_REQUIRED_FAILED_QUERIES`

## Gold review ordering

Gold review must not be biased by campaign execution order. The review service reads up to 1,000 recent Source Signals, removes frozen holdout members, and deterministically shuffles candidates by Source Signal ID before presenting unlabeled items.

Large Source Signal ID lookups are chunked to avoid oversized Supabase `IN` requests.

## Gold benchmark freeze

Gold Set version remains:

`gold-v0.1`

Benchmark version:

`gold-v0.1-benchmark-v1`

The benchmark freezes exactly:

- 300 total human-reviewed Gold annotations
- 200 calibration samples
- 100 holdout samples

The split is deterministic from benchmark version + Source Signal ID and is created only after at least 300 Gold annotations exist.

Memberships are stored in:

`ar_source_signal_gold_benchmark_memberships`

The table is RLS-enabled, inaccessible to anon/authenticated roles, and service-role access is limited to SELECT + INSERT. There is no application UPDATE/DELETE path for benchmark memberships.

Once an annotation belongs to a frozen benchmark, a database trigger blocks UPDATE and DELETE of that Gold annotation. This protects both calibration and holdout labels from post-freeze mutation.

Frozen holdout Source Signals are removed from the normal curator review queue.

## Source Lab

`/curator/sources` shows:

- campaign completed queries / planned queries;
- unique campaign signal pool;
- fetched/new/duplicate/failed counts;
- Gold annotation progress toward 300;
- calibration/holdout freeze status;
- freeze control once 300 annotations are available.

The holdout label distribution is not surfaced as a tuning aid.

## Operational sequence

1. Run `npm run acquire:gold:live`.
2. If pool < 600, expand acquisition before labeling is treated as sufficient.
3. Human-review Gold labels in Source Lab until 300 are complete.
4. Freeze `gold-v0.1-benchmark-v1` into 200 calibration / 100 holdout.
5. Tune classifier/prefilter policy on calibration only.
6. Evaluate holdout only at the final empirical gate.

## Explicit non-goals

Phase 15.5C does not:

- infer unseen Naver blog full text from search snippets;
- auto-label Gold with the classifier;
- use classifier confidence as ground truth;
- expose holdout as routine tuning data;
- mutate private Raw Input or Pain Evidence ownership domains;
- create Public Problems;
- enable automatic Vercel production deployment.
