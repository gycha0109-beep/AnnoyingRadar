# Phase 15.9AA — Threads Carrier-Feature Acquisition

## Status

CLOSED — implementation verified; live acquisition was blocked at required-secret validation before the runner executed. No provider request or database write occurred.

## Purpose

Phase 15.9AA changed the acquisition surface from Naver Blog search to the existing governed Threads keyword-search adapter. Its sole goal was to increase Source Signal supply for a possible second distinct carrier/CSC feature-restriction Incident.

The phase did not create or approve an Incident and did not authorize any Public Problem, Public Evidence, Public Feed, or publication mutation.

## Implementation verification

Implementation PR #178 used exact head `92f0cf49d3e40403058cc0c473b95fe953139a7c`.

- PR CI #566: SUCCESS
- PIE Prospective Shadow #175: SUCCESS
- expected-head merge: SUCCESS
- implementation main: `b181ebde99330a73b39fe94c060307be89237878`
- merged-main CI #567: SUCCESS

The merged-main CI job passed lint, unit/contract tests, release hardening, build, and runtime smoke before the live workflow was triggered.

## Frozen search plan

Four focused Korean keyword expressions were each configured once with `TOP` and once with `RECENT`, for exactly eight bounded provider requests at at most 50 results each.

- `자급제 채팅플러스`
- `자급제 투폰`
- `자급제 넘버플러스`
- `CSC 변경 기능`

The search focus was discovery provenance only. Search relevance was never a problem signature, Formation decision, Incident decision, or publication authority.

## Live result

GitHub Actions workflow `Source Threads Carrier Feature Acquisition 15.9AA` ran against exact main `b181ebde99330a73b39fe94c060307be89237878`.

- run id: `33233613569`
- required-secret validation: FAILED
- bounded acquisition runner: SKIPPED
- provider requests executed: 0
- model calls: 0
- acquisition database writes: 0

The workflow reused the same Supabase secret names that had already succeeded in the preceding governed acquisition path; `THREADS_ACCESS_TOKEN` was the only newly introduced required credential. The result is therefore consistent with the Threads operational credential not being configured in the repository environment. No credential value was inspected or exposed.

## Independent database readback

After the failed live workflow, direct Supabase readback confirmed:

- Source Signals: 3893
- Source Observations: 4278
- Source Ingestion Runs: 160
- Phase 15.9AA campaign runs: 0
- Threads Sources: 0
- full-context outcomes: 86
- Formation assessments: 3
- Source Incidents: 7
- Source→Incident links: 9
- curator decisions: 2
- incident executions: 2
- Public Problems: 3
- Public Evidence: 7
- Public Feed: 3

These values confirm that the live probe stopped before any Source supply or downstream mutation.

## Credential and execution boundary

The live runner required both:

- `ALLOW_PHASE15_9AA_THREADS_CARRIER_FEATURE_ACQUISITION=true`
- `THREADS_ACCESS_TOKEN`

The temporary workflow validated required secrets before invoking the runner. The runner itself also checked the Threads credential before creating the Supabase service client. Both layers were fail-closed.

## Authorized mutations

Had the credential gate passed, only these Source supply domains were authorized to change:

- `ar_source_ingestion_runs`
- `ar_source_signals`
- `ar_source_signal_observations`

All downstream domains remained frozen:

- Raw Inputs
- Pain Evidences
- full-context resolution outcomes
- Formation assessments
- Source Incidents and links
- curator decisions and executions
- Public Problems
- Public Evidence
- Public Feed

No external model call was authorized.

## Protected CSC baseline

The campaign preserved the governed carrier/CSC boundary:

- exactly one governed Incident with key `carrier_csc_feature_restriction_case`
- exactly two Sources linked to that Incident
- zero Public Evidence rows for that Incident

The Public Problem draft gate therefore remains blocked until a second distinct governed Incident exists.

## Artifact privacy and provenance

The runner was designed so a successful disposable artifact would not expose provider post IDs, Source UUIDs, URLs, author handles, raw post text, curator IDs, Incident IDs, Public Problem IDs, provider request IDs, or credentials.

As established by Phase 15.9Z, any future follow-up Source must use the final canonical database row after its acquisition campaign as authority for downstream binding.

## Closeout

The temporary workflow is removed during this closeout so future successful main CI runs cannot retrigger the credential-blocked probe.

The phase-specific plan and runner remain as reproducible, tested implementation evidence, but no future live execution is authorized merely by their presence.

## Human authority boundary

No Source candidate or Formation was created by this phase. If a future acquisition path later yields an eligible Formation, a new second Incident still requires a separate explicit human curator decision. Public Problem publication remains separately unauthorized.
