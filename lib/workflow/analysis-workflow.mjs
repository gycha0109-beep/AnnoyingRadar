export const ANALYSIS_STATUSES = Object.freeze([
  "idle",
  "input_saved",
  "extracting",
  "extraction_failed",
  "reviewing_evidence",
  "grouping",
  "grouping_failed",
  "reviewing_candidates",
  "completed",
]);

const STATUS_SET = new Set(ANALYSIS_STATUSES);

export const ANALYSIS_TRANSITIONS = Object.freeze({
  idle: Object.freeze(["input_saved"]),
  input_saved: Object.freeze(["extracting", "reviewing_evidence"]),
  extracting: Object.freeze(["reviewing_evidence", "extraction_failed"]),
  extraction_failed: Object.freeze(["input_saved", "extracting", "reviewing_evidence"]),
  reviewing_evidence: Object.freeze(["input_saved", "extracting", "grouping"]),
  grouping: Object.freeze(["reviewing_candidates", "grouping_failed"]),
  grouping_failed: Object.freeze(["input_saved", "grouping"]),
  reviewing_candidates: Object.freeze(["input_saved", "completed"]),
  completed: Object.freeze([]),
});

const STATUS_PRESENTATION = Object.freeze({
  idle: { label: "대기", stage: "input", terminal: false },
  input_saved: { label: "원문 저장", stage: "input", terminal: false },
  extracting: { label: "Evidence 추출 중", stage: "evidence", terminal: false },
  extraction_failed: { label: "Evidence 추출 실패", stage: "evidence", terminal: false },
  reviewing_evidence: { label: "Evidence 검토", stage: "evidence", terminal: false },
  grouping: { label: "Candidate 생성 중", stage: "candidate", terminal: false },
  grouping_failed: { label: "Candidate 생성 실패", stage: "candidate", terminal: false },
  reviewing_candidates: { label: "Candidate 검토", stage: "candidate", terminal: false },
  completed: { label: "분석 완료", stage: "completed", terminal: true },
});

export function isAnalysisStatus(value) {
  return STATUS_SET.has(value);
}

export function canTransitionAnalysisStatus(from, to) {
  if (!isAnalysisStatus(from) || !isAnalysisStatus(to)) return false;
  if (from === to) return true;
  return ANALYSIS_TRANSITIONS[from].includes(to);
}

export function assertAnalysisTransition(from, to) {
  if (!canTransitionAnalysisStatus(from, to)) {
    throw new TypeError(`Invalid analysis status transition: ${String(from)} -> ${String(to)}`);
  }
  return to;
}

export function analysisStatusPresentation(status) {
  if (!isAnalysisStatus(status)) {
    return { label: "알 수 없음", stage: "unknown", terminal: false };
  }
  return STATUS_PRESENTATION[status];
}

export function isTerminalAnalysisStatus(status) {
  return analysisStatusPresentation(status).terminal;
}

export function nextAnalysisStatuses(status) {
  if (!isAnalysisStatus(status)) return [];
  return [...ANALYSIS_TRANSITIONS[status]];
}
