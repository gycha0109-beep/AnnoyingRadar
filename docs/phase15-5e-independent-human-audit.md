# Phase 15.5E — Independent Human Audit

## Purpose

`source-admission-v0.7` passed the 669-signal development-pool revalidation, but the PASS does not prove that all 659 REJECT signals are true negatives.

This audit answers a narrower question:

> Are the small boundary set and the apparent absence of clear false negatives credible under an independent human check?

The audit is verification-only. It does not change Source Admission rules, create Pain Evidence, or publish Problems.

## Independence rule

The audit must not reuse the production admission regexes as its false-negative detector.

The runtime gate is used only to partition the already blind-safe development pool into candidate / boundary / reject. A separate high-recall audit probe then searches REJECT titles/snippets for structural harm patterns such as blocked access, long waits, forced replacement, cost shock, repeated failure, unilateral change, contact breakdown, unpaid money, and repeated wasted trips.

A probe match is not a classification. It only selects a REJECT for human inspection.

## Blind boundary

The existing 120-signal blind evaluation set remains excluded before the audit manifest is created.

The audit therefore operates only on the campaign development pool:

- campaign pool: 789 at the last accepted v0.7 revalidation
- blind evaluation: 120 excluded
- development pool: 669

These counts are runtime-read and must not be hard-coded as authority.

## Human sets

### Set A — Boundary

All current `review` items are shown one by one.

The page does not display the production decision or production reason codes beside the item. The human chooses:

- `candidate`: title/context is already complaint-central enough
- `review`: original source context is genuinely needed
- `reject`: not a Problem Discovery complaint source

### Set B — Adversarial

Current REJECT items matched by the independent high-recall audit probe are shown for false-negative inspection.

The human uses the same three labels. A human `candidate` here is a clear false-negative signal for the runtime gate. A human `review` is a possible false-negative / uncertainty signal. A human `reject` is a correct reject.

### Set C — Random control

After Set B items are removed, up to 100 remaining REJECT items are selected using a fixed SHA-256 seed.

This protects against only auditing patterns we already know how to describe. The sample and the development-pool fingerprint are deterministic.

## Storage isolation

Human audit labels are not stored in Supabase and do not become product authority.

The browser stores labels under a localStorage key namespaced by:

- audit version
- Source Admission version
- development-pool fingerprint

The UI supports JSON/CSV export and JSON import so an audit can be moved between machines without writing to production tables.

## Original-source access

The page exposes the stored canonical URL for manual opening.

No automatic NAVER full-body crawler is introduced by this phase.

## Acceptance interpretation

A strong closeout result should show:

1. boundary items are overwhelmingly genuine `review` or conservative `candidate` cases rather than obvious rejects;
2. adversarial REJECT inspection finds no clear false negatives;
3. random REJECT control finds no clear false negatives;
4. candidate precision remains separately protected by the existing v0.7 revalidation;
5. blind 120 remains excluded;
6. external LLM/API calls remain zero;
7. production DB writes remain zero.

The audit result is evidence about the current 669-signal development pool. It is not a proof that future acquisition distributions cannot contain new failure modes.

## Curator route

`/curator/sources/audit`

The Source Lab page links to this route beside the normal Admission Queue.

## Production deployment

Vercel production deployment remains disabled. The audit can be used from a local development environment after pulling the merged branch and starting the app.
