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

### Environment bootstrap diagnosis

The Supabase SSR auth client already reads `NEXT_PUBLIC_SUPABASE_URL` plus the current publishable key with the legacy anon-key fallback. The login failure therefore must not be treated as an unsupported anon-key naming problem.

The unstable boundary was the local server lifecycle: the browser runner previously relied on the spawned Next.js process to rediscover project env files, and the fixed default port could also cause the runner to reuse an unrelated or stale server that it did not start.

The continuation adds a dedicated environment bootstrap before the existing Playwright runner:

1. Resolve the AnnoyingRadar project root from the script location.
2. Load `.env.development.local`, `.env.local`, `.env.development`, and `.env` into the parent Node process without printing values.
3. For the managed local mode, fail before launching a browser unless the Supabase URL, public auth key, elevated server key, and OpenAI key are available.
4. Allocate a dedicated loopback port and pass it through `E2E_BASE_URL` so the run owns the local server it is testing.
5. Spawn the existing browser runner with the same `process.env` and project-root `cwd`.
6. The existing runner then spawns `next dev` with the same environment, so Server Actions and API routes receive the same configuration.

An explicitly supplied `E2E_BASE_URL` remains an advanced escape hatch for testing an already-running application. In that mode the external application's environment remains its own responsibility.

### Supabase client contract

- Browser client: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with `NEXT_PUBLIC_SUPABASE_ANON_KEY` retained only as a legacy fallback.
- Server SSR/auth client: the same URL and public-key contract, with request cookies managed through `@supabase/ssr`.
- Server service client: the same project URL + `SUPABASE_SECRET_KEY`, with `SUPABASE_SERVICE_ROLE_KEY` retained only as a legacy fallback.
- Elevated keys remain server-only and are never accepted through a `NEXT_PUBLIC_` variable.

### Why this is local rather than interactive GitHub CI

A GitHub-hosted runner cannot expose an interactive browser window to the operator. The reliable boundary is a local headful Playwright process using the same application and database contracts that production uses.

### Authentication boundary

- The script never reads an email or password.
- The script never writes Playwright storage state or Supabase tokens to disk.
- Authentication is detected by the authenticated dashboard and logout control.
- Every subsequent request uses the browser context's real cookie session.

### Server lifecycle

- `npm run e2e:live` uses the environment bootstrap and a dedicated ephemeral `127.0.0.1` port by default.
- `E2E_BASE_URL` may explicitly point to an already running local or remote application.
- When managed local mode is used, the runner starts `next dev` automatically and stops that process during cleanup.
- The parent bootstrap and child Next.js process share the same resolved environment.

### Live-provider boundary

- Evidence extraction and Candidate grouping use the existing live application endpoints.
- The runner does not call OpenAI directly and does not inspect the OpenAI key value.
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

## Independent review checklist

The continuation must be reviewed against these failure modes before merge:

- No secret or service-role value is logged, written to artifacts, or exposed through browser-visible env names.
- Existing shell env retains precedence over local env files.
- Legacy anon/service-role deployments remain supported during key migration.
- The default command cannot silently attach to a stale process on port 3000.
- Manual authentication remains the only required human interaction.
- The existing adaptive Candidate structure path is unchanged by the bootstrap fix.
- CI remains non-interactive; the headful live gate is verified separately by the operator.

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

- `E2E_BASE_URL`: optional explicit application URL; when omitted, the bootstrap allocates a dedicated loopback port
- `E2E_LOGIN_TIMEOUT_MS`: login wait, default 10 minutes
- `E2E_AI_TIMEOUT_MS`: live AI operation timeout, default 4 minutes
- `E2E_KEEP_OPEN=1`: keep the browser open after success or failure
- `E2E_RAW_TEXT`: override the deterministic complaint text

Managed local mode requires the project environment to provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

## Acceptance criteria

- Browser launches headfully.
- Login is the only required human interaction.
- No authentication material is persisted.
- Environment bootstrap completes before the managed local server starts.
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
