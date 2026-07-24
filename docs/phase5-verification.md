# Phase 5 Verification

## Scope

Problem Candidate review and confirmation vertical slice.

## Database verification

Rollback-based integration fixture: PASS.

Covered:

- Candidate metadata update
- Evidence move between draft Candidates
- Singleton source protection
- Candidate split
- Candidate merge
- Discard, restore, re-discard
- Candidate confirmation
- Review completion
- Stored evidence_count synchronization
- completed analysis status transition

## Review gates

- Every active Candidate has at least one Evidence.
- Evidence cannot overlap active Candidates.
- Merge and split are draft-only.
- Candidate mutations require reviewing_candidates.
- Completion requires at least one confirmed Problem Card and no remaining drafts.
- Confirmed Problem Cards require title, summary, and Evidence.
- All write RPCs are service-role only.
