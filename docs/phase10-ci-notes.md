# Phase 10 Release Notes

## Change summary

Phase 10 evolves the existing `/ideas` review list into an Idea Candidate Kanban Board without creating a parallel Board domain.

## Domain invariants

- canonical identity remains `ar_idea_candidates.id`
- lane state remains `ar_idea_candidates.status`
- Project membership remains explicit N:M context only
- `order_index` remains generation/review metadata and is not Kanban position
- status mutations continue through the existing authenticated API and service-role RPC

## Expected release verification

- deterministic tests and release hardening
- build/runtime smoke
- hosted no-schema-delta verification
- manual-login live Board flow with final status restoration
