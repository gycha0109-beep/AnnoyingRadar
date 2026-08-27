import { createHash } from "node:crypto";

export const PHASE15_9D_VERSION = "phase15.9d-telecom-rejection-diagnostics-v0.1";
export const PHASE15_9D_EXPECTED_REJECT_COHORT = 313;
export const PHASE15_9D_PER_STRATUM = 4;
export const PHASE15_9D_SAMPLE_SIZE = 16;

export const PHASE15_9D_REJECTION_STRATA = Object.freeze([
  "title_no_complaint_signal",
  "snippet_information_only",
  "title_truncated_no_complaint_signal",
  "title_information_or_guide",
]);

export function phase15_9DStableHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}
