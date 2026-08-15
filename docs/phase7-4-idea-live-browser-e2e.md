# Phase 7.4 — Idea Review Live Browser E2E / Release Hardening

## Goal

Phase 7.4 extends the existing headed manual-login browser release gate through the Phase 7 Idea workflow.

The release path is now:

```text
manual login
→ Raw Input
→ live Evidence extraction/review
→ live Candidate grouping/review
→ confirmed Problem Card
→ completed analysis
→ recent re-entry/read-only verification
→ Problem Card → Idea Candidate generation
→ Idea detail edit
→ candidate → researching → build_soon
→ status history verification
→ reload persistence verification
→ /ideas re-entry verification
```

The only human action remains authentication in the headed browser. There is no additional human action after login.

## Scope

Phase 7.4 does not add product behavior, schema, lifecycle states, or generation logic. It exercises the already-merged Phase 7.1–7.3 contracts through the real browser and real hosted services.

The existing `npm run e2e:live` command remains the release command. The runner keeps one browser context and one authenticated session for the complete flow.

## Idea assertions

The runner must verify all of the following:

1. A completed, confirmed Problem Card exposes the Idea generation surface.
2. Live OpenAI generation returns 1–3 persisted Idea Candidates.
3. The first generated Idea opens through `/idea-candidates/{ideaId}`.
4. A content edit persists through the owner-scoped PATCH API and database RPC.
5. Status transitions execute in order: `candidate → researching → build_soon`.
6. Status history contains creation plus both transitions.
7. Reload preserves the edited title and `build_soon` state.
8. `/ideas` contains the same Idea Candidate with the edited title and state.
9. Re-entering from `/ideas` preserves the same content and state.

## Environment boundary

The bootstrap continues to load project environment files before starting the runner and starts Next.js from the repository root. Live Evidence, Candidate, and Idea provider calls therefore use the same server-side environment as the application.

No API key, password, Supabase token, Playwright storage state, or reusable login secret is written to artifacts.

## Diagnostics

The existing artifact policy remains authoritative. Every run stores:

- step screenshots
- Playwright trace
- browser console messages
- page errors
- failed requests
- `result.json`
- local Next.js server log when the runner owns the server

Phase 7.4 adds Idea fields to `result.json`:

```text
idea_candidate_count
idea_candidate_id
idea_title
idea_status
idea_history_verified
idea_reentry_verified
```

## CI boundary

GitHub CI remains deterministic and does not execute the headed live workflow or require live OpenAI credentials.

CI validates:

- runner syntax
- release contract tests
- lint
- unit/contract tests
- release hardening
- build
- runtime smoke

The human-operated live browser run is an explicit pre-merge release gate for Phase 7.4.

## Merge lifecycle

Phase 7.4 is complete only after:

```text
implementation
→ deterministic CI on exact PR head PASS
→ operator runs npm run e2e:live
→ LiveBrowserE2E PASS through Idea re-entry
→ PR exact head rechecked
→ merge
→ merged-main exact-SHA CI PASS
```

A CI pass without the live browser result is not sufficient to close Phase 7.4.
