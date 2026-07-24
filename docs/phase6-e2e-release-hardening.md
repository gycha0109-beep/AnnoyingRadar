# Phase 6 — End-to-End QA & Release Hardening

## Objective

Close the v0.1 product loop before adding new product scope. The release boundary is a recoverable, owner-isolated workflow from Raw Input creation through confirmed Problem Cards and completed re-entry.

## Authoritative workflow

```text
input_saved
  -> extracting
  -> reviewing_evidence
  -> grouping
  -> reviewing_candidates
  -> completed
```

Failure and recovery paths:

```text
extracting -> extraction_failed -> extracting
grouping -> grouping_failed -> grouping
```

Explicit reset paths caused by Raw Input text replacement:

```text
extraction_failed | reviewing_evidence | grouping_failed | reviewing_candidates
  -> input_saved
```

The test-only Evidence fixture may move `input_saved` or `extraction_failed` directly to `reviewing_evidence`. Forced re-extraction may move `reviewing_evidence` back to `extracting`. Same-status writes are treated as metadata refreshes and are not state transitions.

## Scope

1. Add a database transition guard for `ar_raw_inputs.analysis_status`.
2. Add a shared application workflow contract for labels, terminal-state behavior, and transition checks.
3. Add deterministic end-to-end workflow tests covering the happy path, provider failures, retry, reset, and completed immutability.
4. Add release security contracts for owner scoping, recent-analysis limits, service-role exposure, and mutation-route authentication.
5. Upgrade runtime smoke coverage to verify public entry points and authenticated-route redirect behavior without secrets.
6. Improve recent-analysis status presentation and completed Problem Card presentation.
7. Add a concise manual browser gate for the only checks requiring the user's real login session and OpenAI key.

## Non-goals

- No new research, idea-generation, or scoring feature.
- No mobile-specific implementation.
- No browser-bundled service-role credentials.
- No fake production authentication bypass.
- No automatic live OpenAI call in CI.

## Design review findings

### State integrity

A status value check existed, but no table-level transition check existed. Individual RPCs validated their own entry conditions; a future privileged write could still skip the intended state graph. Phase 6 adds a `BEFORE UPDATE OF analysis_status` trigger as the final invariant boundary.

### Compatibility exceptions

The transition guard must preserve existing intentional paths:

- Raw-text replacement resets eligible unfinished work to `input_saved`.
- Forced Evidence extraction can restart from `reviewing_evidence`.
- Deterministic fixture preparation can enter `reviewing_evidence` without a provider call.
- Stale attempt takeover updates may retain `extracting` or `grouping`.

### E2E strategy

A real browser run with the user's Supabase session and OpenAI key remains a manual gate. CI uses deterministic workflow, route, security, build, and runtime tests. No hidden test-only authentication endpoint is introduced.

### Security strategy

All mutation routes must authenticate, pass the authenticated `userId` into guarded RPCs, and avoid service-role material in client modules. The database transition trigger executes regardless of the caller.

## Automated acceptance criteria

- Allowed happy-path transitions pass.
- Failure and retry transitions pass.
- Reset transitions pass only from explicitly allowed unfinished states.
- `completed` has no outgoing transition.
- Unsupported jumps fail with SQLSTATE `23514`.
- Recent analyses remain owner-scoped, ordered by `updated_at`, and limited to three.
- Mutation routes retain authentication and owner/RPC scoping.
- No client module references the service-role key.
- Lint, unit/contract tests, build, release E2E tests, and runtime smoke pass.

## Manual browser gate

1. Log in and create a Raw Input.
2. Run live Evidence extraction and confirm Evidence.
3. Run live Candidate grouping.
4. Exercise edit, move or split, merge, confirm, and discard/restore as applicable.
5. Complete review and confirm only Problem Cards remain prominent.
6. Return to the dashboard and re-enter the completed analysis from the recent-three list.
7. Refresh the completed page and verify no mutation controls reappear.
