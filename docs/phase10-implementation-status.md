# Phase 10 Implementation Status

Status: `PHASE_10_LIVE_BROWSER_GATE_RECHECK_REQUIRED`

## Branch

`agent/phase10-idea-board`

## Baseline

`main@01afbedd52333e646b85489d020d0d478f29f541`

## Current implementation

- `/ideas` is a Kanban projection over the existing Idea Candidate lifecycle.
- Existing canonical statuses and status mutation API/RPC are reused.
- Project membership is an optional filter only.
- Board reads use a bulk projection without per-Idea Project queries.
- Project filter navigation remounts the Board to prevent stale client state.
- No Board table, status vocabulary, ranking, or manual board position was added.
- No DB migration is required.

## Live Browser E2E remediation

The first manual-login live run completed the functional lifecycle flow and restored the canonical Idea status, but browser diagnostics exposed a React hydration mismatch in Board date rendering.

Root cause:

- SSR Node rendered `toLocaleString("ko-KR")` with `AM`.
- The browser rendered the same timestamp with Korean `오전`.
- React therefore regenerated the client subtree during hydration.

Remediation:

- Board date rendering no longer uses locale-sensitive APIs.
- Timestamps are rendered through deterministic numeric KST formatting.
- UUID tie-break sorting no longer depends on `localeCompare`.
- `npm run e2e:idea-board:live` now enters through a strict wrapper.
- The strict wrapper fails the command if `page-errors.log` is non-empty or browser diagnostics contain a hydration error.

Hosted postrun verification confirmed the exercised Idea returned to `build_soon` and the linked Research Project remained `archived`.

## Automated gate

Exact head before this documentation-only update:

`eb041d27bd475ae2f7210c03a2a065849d3bf4a2`

CI #90 / run `31979318477`: SUCCESS

- install PASS
- lint PASS
- unit + contract tests PASS
- release hardening PASS
- build PASS
- runtime smoke PASS

Because this status document is committed after CI #90, the new exact head must pass CI again before merge.

## Remaining gate

Run the strict manual-login browser gate again after syncing the branch:

```text
npm run e2e:idea-board:live
```

The release gate is satisfied only when both markers appear:

```text
IdeaBoardLiveE2E: PASS (...)
IdeaBoardLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)
```

After that pass: exact-head/main recheck -> PR ready -> merge -> merged-main exact-SHA CI -> Phase 10 closeout.
