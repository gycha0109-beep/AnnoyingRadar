"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  IDEA_STATUSES,
  IMPLEMENTATION_DIFFICULTIES,
  canTransitionIdeaStatus,
} from "../../../lib/ideas/contracts.mjs";

const ACTIVE_STATUSES = new Set(["candidate", "researching", "build_soon", "paused"]);

export default function IdeaReview({ ideaId }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [targetStatus, setTargetStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const applyDetail = useCallback((payload) => {
    const idea = payload?.idea;
    if (!idea) return;
    setDetail(payload);
    setForm({
      title: idea.title ?? "",
      one_liner: idea.one_liner ?? "",
      target_user: idea.target_user ?? "",
      problem_statement: idea.problem_statement ?? "",
      core_value: idea.core_value ?? "",
      first_build_scope: idea.first_build_scope ?? "",
      excluded_scope: idea.excluded_scope ?? "",
      implementation_difficulty: idea.implementation_difficulty ?? "unknown",
      monetization_hint: idea.monetization_hint ?? "",
      first_screen_idea: idea.first_screen_idea ?? "",
      memo: idea.memo ?? "",
      order_index: idea.order_index ?? 0,
    });
    setTargetStatus("");
  }, []);

  const loadDetail = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/idea-candidates/${ideaId}`, { cache: "no-store" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Idea Candidate를 불러오지 못했습니다."));
      applyDetail(payload);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [applyDetail, ideaId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail]);

  async function runMutation(operation, successMessage) {
    if (isWorking) return null;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const payload = await operation();
      if (payload?.idea) applyDetail(payload);
      if (successMessage) setMessage(successMessage);
      return payload;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return null;
    } finally {
      setIsWorking(false);
    }
  }

  async function saveIdea() {
    await runMutation(async () => {
      const response = await fetch(`/api/idea-candidates/${ideaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          target_user: form.target_user || null,
          excluded_scope: form.excluded_scope || null,
          monetization_hint: form.monetization_hint || null,
          first_screen_idea: form.first_screen_idea || null,
          memo: form.memo || null,
          order_index: Number(form.order_index),
        }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Idea Candidate 저장에 실패했습니다."));
      return payload;
    }, "Idea Candidate 수정 내용을 저장했습니다.");
  }

  async function changeStatus() {
    if (!targetStatus) {
      setError("변경할 상태를 선택하십시오.");
      return;
    }
    await runMutation(async () => {
      const response = await fetch(`/api/idea-candidates/${ideaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Idea Candidate 상태 변경에 실패했습니다."));
      return payload;
    }, `Idea Candidate 상태를 ${targetStatus}(으)로 변경했습니다.`);
  }

  const idea = detail?.idea ?? null;
  const allowedStatuses = idea?.status
    ? IDEA_STATUSES.filter((status) => canTransitionIdeaStatus(idea.status, status))
    : [];

  if (isLoading) return <section className="card">Idea Candidate 상세를 불러오는 중입니다.</section>;
  if (!idea) {
    return (
      <section className="card stack">
        <p className="notice error">{error || "Idea Candidate를 찾을 수 없습니다."}</p>
        <Link className="button-link" href="/ideas">Idea 목록</Link>
      </section>
    );
  }

  const readOnly = !ACTIVE_STATUSES.has(idea.status);
  const problemCard = detail.problem_card;
  const batch = detail.generation_batch;

  return (
    <>
      <section className="card stack">
        <div className="section-heading detail-heading">
          <div>
            <p className="eyebrow">Idea Candidate</p>
            <h1>{idea.title}</h1>
            <p className="record-id">{idea.id}</p>
          </div>
          <div className="detail-statuses">
            <span className="status-badge">{idea.status}</span>
            <span className="status-badge">difficulty: {idea.implementation_difficulty}</span>
          </div>
        </div>

        <div className="inline-actions">
          {problemCard ? (
            <Link className="button-link" href={`/problem-candidates/${problemCard.id}`}>Problem Card로</Link>
          ) : null}
          <Link className="button-link" href="/ideas">전체 Idea 목록</Link>
          <button className="button-secondary" disabled={isWorking} onClick={loadDetail} type="button">
            서버 재조회
          </button>
        </div>

        {error ? <p className="notice error" role="alert">{error}</p> : null}
        {message ? <p className="notice success" role="status">{message}</p> : null}
        {readOnly ? (
          <p className="notice warning">discarded / archived Idea는 활성 상태로 복구하기 전까지 수정할 수 없습니다.</p>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="idea-edit-title">
        <div>
          <p className="eyebrow">Human Review</p>
          <h2 id="idea-edit-title">Idea 내용 검토·수정</h2>
        </div>

        <TextField label="아이디어 이름" maxLength={200} disabled={readOnly || isWorking} value={form.title} onChange={(value) => setField(setForm, "title", value)} />
        <TextField label="한 줄 설명" maxLength={500} disabled={readOnly || isWorking} value={form.one_liner} onChange={(value) => setField(setForm, "one_liner", value)} />
        <TextField label="대상 사용자" maxLength={500} disabled={readOnly || isWorking} value={form.target_user} onChange={(value) => setField(setForm, "target_user", value)} />
        <TextArea label="문제 정의" maxLength={2000} rows={5} disabled={readOnly || isWorking} value={form.problem_statement} onChange={(value) => setField(setForm, "problem_statement", value)} />
        <TextArea label="핵심 가치" maxLength={1000} rows={4} disabled={readOnly || isWorking} value={form.core_value} onChange={(value) => setField(setForm, "core_value", value)} />
        <TextArea label="첫 구현 범위" maxLength={2000} rows={5} disabled={readOnly || isWorking} value={form.first_build_scope} onChange={(value) => setField(setForm, "first_build_scope", value)} />
        <TextArea label="제외 범위" maxLength={2000} rows={4} disabled={readOnly || isWorking} value={form.excluded_scope} onChange={(value) => setField(setForm, "excluded_scope", value)} />

        <div className="form-grid">
          <label className="field stack-sm">
            <span>구현 난이도</span>
            <select
              disabled={readOnly || isWorking}
              value={form.implementation_difficulty}
              onChange={(event) => setField(setForm, "implementation_difficulty", event.target.value)}
            >
              {IMPLEMENTATION_DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>{difficulty}</option>
              ))}
            </select>
          </label>
          <label className="field stack-sm">
            <span>정렬 순서</span>
            <input
              disabled={readOnly || isWorking}
              min="0"
              type="number"
              value={form.order_index}
              onChange={(event) => setField(setForm, "order_index", Number(event.target.value))}
            />
          </label>
        </div>

        <TextArea label="수익화 가설" maxLength={1000} rows={4} disabled={readOnly || isWorking} value={form.monetization_hint} onChange={(value) => setField(setForm, "monetization_hint", value)} />
        <TextArea label="첫 화면 아이디어" maxLength={2000} rows={4} disabled={readOnly || isWorking} value={form.first_screen_idea} onChange={(value) => setField(setForm, "first_screen_idea", value)} />
        <TextArea label="사용자 메모" maxLength={4000} rows={5} disabled={readOnly || isWorking} value={form.memo} onChange={(value) => setField(setForm, "memo", value)} />

        {!readOnly ? (
          <button disabled={isWorking} onClick={saveIdea} type="button">수정 내용 저장</button>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="idea-status-title">
        <div>
          <p className="eyebrow">Decision</p>
          <h2 id="idea-status-title">상태 변경</h2>
        </div>
        <div className="inline-actions idea-status-actions">
          <select disabled={isWorking} value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)}>
            <option value="">변경할 상태 선택</option>
            {allowedStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <button disabled={isWorking || !targetStatus} onClick={changeStatus} type="button">상태 변경</button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="idea-source-title">
        <div>
          <p className="eyebrow">Source Traceability</p>
          <h2 id="idea-source-title">근거 Problem Card · Evidence</h2>
        </div>
        {problemCard ? (
          <article className="idea-source-card stack-sm">
            <div className="section-heading">
              <strong>{problemCard.title}</strong>
              <span className="status-badge">{problemCard.status}</span>
            </div>
            <p>{problemCard.summary}</p>
            <p className="muted">대상 {problemCard.target_user || "미지정"} · 상황 {problemCard.situation || "미지정"}</p>
            <Link href={`/problem-candidates/${problemCard.id}`}>Problem Card 열기</Link>
          </article>
        ) : <p className="notice warning">Source Problem Card를 불러오지 못했습니다.</p>}

        <div className="stack">
          {(detail.evidences ?? []).map((evidence) => (
            <article className="evidence-review-card stack-sm" key={evidence.id}>
              <div className="section-heading">
                <strong>{evidence.summary_ko || "Evidence"}</strong>
                <span className="status-badge">{evidence.pain_type || "unknown"}</span>
              </div>
              <blockquote className="evidence-quote">{evidence.original_text}</blockquote>
              <p className="muted">감정 {evidence.sentiment_level || "unknown"} · 강도 {evidence.intensity_level || "unknown"}</p>
              {evidence.source_url ? <a href={evidence.source_url} rel="noreferrer" target="_blank">원문 출처 열기</a> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="idea-generation-title">
        <div>
          <p className="eyebrow">Generation Provenance</p>
          <h2 id="idea-generation-title">생성 메타데이터</h2>
        </div>
        {batch ? (
          <dl className="idea-meta-grid">
            <Meta label="Model" value={batch.model} />
            <Meta label="Prompt" value={batch.prompt_version} />
            <Meta label="Provider request" value={batch.provider_request_id || "-"} />
            <Meta label="Input tokens" value={batch.generation_input_tokens ?? "-"} />
            <Meta label="Output tokens" value={batch.generation_output_tokens ?? "-"} />
            <Meta label="Generated" value={formatDate(batch.created_at)} />
          </dl>
        ) : <p className="muted">생성 메타데이터가 없습니다.</p>}
      </section>

      <section className="card stack" aria-labelledby="idea-history-title">
        <div>
          <p className="eyebrow">Status History</p>
          <h2 id="idea-history-title">상태 변경 이력</h2>
        </div>
        <ol className="idea-history-list">
          {(detail.status_events ?? []).map((event) => (
            <li key={event.id}>
              <strong>{event.from_status || "created"} → {event.to_status}</strong>
              <span className="muted">{formatDate(event.created_at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function TextField({ label, ...props }) {
  const { onChange, ...inputProps } = props;
  return (
    <label className="field stack-sm">
      <span>{label}</span>
      <input {...inputProps} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, ...props }) {
  const { onChange, ...textareaProps } = props;
  return (
    <label className="field stack-sm">
      <span>{label}</span>
      <textarea {...textareaProps} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Meta({ label, value }) {
  return <div><dt>{label}</dt><dd>{String(value)}</dd></div>;
}

function setField(setter, field, value) {
  setter((current) => ({ ...current, [field]: value }));
}

function emptyForm() {
  return {
    title: "",
    one_liner: "",
    target_user: "",
    problem_statement: "",
    core_value: "",
    first_build_scope: "",
    excluded_scope: "",
    implementation_difficulty: "unknown",
    monetization_hint: "",
    first_screen_idea: "",
    memo: "",
    order_index: 0,
  };
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
    : "Idea Candidate 검토 작업에 실패했습니다.";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ko-KR");
}