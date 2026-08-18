# Phase 15.3 — Curator Console / Publication Workflow

## Status

Implemented candidate. Merge requires CI `npm run verify` success.

## Goal

Provide an internal curator surface that can take the existing Public Radar backend contract through a complete human-controlled publication workflow without exposing private/internal data on the public Radar.

## Routes

- `/curator` — curator-only publication queue and Draft creation
- `/curator/problems/{publicProblemId}` — curator-only Public Problem review/editor
- `/` — unchanged Public Radar
- `/radar/problems/{publicProblemId}` — unchanged public Problem detail
- `/workspace` — personal research workspace; Curator link is shown only when the signed-in user exists in `ar_radar_curators`

## Workflow

```text
Create Draft
  ↓
Edit public metadata
  ↓
Add / remove public-safe Evidence
  ↓
Optionally link confirmed Private Problem Cards as lineage
  ↓
Check publication readiness
  ↓
Publish
  ↓
Public Radar
```

Published Problems are immutable through the curator mutation APIs. Curators must:

```text
published → archived → edit → published
```

## Publication readiness

The UI mirrors the database publication gate but does not replace it.

A Problem is shown as publishable only when:

1. title is non-empty;
2. summary is non-empty;
3. at least 2 Public Evidence snapshots exist;
4. at least 2 distinct `source_key` values exist;
5. every Evidence uses `external_public` or `user_opt_in`.

The DB RPC validates these conditions again at status transition time.

## Evidence handling

Curators can add evidence with:

- excerpt;
- publication basis;
- source type;
- source label;
- source URL;
- source key;
- observed time;
- order index.

If `source_key` is omitted in the UI, Source URL is used as the stable key. If neither is present the client rejects the submission before calling the API.

## Lineage

The console can link or unlink a confirmed Private Problem Candidate by UUID.

Lineage remains internal and is not a publication requirement. Public read projections continue to exclude private candidate ids, curator ids, and `source_key`.

## Authorization

All curator pages require:

1. authenticated Supabase user;
2. matching row in `ar_radar_curators`.

All writes still go through the existing `/api/radar/admin/...` endpoints. Client components never receive a service-role secret and never call Supabase service-role APIs directly.

## Deployment gate

Automatic Vercel Git deployments are intentionally disabled during this development stage:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

This lock applies to all branches including `main` and must remain until a later phase explicitly requires deployed-environment verification.

## Non-goals

Phase 15.3 does not add:

- external Source Adapters;
- Threads/X ingestion;
- automatic publication;
- trend calculation;
- public Save/Follow/Alerts;
- company response workflow;
- new database tables or migrations.

## Next intended step

After Phase 15.3, the next product/data step is an external-source spike (initially one source) that supplies complaint candidates into the existing Evidence → Problem pipeline. Automatic Vercel deployment remains paused until deployed-environment verification becomes necessary.
