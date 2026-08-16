# Phase 9 — Research Projects / UC-12

## Status

- Baseline: `main@d401d8ea4a1e85658c0b71ec781817073c582053`
- Upstream: Phase 7 Idea Candidate + Phase 8 Saved Problem complete
- Scope: Research Project grouping layer for Saved Problems and Idea Candidates
- Out of scope: Idea Board/Kanban, ranking/scoring, comparison, competitor research, reports/export, tasks/deadlines/collaboration

## Domain identity

```text
Research Project = ar_research_projects.id
Problem Card = confirmed ar_problem_candidates.id
Saved Problem = ar_saved_problem_cards management projection
Idea Candidate = ar_idea_candidates.id
```

Research Project is a user-owned research context. It does not replace or own the canonical Problem Card or Idea Candidate identities.

## Project metadata

```text
id
user_id
title
purpose
status active | archived
created_at
updated_at
```

Phase 9 intentionally omits category, progress, task, deadline, member and sprint fields.

## Membership

Problem and Idea membership are explicit typed N:M links:

```text
ar_research_project_problem_links
(project_id, problem_candidate_id)

ar_research_project_idea_links
(project_id, idea_candidate_id)
```

A Problem Card may be newly linked only when its Saved Problem row exists and is `active`. This does not change Phase 7 Idea-generation eligibility.

An Idea Candidate may be linked directly without requiring its source Problem Card to be saved or linked to the same Project. Problem membership never auto-inherits to Ideas.

## Lifecycle

```text
active <-> archived
```

Archived Projects are read-only until restored.

Project archive must not change:

- Problem Candidate status
- Saved Problem status
- Idea Candidate status/history
- Project membership rows
- Phase 7 Idea-generation eligibility

There is no Project hard-delete API.

## Unlink semantics

Unlink physically removes only the association row. It never deletes or changes the linked Problem Card, Saved Problem or Idea Candidate.

## Security/write boundary

```text
Browser
-> authenticated Next.js API
-> service-role server client
-> guarded Postgres RPC
```

- RLS enabled on Project and link tables
- authenticated users read only their rows
- no authenticated direct INSERT/UPDATE/DELETE grants
- server owner checks before mutation RPCs
- DB trigger/RPC owner and eligibility revalidation

## API

```text
GET  /api/research-projects?status=active|archived|all
POST /api/research-projects

GET   /api/research-projects/{projectId}
PATCH /api/research-projects/{projectId}
PATCH /api/research-projects/{projectId}/status

GET    /api/research-projects/{projectId}/link-options
POST   /api/research-projects/{projectId}/problems
DELETE /api/research-projects/{projectId}/problems/{problemCandidateId}
POST   /api/research-projects/{projectId}/ideas
DELETE /api/research-projects/{projectId}/ideas/{ideaId}

GET /api/problem-candidates/{candidateId}/projects
GET /api/idea-candidates/{ideaId}/projects
```

Project metadata, lifecycle, Problem membership and Idea membership remain separate mutation boundaries.

`POST /api/research-projects` optionally accepts `initial_problem_candidate_id` so Saved Problem -> create Project -> link is persisted transactionally in one DB RPC.

## UI

### `/projects`

- active/archive Project library
- create Project
- title/purpose/status
- linked Saved Problem count
- linked Idea count
- re-entry

### `/projects/{projectId}`

- metadata edit
- archive/restore
- linked Saved Problems
- linked Idea Candidates
- explicit link/unlink
- original asset re-entry

### `/problems`

Each Saved Problem shows Project memberships. Active Saved Problems can connect to an existing active Project or create-and-link a new Project.

### Problem Card detail

Saved Problem cards expose a Research Project panel. Unsaved Problem Cards do not expose Project membership controls.

### Idea detail

Idea Candidates expose explicit Project memberships. Source Problem membership is never inherited automatically.

The global `/ideas` page remains a lightweight list, not an Idea Board.

## Release gate

Deterministic verification covers:

- minimal Project lifecycle
- metadata/status boundary separation
- typed N:M link tables
- Saved Problem prerequisite for Problem links
- no Saved prerequisite for Idea links
- archive independence
- association-only unlink
- owner-scoped RLS
- service-role-only write RPCs
- UI remains grouping-only

Hosted verification must confirm migration poststate and functional RPC behavior.

Manual-login live browser gate:

```text
npm run e2e:projects:live
```

It discovers only recent `[AR-E2E:]` completed sources through authenticated APIs and verifies:

```text
manual login
-> find active Saved Problem + existing Idea
-> create Project from /problems and link Saved Problem
-> Project detail re-entry
-> metadata edit
-> explicit Idea link
-> unlink/relink Idea
-> archive
-> archived-library re-entry
-> restore + reload persistence
-> final archive of E2E Project fixture
```

Existing user assets are never selected as source fixtures.
