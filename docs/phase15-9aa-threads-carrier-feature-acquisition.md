# Phase 15.9AA — Threads Carrier-Feature Acquisition

## Status

Implementation pending live verification.

## Purpose

Phase 15.9AA changes the acquisition surface from Naver Blog search to the existing governed Threads keyword-search adapter. Its sole goal is to increase Source Signal supply for a possible second distinct carrier/CSC feature-restriction Incident.

The phase does not create or approve an Incident and does not authorize any Public Problem, Public Evidence, Public Feed, or publication mutation.

## Frozen search plan

Four focused Korean keyword expressions are each queried once with `TOP` and once with `RECENT`, producing exactly eight provider requests. Each request is bounded to at most 50 results.

- `자급제 채팅플러스`
- `자급제 투폰`
- `자급제 넘버플러스`
- `CSC 변경 기능`

The search focus is discovery provenance only. Search relevance is not a problem signature, Formation decision, Incident decision, or publication authority.

## Credential and execution boundary

The live runner requires both:

- `ALLOW_PHASE15_9AA_THREADS_CARRIER_FEATURE_ACQUISITION=true`
- `THREADS_ACCESS_TOKEN`

The Threads credential guard runs before the Supabase service client is created. Missing credentials therefore fail closed before any ingestion run or database write can occur.

The temporary GitHub Actions workflow runs only after successful push CI on `main`, checks out exactly `github.event.workflow_run.head_sha`, validates required secrets, and retains disposable artifacts for one day.

## Authorized mutations

Only these Source supply domains may change:

- `ar_source_ingestion_runs`
- `ar_source_signals`
- `ar_source_signal_observations`

The runner snapshots and asserts all downstream domains remain unchanged, including:

- Raw Inputs
- Pain Evidences
- full-context resolution outcomes
- Formation assessments
- Source Incidents and links
- curator decisions and executions
- Public Problems
- Public Evidence
- Public Feed

No external model call is authorized.

## Protected CSC baseline

Before and after the campaign the runner requires:

- exactly one governed Incident with key `carrier_csc_feature_restriction_case`
- exactly two Sources linked to that Incident
- zero Public Evidence rows for that Incident

The Public Problem draft gate therefore remains blocked until a second distinct governed Incident exists.

## Artifact privacy and provenance

The disposable artifact must not expose provider post IDs, Source UUIDs, URLs, author handles, raw post text, curator IDs, Incident IDs, Public Problem IDs, provider request IDs, or credentials.

Provider external identities are represented only by a SHA-256 fingerprint. Content is represented by its content SHA-256 and Admission metadata.

As established by Phase 15.9Z, acquisition-time artifact hashes are not sufficient authority for a downstream exact target. Any follow-up Source must be re-read from the canonical database after the campaign completes, and the final canonical row is authoritative for its content hash and downstream binding.

## Human authority boundary

Even if this campaign discovers a deterministic Admission candidate and a later Formation becomes eligible, a new second Incident still requires a separate explicit human curator decision. Phase 15.9AA itself cannot supply that approval.
