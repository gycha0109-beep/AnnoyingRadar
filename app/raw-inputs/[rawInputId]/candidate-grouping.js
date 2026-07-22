"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GROUPABLE_STATUSES = new Set(["grouping", "grouping_failed"]);

export default function CandidateGrouping({ rawInputId }) {
  const [analysisStatus, setAnalysisStatus] = useState(null);
  const [grouping, setGrouping] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const workingRef = useRef(false);
  const autoAttemptedRef = useRef(false);

  const applyPayload = useCallback((payload) => {
    setAnalysisStatus(payload.analysis_status ?? null);
    setGrouping(payload.grouping ?? null);
    setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
  }, []);

  const loadCandidates = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/candidates`, {
        cache: "no-store",
      });
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
      applyPayload(payload);
      setMessage(`AI가 Problem Candidate ${payload.candidates?.length ?? 0}개를 생성했습니다.`);
    } catch (groupingError) {
      setAnalysisStatus("grouping_failed");
      setError(errorMessage(groupingError));
    } finally {
      workingRef.current = false;
      setIsWorking(false);
    }
  }, [applyPayload, rawInputId]);

  useEffect(() => {
    void loadCandidates();
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
      return;
    }
    if (isLoading || candidates.length > 0 || workingRef.current || autoAttemptedRef.current) return;
    autoAttemptedRef.current = true;
    void runGrouping();
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

  return (
    <section className="card stack" aria-labelledby="candidate-grouping-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Phase 4 · Problem Candidate Grouping</p>
          <h2 id="candidate-grouping-title">유사 Evidence 문제 후보 묶기</h2>
        </div>
        <span className="status-badge">{analysisStatus ?? "unknown"}</span>
      </div>

      <p className="muted">
        확정된 Evidence를 대상 사용자·상황·행동 흐름·해결 방향 기준으로 묶습니다. 모든 후보는 아직 AI 초안입니다.
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

      {candidates.length > 0 ? (
        <div className="candidate-grid">
          {candidates.map((candidate, index) => (
            <article className="candidate-card stack" key={candidate.id}>
              <div className="section-heading">
                <div className="stack-sm">
                  <span className="muted">Problem Candidate {index + 1}</span>
                  <strong>{candidate.title}</strong>
                </div>
                <span className="status-badge">{candidate.status}</span>
              </div>

              <p>{candidate.summary}</p>

              <dl className="candidate-metrics">
                <Metric label="근거 수" value={candidate.evidence_count} />
                <Metric label="감정 강도" value={candidate.intensity_level} />
                <Metric label="반복 패턴" value={candidate.repeat_pattern_level} />
                <Metric label="문제 명확도" value={candidate.clarity_level} />
              </dl>

              {candidate.target_user ? <p className="muted">대상 사용자: {candidate.target_user}</p> : null}
              {candidate.situation ? <p className="muted">상황: {candidate.situation}</p> : null}

              <div className="stack-sm">
                <strong>연결 Evidence</strong>
                {(candidate.evidences ?? []).map((evidence) => (
                  <blockquote className="evidence-quote" key={evidence.id}>
                    {evidence.original_text}
                  </blockquote>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
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
