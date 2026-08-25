# Phase 15.8A — High-Recall / Low-Cost Discovery Layer

## Status

IMPLEMENTED — pending CI, live migration, and empirical pilot

## Problem

Phase 15.5–15.7 proved a high-precision Source → Incident → Public Problem pipeline, but the observed funnel is supply-limited:

```text
669 development Source Signals
→ 17 admitted Candidates
→ 11 formation-eligible Source rows
→ 10 independent incidents
→ 2 repeated canonical Problems
```

Increasing Public Problem coverage by lowering Source Admission, formation, Incident, or publication thresholds is forbidden. The next lever is Source Supply.

The failure mode to avoid is equally important:

```text
more API results
→ more obvious SEO / sales / promotional / informational noise
→ larger Source table
→ higher review and processing cost
```

Phase 15.8A therefore expands discovery recall while rejecting only cheap, deterministic, high-confidence noise before Source persistence.

## Authority separation

```text
Provider search result
        ↓
Discovery Prefilter      high-recall hard reject only
        ↓
Persisted Source Signal
        ↓
Source Admission         existing precision authority
        ↓
Full-context Formation
        ↓
Incident identity
        ↓
Canonical Problem
```

Discovery Prefilter is not Source Admission.

It cannot promote anything to Candidate, Evidence, Incident, or Public Problem. Ambiguity is retained and passed downstream.

## Discovery Prefilter v0.1

Implementation:

```text
lib/sources/discovery-prefilter.mjs
```

Version:

```text
source-discovery-prefilter-v0.1
```

Allowed decisions:

```text
continue
reject
```

Hard-reject classes are intentionally narrow:

- obvious sales/listing content;
- obvious informational/guide content without lived or strongly explicit friction;
- obvious commercial content without friction;
- positive-only content without friction;
- missing search text.

Critical high-recall invariant:

> Lived/narrative evidence or strongly explicit friction always survives the Discovery Prefilter, even when the title also resembles a guide or commercial surface.

News/report-style or otherwise ambiguous material is not automatically rejected here. Provenance and first-hand authority remain later-stage responsibilities.

Rejected bodies are not retained in the discovery result object. Telemetry keeps only counts, reason codes, source platform, external identity, and index.

## Query-space expansion

Implementation:

```text
lib/sources/discovery-query-plan.mjs
```

Version:

```text
source-discovery-plan-v0.1
```

The initial deterministic query space covers:

```text
12 domains
× 2 subject variants
× 8 friction-expression families
= 192 queries
```

At the current Naver result limit of 50 per request:

```text
192 × 50
= 9,600 search-result opportunities per full plan pass
```

The full plan is not executed automatically.

Default campaign batch:

```text
24 requests × 50
= up to 1,200 search-result opportunities
```

This keeps expansion measurable and allows query allocation to change before the next batch.

## Yield telemetry

Migration:

```text
032_source_discovery_telemetry.sql
```

`ar_source_ingestion_runs` gains:

```text
discovery_policy_version
discovery_continue_count
discovery_reject_count
discovery_reason_counts
admission_candidate_count
admission_review_count
admission_reject_count
```

Existing run fields already preserve:

```text
fetched_count
inserted_count
duplicate_count
skipped_count
```

Together these support query-level measurement of:

```text
cheap reject rate
new Source rate
duplicate rate
Source Admission candidate rate
```

Phase 15.8A does not claim independent-Incident yield because formation outcomes are not yet persisted comprehensively for all discovered Sources. Adaptive logic must not fabricate that metric.

## Adaptive request budget

The query scorer uses only observed acquisition/admission telemetry.

It rewards:

- new unique Source supply;
- higher Source Admission Candidate yield.

It penalizes:

- high duplicate rate;
- high cheap-reject rate.

Unmeasured queries retain an exploration priority. Initial exploration is domain-balanced through round-robin selection so one domain cannot consume the entire first batch.

This is acquisition-budget guidance, not evidence truth.

## Runtime integration

Manual Naver Blog and Threads ingestion now use:

```text
persistDiscoveredSourceSignals()
```

which performs:

```text
filterDiscoverySignals()
→ persist only continued Source Signals
→ calculate existing Source Admission outcomes for telemetry
→ close ingestion run with yield metrics
```

The historical Gold acquisition runner intentionally remains on:

```text
persistSourceSignals()
```

so Phase 15.8A does not retroactively alter the Gold/Blind calibration pool.

## Campaign runner

Script:

```text
scripts/run-source-discovery-campaign.mjs
```

Plan-only command:

```text
npm run acquire:discovery:plan
```

Live command:

```text
npm run acquire:discovery:live
```

Live execution is fail-closed unless both are true:

```text
--live
ALLOW_SOURCE_DISCOVERY_EXPANSION=1
```

The runner snapshots downstream product boundaries before and after the batch and requires them to remain identical.

## Preserved boundaries

Phase 15.8A does not authorize:

- lowering Source Admission thresholds;
- lowering full-context Formation thresholds;
- treating Source count as Incident count;
- automatic Incident creation;
- automatic Public Problem creation/publication;
- blind 120 reads or mutations;
- full source-body fetches;
- LLM calls in the Discovery Prefilter;
- automatic execution merely because code is deployed.

Expected live mutation scope is only:

```text
ar_source_ingestion_runs
ar_source_signals
ar_source_signal_observations
```

No Public Problem, Public Evidence, Source Incident, Raw Input, or Pain Evidence mutation is permitted by the campaign runner.

## Next empirical gate

After migration and CI, the first live pilot should run a bounded discovery batch rather than the full 192-query plan.

The pilot must report at minimum:

```text
fetched
cheap rejected
continued
new Sources
duplicates
admission Candidates
admission Reviews
admission Rejects
reason-code distribution
per-query yield
```

Only after observing those numbers should request depth, query families, and source adapters be expanded further.
