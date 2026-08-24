# Phase 15.6E — Curator Review / Publication Readiness

## Status

CLOSED

## Purpose

Phase 15.6D made Incident identity part of persisted Public Evidence and hardened the database publication gate. The previous curator console still displayed the older Source-only readiness rule and could show `Publish 가능` when only `2 distinct source_key` values existed.

Phase 15.6E aligns the curator-facing read model and explicit publication action with the incident-aware database truth.

## Curator detail read model

`loadAdminPublicProblemDetail()` now loads only the minimum curator-facing provenance needed for review:

```text
Public Problem
Public Evidence snapshots
Source Incident links
Source Incidents
minimal Source Signal metadata
legacy Private Problem Card lineage
```

The Source Signal projection deliberately excludes `raw_text`. Full source bodies remain outside the curator detail payload.

Each Evidence row is enriched with:

```text
source_signal
incident
incident_lineage_valid
```

The detail also exposes an Incident summary collection with:

```text
incident_key
label
source_count
evidence_count
source_signal_ids
evidence_ids
```

## Server-side structural readiness

`lib/radar/publication-readiness.mjs` deterministically mirrors the hardened DB publication gate.

A draft is structurally publishable only when:

1. title exists;
2. summary exists;
3. at least two Evidence snapshots exist;
4. at least two distinct `source_key` values exist;
5. every Evidence snapshot has Incident identity;
6. at least two distinct Incidents exist;
7. every publication basis is allowed;
8. every `external_public` Evidence Source Signal is actually bound to its Incident.

The projection always reports:

```text
editorially_approved: false
```

Structural readiness is therefore not publication authority.

## Curator UI

The editor now shows:

- Incident Lineage as a first-class section;
- independent Incident count;
- Source count and Evidence count per Incident;
- Evidence excerpt + source + Incident identity;
- Source↔Incident lineage verification state;
- incident-aware publication checklist;
- distinct Source and distinct Incident counts separately.

The legacy manual Evidence form remains available for compatibility, but the UI explicitly states that manually inserted Evidence lacks Incident identity and remains draft-only until lineage is supplied through the governed persistence path.

## Explicit publication intent

A structurally publishable draft is still not publishable from the UI until the curator explicitly checks:

> Incident lineage와 공개 Evidence를 직접 검토했으며 이 Problem을 공개할 의사가 있습니다.

The status API independently requires:

```text
status = published
AND publication_confirmed = true
```

Without that confirmation the route returns `publication_confirmation_required` and does not invoke the DB status transition.

The database then re-runs `ar_assert_public_problem_publishable()` through the existing status RPC.

Therefore publication has three distinct boundaries:

```text
server read-model structural readiness
        ↓
explicit curator publication confirmation
        ↓
database publication assertion
```

No one boundary substitutes for another.

## Verification / closeout

Implementation PR:

```text
PR #59
merge SHA: 9db88fbfafd794df906dfc97d194b0c9cdf06084
CI: SUCCESS
PIE Prospective Shadow: SUCCESS
```

Post-merge live database verification was read-only and confirmed:

```text
Canonical Public Problems: 2
Draft Problems:            2
Published Problems:        0
Public Evidence snapshots: 5
Source Incidents:           4
Source→Incident links:      5
Public feed rows:           0
```

No publication action was executed during implementation, CI, merge, or live verification.

## CD policy transition

The earlier repository-level Vercel Git deployment pause is no longer part of the project authority.

The closeout removes:

```text
vercel.json -> git.deploymentEnabled = false
```

and removes the regression test that required Git auto-deployments to remain disabled.

After the closeout merge, repository configuration no longer suppresses Vercel Git-triggered deployment. Whether an actual deployment occurs is governed by the connected Vercel project's Git integration and branch/deployment settings.

This CD policy change does not alter Public Radar publication authority. A deployed curator UI still cannot publish a Problem without:

```text
incident-aware structural readiness
+ explicit curator publication confirmation
+ database publication assertion
```

## Boundaries

- automatic Public Problem publication: forbidden;
- blind 120: untouched;
- full source bodies: not loaded into curator detail or persisted;
- no new DB migration required;
- live closeout verification was read-only;
- no claim that structural publishability is editorial approval;
- repository-level Vercel Git deployment pause removed as a separate delivery-policy change.
