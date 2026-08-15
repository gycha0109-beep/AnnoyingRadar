"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function IdeaSection({ candidate, rawInput }) {
  const eligible = candidate?.status === "confirmed"
    && rawInput?.analysis_status === "completed"
    && Number(candidate?.evidence_count ?? 0) >= 1;
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(eligible);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadIdeas = useCallback(async () => {
    if (!eligible) return;
    setError("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidate.id}/ideas`, {
        cache: "no-store",
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Idea Candidate를 불러오지 못했습니다."));
      setPayload(result);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [candidate?.id, eligible]);

  useEffect(() => {
    if (!eligible) return undefined;
    const timer = window.setTimeout(() => void loadIdeas(), 0);
    return () => window.clearTimeout(timer);
  }, [eligible, loadIdeas]);

  const latestBatch = useMemo(() => {
    const batches = payload?.batches ?? [];
    return batches.length ? batches[batches.length - 1] : null;
  }, [payload?.batches]);

  if (!eligible) return null;

  async function generateIdeas() {
    if (isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidate.id}/ideas/generate`, {
        method: "POST",
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Idea Candidate 생성에 실패했습니다."));
      await loadIdeas();
      setMessage(`${result?.ideas?.length ?? 0}개의 Idea Candidate를 추가했습니다.`);
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setIsWorking(false);
    }
  }

  const ideas = payload?.ideas ?? [];

  return (
    <section className="card stack" aria-labelledby="problem-card-ideas-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Idea Candidates</p>
          <h2 id="problem-card-ideas-title">Problem Card에서 파생된 아이디어 {ideas.length}개</h2>
        </div>
        <Link className="button-link button-compact" href="/ideas">전체 Idea 목록</Link>
      </div>

      <p className="muted">
        현재 Problem Card와 연결 Evidence만 사용해 초안을 생성합니다. 추가 생성은 기존 아이디어를 덮어쓰지 않습니다.
      </p>

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}

      <button disabled={isWorking || isLoading} onClick={generateIdeas} type="button">
        {isWorking
          ? "Idea Candidate 생성 중..."
          : ideas.length > 0
            ? "아이디어 추가 생성"
            : "Idea Candidate 생성"}
      </button>

      {isLoading ? <p className="muted">기존 Idea Candidate를 불러오는 중입니다.</p> : null}

      {latestBatch ? (
        <p className="muted idea-generation-summary">
          최근 생성: {latestBatch.model} · {latestBatch.prompt_version} · {formatDate(latestBatch.created_at)}
        </p>
      ) : null}

      {ideas.length > 0 ? (
        <div className="idea-compact-list">
          {ideas.map((idea) => (
            <Link className="idea-compact-card" href={`/idea-candidates/${idea.id}`} key={idea.id}>
              <div className="section-heading">
                <strong>{idea.title}</strong>
                <span className="status-badge">{idea.status}</span>
              </div>
              <p>{idea.one_liner}</p>
              <p className="muted">구현 난이도 {idea.implementation_difficulty}</p>
            </Link>
          ))}
        </div>
      ) : !isLoading ? (
        <div className="empty-state">
          <strong>아직 생성된 Idea Candidate가 없습니다.</strong>
          <p className="muted">첫 생성 후 각 아이디어를 별도 상세 화면에서 수정하고 상태를 관리할 수 있습니다.</p>
        </div>
      ) : null}
    </section>
  );
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
    : "Idea Candidate 작업에 실패했습니다.";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ko-KR");
}