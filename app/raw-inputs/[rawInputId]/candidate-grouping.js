"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const GROUPABLE_STATUSES = new Set(["grouping", "grouping_failed"]);

export default function CandidateGrouping({ rawInputId }) {
  const [analysisStatus, setAnalysisStatus] = useState(null);
  const [grouping, setGrouping] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const workingRef = useRef(false);
  const autoAttemptedRef = useRef(false);

  const applyPayload = useCallback((payload) => {
    setAnalysisStatus(payload.analysis_status ?? null);
    if (Object.hasOwn(payload, "grouping")) setGrouping(payload.grouping ?? null);
    setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
  }, []);

  const loadCandidates = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/raw-inputs/${rawInputId}/candidates?include_discarded=1`,
        { cache: "no-store" },
      );
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Problem Candidate를 불러오지 못했습니다."));
      }
      applyPayload(payload);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [applyPayload, rawInputId]);

  const runGrouping = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setIsWorking(true);
    setError("");
    setMessage("");
    setAnalysisStatus("grouping");

    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/candidates/group`, {
        method: "POST",
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Problem Candidate 생성에 실패했습니다."));
      }
      await loadCandidates();
      setMessage(`AI가 Problem Candidate ${payload.candidates?.length ?? 0}개를 생성했습니다.`);
    } catch (groupingError) {
      setAnalysisStatus("grouping_failed");
      setError(errorMessage(groupingError));
    } finally {
      workingRef.current = false;
      setIsWorking(false);
    }
  }, [loadCandidates, rawInputId]);

  const completeReview = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/complete`, {
        method: "PATCH",
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Candidate 검토 완료에 실패했습니다."));
      }
      applyPayload(payload);
      setMessage("Problem Candidate 검토를 완료했습니다.");
    } catch (completeError) {
      setError(errorMessage(completeError));
    } finally {
      workingRef.current = false;
      setIsWorking(false);
    }
  }, [applyPayload, rawInputId]);

  const restoreCandidate = useCallback(async (candidateId) => {
    if (workingRef.current) return;
    workingRef.current = true;
    setIsWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}/restore`, {
        method: "PATCH",
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Candidate 복구에 실패했습니다."));
      await loadCandidates();
      setMessage("폐기 Candidate를 draft로 복구했습니다.");
    } catch (restoreError) {
      setError(errorMessage(restoreError));
    } finally {
      workingRef.current = false;
      setIsWorking(false);
    }
  }, [loadCandidates]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCandidates();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCandidates]);

  useEffect(() => {
    if (analysisStatus === "reviewing_candidates" || analysisStatus === "completed") return undefined;
    const timer = window.setInterval(() => {
      if (!workingRef.current) void loadCandidates();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [analysisStatus, loadCandidates]);

  useEffect(() => {
    if (analysisStatus !== "grouping") {
      autoAttemptedRef.current = false;
      return undefined;
    }
    if (isLoading || candidates.length > 0 || workingRef.current || autoAttemptedRef.current) {
      return undefined;
    }
    autoAttemptedRef.current = true;
    const timer = window.setTimeout(() => {
      void runGrouping();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analysisStatus, candidates.length, isLoading, runGrouping]);

  if (isLoading) return null;
  if (
    !GROUPABLE_STATUSES.has(analysisStatus) &&
    analysisStatus !== "reviewing_candidates" &&
    analysisStatus !== "completed" &&
    candidates.length === 0
  ) {
    return null;
  }

  const activeCandidates = candidates.filter((candidate) => candidate.status !== "discarded");
  const discardedCandidates = candidates.filter((candidate) => candidate.status === "discarded");
  const draftCount = candidates.filter((candidate) => candidate.status === "draft").length;
  const confirmedCount = candidates.filter((candidate) => candidate.status === "confirmed").length;
  const canComplete =
    analysisStatus === "reviewing_candidates" &&
    draftCount === 0 &&
    confirmedCount > 0;

  return (
    <section className="card stack" aria-labelledby="candidate-grouping-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Phase 5 · Problem Candidate Review</p>
          <h2 id="candidate-grouping-title">문제 후보 검토 및 Problem Card 확정</h2>
        </div>
        <span className="status-badge">{analysisStatus ?? "unknown"}</span>
      </div>

      <p className="muted">
        AI 초안의 근거를 확인하고 수정·병합·분리한 뒤, 의미 있는 후보만 Problem Card로 확정합니다.
      </p>

      {grouping ? <GroupingMetadata grouping={grouping} /> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}

      {analysisStatus === "grouping" && candidates.length === 0 ? (
        <div className="empty-state stack-sm">
          <strong>{isWorking ? "AI가 유사 Evidence를 묶고 있습니다." : "문제 후보 생성을 시작할 수 있습니다."}</strong>
          <p className="muted">
            Candidate·Evidence Link·evidence_count·상태 변경은 하나의 DB 트랜잭션으로 저장됩니다.
          </p>
          <div className="inline-actions">
            <button disabled={isWorking} onClick={runGrouping} type="button">
              {isWorking ? "문제 후보 생성 중…" : "Problem Candidate 생성"}
            </button>
            <button className="button-link" disabled={isWorking} onClick={loadCandidates} type="button">
              서버 재조회
            </button>
          </div>
        </div>
      ) : null}

      {analysisStatus === "grouping_failed" ? (
        <div className="empty-state stack-sm">
          <strong>Problem Candidate 생성에 실패했습니다.</strong>
          {grouping?.error_code ? <p className="muted">최근 실패 코드: {grouping.error_code}</p> : null}
          <div className="inline-actions">
            <button disabled={isWorking} onClick={runGrouping} type="button">
              {isWorking ? "다시 묶는 중…" : "Candidate 묶기 재시도"}
            </button>
            <button className="button-link" disabled={isWorking} onClick={loadCandidates} type="button">
              서버 재조회
            </button>
          </div>
        </div>
      ) : null}

      {activeCandidates.length > 0 ? (
        <div className="candidate-grid">
          {activeCandidates.map((candidate, index) => (
            <CandidateCard candidate={candidate} index={index} key={candidate.id} />
          ))}
        </div>
      ) : analysisStatus === "reviewing_candidates" || analysisStatus === "completed" ? (
        <div className="empty-state">
          <strong>표시할 활성 Problem Candidate가 없습니다.</strong>
        </div>
      ) : null}

      {analysisStatus === "reviewing_candidates" ? (
        <div className="review-completion stack-sm">
          <strong>검토 진행</strong>
          <p className="muted">
            draft {draftCount}개 · Problem Card {confirmedCount}개 · 폐기 {discardedCandidates.length}개
          </p>
          {draftCount > 0 ? (
            <p className="notice warning">모든 draft Candidate를 확정하거나 폐기해야 완료할 수 있습니다.</p>
          ) : null}
          {confirmedCount === 0 ? (
            <p className="notice warning">최소 1개의 Problem Card 확정이 필요합니다.</p>
          ) : null}
          <div className="inline-actions">
            <button disabled={!canComplete || isWorking} onClick={completeReview} type="button">
              {isWorking ? "검토 완료 처리 중…" : "Candidate 검토 완료"}
            </button>
            <button className="button-secondary" disabled={isWorking} onClick={loadCandidates} type="button">
              서버 재조회
            </button>
          </div>
        </div>
      ) : null}

      {analysisStatus === "completed" ? (
        <p className="notice success">이 분석은 완료됐습니다. 확정된 Candidate만 Problem Card로 취급됩니다.</p>
      ) : null}

      {discardedCandidates.length > 0 ? (
        <div className="stack-sm">
          <button
            className="button-secondary button-compact"
            onClick={() => setShowDiscarded((current) => !current)}
            type="button"
          >
            {showDiscarded ? "폐기 기록 숨기기" : `폐기 기록 ${discardedCandidates.length}개 보기`}
          </button>
          {showDiscarded ? (
            <div className="candidate-grid">
              {discardedCandidates.map((candidate) => (
                <article className="candidate-card candidate-card-discarded stack" key={candidate.id}>
                  <div className="section-heading">
                    <div className="stack-sm">
                      <span className="muted">Discarded Candidate</span>
                      <strong>{candidate.title}</strong>
                    </div>
                    <span className="status-badge">discarded</span>
                  </div>
                  {candidate.discard_reason ? <p className="muted">사유: {candidate.discard_reason}</p> : null}
                  <div className="inline-actions">
                    <Link className="button-link" href={`/problem-candidates/${candidate.id}`}>
                      폐기 상세
                    </Link>
                    {analysisStatus === "reviewing_candidates" ? (
                      <button
                        className="button-secondary"
                        disabled={isWorking || candidate.evidence_count < 1}
                        onClick={() => restoreCandidate(candidate.id)}
                        type="button"
                      >
                        draft로 복구
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CandidateCard({ candidate, index }) {
  const isProblemCard = candidate.status === "confirmed";
  return (
    <article className={`candidate-card stack${isProblemCard ? " candidate-card-confirmed" : ""}`}>
      <div className="section-heading">
        <div className="stack-sm">
          <span className="muted">{isProblemCard ? "Problem Card" : `Problem Candidate ${index + 1}`}</span>
          <strong>{candidate.title}</strong>
        </div>
        <span className="status-badge">{candidate.status}</span>
      </div>

      <p>{candidate.summary || "요약이 아직 없습니다."}</p>

      <dl className="candidate-metrics">
        <Metric label="근거 수" value={candidate.evidence_count} />
        <Metric label="감정 강도" value={candidate.intensity_level} />
        <Metric label="반복 패턴" value={candidate.repeat_pattern_level} />
        <Metric label="문제 명확도" value={candidate.clarity_level} />
      </dl>

      {candidate.evidence_count === 1 ? <span className="status-badge warning-badge">근거 부족</span> : null}
      {candidate.target_user ? <p className="muted">대상 사용자: {candidate.target_user}</p> : null}
      {candidate.situation ? <p className="muted">상황: {candidate.situation}</p> : null}

      <div className="stack-sm">
        <strong>대표 Evidence</strong>
        {(candidate.evidences ?? []).slice(0, 2).map((evidence) => (
          <blockquote className="evidence-quote" key={evidence.id}>
            {evidence.original_text}
          </blockquote>
        ))}
      </div>

      <Link className="button-link" href={`/problem-candidates/${candidate.id}`}>
        {isProblemCard ? "Problem Card 상세" : "후보 검토 및 수정"}
      </Link>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "unknown"}</dd>
    </div>
  );
}

function GroupingMetadata({ grouping }) {
  const parts = [];
  if (grouping.model) parts.push(`model ${grouping.model}`);
  if (grouping.prompt_version) parts.push(`prompt ${grouping.prompt_version}`);
  if (Number.isInteger(grouping.usage?.input_tokens)) {
    parts.push(`input ${grouping.usage.input_tokens} tokens`);
  }
  if (Number.isInteger(grouping.usage?.output_tokens)) {
    parts.push(`output ${grouping.usage.output_tokens} tokens`);
  }
  if (parts.length === 0) return null;
  return <p className="muted">최근 AI 묶기: {parts.join(" · ")}</p>;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiMessage(payload, fallback) {
  return payload?.error?.message || fallback;
}

function errorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : "Problem Candidate 작업에 실패했습니다.";
}
