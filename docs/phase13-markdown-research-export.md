# Phase 13 — Deterministic Markdown Research Export

## Objective

Export existing research assets as deterministic Markdown without creating a new report lifecycle or persistence model.

Phase 13 implements three authenticated export surfaces:

- Problem Card
- Idea Candidate
- Research Project

## Core contract

For the same owned database snapshot, repeated export requests must return byte-for-byte identical Markdown.

The export renderer therefore does not include runtime-derived fields such as `generated_at`, `exported_at`, current time, random IDs, or AI-generated summaries.

All collections are re-ordered by stable canonical keys before rendering. User-authored text is escaped/quoted so it cannot silently change the report structure.

## Persistence boundary

No Phase 13 migration is required.

There is no:

- `reports` table
- export history
- report status
- report version lifecycle
- generated report content persisted back to Supabase

The database remains the canonical source. Export is an on-demand read projection.

## Export routes

Authenticated GET routes:

- `/api/exports/problem-candidates/{candidateId}`
- `/api/exports/idea-candidates/{ideaId}`
- `/api/exports/projects/{projectId}`

Responses use:

- `Content-Type: text/markdown; charset=utf-8`
- attachment `Content-Disposition`
- `Cache-Control: private, no-store, max-age=0`
- `X-Content-Type-Options: nosniff`

Ownership is enforced by the existing authenticated user context and owner-scoped service queries.

## Problem Card export

Includes:

- canonical Problem Card fields
- source analysis status
- evidence metrics
- Saved Problem metadata when present
- linked Evidence
- existing service / alternative notes
- linked Idea Candidates
- linked Research Projects

## Idea Candidate export

Includes:

- canonical Idea fields
- source Problem Card and metrics
- linked Evidence
- source Problem existing service / alternative notes
- generation provenance
- append-only status history
- linked Research Projects

## Research Project export

Includes:

- project title / purpose / status
- linked Problem Cards
- Saved Problem metadata
- Problem metrics
- existing service / alternative notes
- linked Idea Candidates and source Problem references

The Project export is a Phase 13 extension beyond the minimum historical UC-16 Problem/Idea export because Research Project is now a canonical v0.3 research asset.

## Explicit exclusions

Phase 13 does not add:

- AI report rewriting or conclusions
- automatic ranking or winner selection
- PDF/DOCX export
- public share URLs
- report collaboration
- report version history
- automatic competitor research
- external URL ingestion
- market-size research

## Verification

Static/unit verification must cover:

- stable ordering
- Markdown escaping
- deterministic bytes
- stable filenames
- private/no-store attachment headers
- all three authenticated routes

Strict live browser verification command:

`npm run e2e:markdown-export:live`

The live gate performs no DB mutation. It verifies each export twice through the authenticated API, compares bytes, then triggers the real UI download and compares downloaded bytes with the API response.

Accepted markers:

```text
MarkdownExportLiveE2E: PASS (...)
MarkdownExportLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)
```
