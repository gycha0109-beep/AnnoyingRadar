# Phase 6.1 — Manual-Login Live Browser E2E

## Objective

Reduce the final v0.1 browser gate to one human action: authenticate in the browser that the test opens. After authentication, the runner executes and verifies the complete live product workflow with the user's real Supabase session and configured OpenAI key.

## Operator contract

```text
npm install
npm run e2e:live
```

The runner opens Chromium. The operator logs in. No additional clicks are required unless the run fails and the browser is intentionally kept open for diagnosis.

## Authoritative flow

```text
manual login
  -> create Raw Input
  -> live OpenAI Evidence extraction
  -> edit and optionally delete Evidence
  -> confirm Evidence
  -> live OpenAI Candidate grouping
  -> edit Candidate
  -> discard and restore Candidate
  -> move Evidence when the live graph exposes a valid source and sibling
  -> merge and split Candidate structure adaptively
  -> confirm every active Candidate as a Problem Card
  -> complete review
  -> dashboard recent-three re-entry
  -> refresh completed analysis
  -> verify Problem Card read-only state
```

## Design review

### Why this is local rather than interactive GitHub CI

A GitHub-hosted runner cannot expose an interactive browser window to the operator. The reliable boundary is a local headful Playwright process using the same application and database contracts that production uses.

### Authentication boundary

- The script never reads an email or password.
- The script never writes Playwright storage state or Supabase tokens to disk.
- Authentication is detected by the authenticated dashboard and logout control.
- Every subsequent request uses the browser context's real cookie session.

### Server lifecycle

- `E2E_BASE_URL` may point to an already running local or remote application.
- When the default loopback URL is unavailable, the runner starts `next dev` automatically.
- A server started by the runner is stopped during cleanup.

### Live-provider boundary

- Evidence extraction and Candidate grouping use the existing live application endpoints.
- The runner does not call OpenAI directly and does not inspect the OpenAI key.
- Provider failures are surfaced as test failures with screenshots, trace, browser console, and request-failure logs.

### Adaptive Candidate structure coverage

AI grouping cardinality is nondeterministic. The runner therefore inspects the generated Candidate graph:

1. If a Candidate has at least two Evidence items and a draft sibling, move one Evidence through the real review UI.
2. If the current Candidate still has at least two Evidence items, split one item and merge the created Candidate back.
3. If the current Candidate becomes a singleton but has a draft sibling, merge first, then split and merge back.
4. When the live graph has no valid movement topology, record Evidence movement as skipped rather than manufacturing data or bypassing constraints.
5. Fail the structural gate only when merge and split cannot both be exercised from the generated Evidence graph.

### Test-data policy

The Raw Input begins with a unique `AR-E2E` marker and records the same marker in `source_memo`. The run does not add a privileged cleanup endpoint. The generated completed analysis remains as auditable live evidence and can be identified from the dashboard.

## Diagnostics

Each run writes to:

```text
artifacts/live-browser-e2e/<run-id>/
```

Artifacts include:

- step screenshots
- Playwright trace
- result JSON, including whether Evidence movement was exercised
- browser console messages
- browser page errors
- failed network requests
- auto-started development-server log

## Environment options

- `E2E_BASE_URL`: application URL, default `http://127.0.0.1:3000`
- `E2E_LOGIN_TIMEOUT_MS`: login wait, default 10 minutes
- `E2E_AI_TIMEOUT_MS`: live AI operation timeout, default 4 minutes
- `E2E_KEEP_OPEN=1`: keep the browser open after success or failure
- `E2E_RAW_TEXT`: override the deterministic complaint text

## Acceptance criteria

- Browser launches headfully.
- Login is the only required human interaction.
- No authentication material is persisted.
- Raw Input creation is verified through the UI.
- Live Evidence extraction and review complete.
- Evidence movement runs when the generated topology permits it.
- Candidate merge and split both complete.
- All active Candidates become Problem Cards.
- Analysis transitions to `completed`.
- Dashboard recent-three re-entry targets the same Raw Input.
- Completed analysis remains read-only after refresh.
- Failures retain actionable screenshots, trace, and logs.
- Static contract tests and the existing CI suite pass.
