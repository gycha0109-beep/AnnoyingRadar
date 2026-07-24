"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const METRIC_OPTIONS = {
  intensity_level: ["low", "medium", "high", "unknown"],
  repeat_pattern_level: ["weak", "moderate", "strong", "unknown"],
  clarity_level: ["unclear", "partial", "clear", "unknown"],
};

export default function CandidateReview({ candidateId }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [moveTargets, setMoveTargets] = useState({});
  const [mergeTarget, setMergeTarget] = useState("");
  const [splitEvidenceIds, setSplitEvidenceIds] = useState([]);
  const [splitTitle, setSplitTitle] = useState("");
  const [splitSummary, setSplitSummary] = useState("");
  const [discardReason, setDiscardReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const applyDetail = useCallback((payload) => {
    const candidate = payload?.candidate;
    if (!candidate) return;
    setDetail(payload);
    setForm({
      title: candidate.title ?? "",
      summary: candidate.summary ?? "",
      target_user: candidate.target_user ?? "",
      situation: candidate.situation ?? "",
      intensity_level: candidate.intensity_level ?? "",
      repeat_pattern_level: candidate.repeat_pattern_level ?? "",
      clarity_level: candidate.clarity_level ?? "",
      order_index: candidate.order_index ?? 0,
    });
    setDiscardReason(candidate.discard_reason ?? "");
    setSplitEvidenceIds([]);
    setSplitTitle("");
    setSplitSummary("");
  }, []);

  const loadDetail = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}`, {
        cache: "no-store",
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Problem Candidate를 불러오지 못했습니다."));
      applyDetail(payload);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [applyDetail, candidateId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail]);

  async function runMutation(operation, successMessage) {
    if (isWorking) return null;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const payload = await operation();
      if (payload?.candidate) applyDetail(payload);
      if (successMessage) setMessage(successMessage);
      return payload;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return null;
    } finally {
      setIsWorking(false);
    }
  }

  async function saveCandidate() {
    await runMutation(async () => {
      const response = await fetch(`/api/problem-candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          target_user: form.target_user || null,
          situation: form.situation || null,
          intensity_level: form.intensity_level || null,
          repeat_pattern_level: form.repeat_pattern_level || null,
          clarity_level: form.clarity_level || null,
        }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Candidate 저장에 실패했습니다."));
      return payload;
    }, "Candidate 수정 내용을 저장했습니다.");
  }

  async function changeStatus(action, body, successMessage) {
    await runMutation(async () => {
      const response = await fetch(`/api/problem-candidates/${candidateId}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Candidate 상태 변경에 실패했습니다."));
      return payload;
    }, successMessage);
  }

  async function moveEvidence(evidenceId) {
    const targetCandidateId = moveTargets[evidenceId];
    if (!targetCandidateId) {
      setError("Evidence를 이동할 draft Candidate를 선택하십시오.");
      return;
    }

    const payload = await runMutation(async () => {
      const response = await fetch(`/api/problem-candidates/${candidateId}/evidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence_id: evidenceId,
          target_candidate_id: targetCandidateId,
        }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Evidence 이동에 실패했습니다."));
      return result.source;
    }, "Evidence를 다른 Candidate로 이동했습니다.");

    if (payload) setMoveTargets((current) => ({ ...current, [evidenceId]: "" }));
  }

  async function mergeCandidate() {
    if (!mergeTarget) {
      setError("병합 대상 draft Candidate를 선택하십시오.");
      return;
    }

    const payload = await runMutation(async () => {
      const response = await fetch(`/api/problem-candidates/${candidateId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_candidate_id: mergeTarget }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Candidate 병합에 실패했습니다."));
      return result;
    }, null);

    if (payload?.candidate?.id) {
      window.location.assign(`/problem-candidates/${payload.candidate.id}`);
    }
  }

  async function splitCandidate() {
    if (splitEvidenceIds.length < 1) {
      setError("새 Candidate로 분리할 Evidence를 선택하십시오.");
      return;
    }

    const payload = await runMutation(async () => {
      const response = await fetch(`/api/problem-candidates/${candidateId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence_ids: splitEvidenceIds,
          new_candidate: {
            title: splitTitle,
            summary: splitSummary,
            target_user: form.target_user || null,
            situation: form.situation || null,
            intensity_level: form.intensity_level || "unknown",
            repeat_pattern_level: form.repeat_pattern_level || "unknown",
            clarity_level: form.clarity_level || "unknown",
            order_index: Number(form.order_index) + 1,
          },
        }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Candidate 분리에 실패했습니다."));
      return result.created;
    }, null);

    if (payload?.candidate?.id) {
      window.location.assign(`/problem-candidates/${payload.candidate.id}`);
    }
  }

  if (isLoading) return <section className="card">Candidate 상세를 불러오는 중입니다.</section>;
  if (!detail?.candidate) {
    return (
      <section className="card stack">
        <p className="notice error">{error || "Problem Candidate를 찾을 수 없습니다."}</p>
        <Link className="button-link" href="/">대시보드</Link>
      </section>
    );
  }

  const candidate = detail.candidate;
  const rawInput = detail.raw_input;
  const draftSiblings = (detail.sibling_candidates ?? []).filter((item) => item.status === "draft");
  const canMutate = rawInput.analysis_status === "reviewing_candidates";
  const canRestructure = canMutate && candidate.status === "draft";
  const readOnly = !canMutate || candidate.status === "discarded";

  return (
    <>
      <section className="card stack">
        <div className="section-heading detail-heading">
          <div>
            <p className="eyebrow">{candidate.status === "confirmed" ? "Problem Card" : "Problem Candidate"}</p>
            <h1>{candidate.title}</h1>
            <p className="record-id">{candidate.id}</p>
          </div>
          <div className="detail-statuses">
            <span className="status-badge">{candidate.status}</span>
            <span className="status-badge">{rawInput.analysis_status}</span>
          </div>
        </div>

        <div className="inline-actions">
          <Link className="button-link" href={`/raw-inputs/${candidate.raw_input_id}`}>
            Candidate 목록으로
          </Link>
          <button className="button-secondary" disabled={isWorking} onClick={loadDetail} type="button">
            서버 재조회
          </button>
        </div>

        {error ? <p className="notice error" role="alert">{error}</p> : null}
        {message ? <p className="notice success" role="status">{message}</p> : null}
        {!canMutate ? <p className="notice warning">완료된 분석은 읽기 전용입니다.</p> : null}
        {candidate.evidence_count === 1 ? <p className="notice warning">근거가 1개뿐인 Candidate입니다.</p> : null}
      </section>

      <section className="card stack" aria-labelledby="candidate-edit-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Human Review</p>
            <h2 id="candidate-edit-title">문제 정의 수정</h2>
          </div>
        </div>

        <label className="field stack-sm">
          <span>문제 제목</span>
          <input
            disabled={readOnly || isWorking}
            maxLength={200}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            value={form.title}
          />
        </label>
        <label className="field stack-sm">
          <span>문제 요약</span>
          <textarea
            disabled={readOnly || isWorking}
            maxLength={2000}
            onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
            rows={5}
            value={form.summary}
          />
        </label>

        <div className="form-grid">
          <label className="field stack-sm">
            <span>대상 사용자</span>
            <input
              disabled={readOnly || isWorking}
              maxLength={500}
              onChange={(event) => setForm((current) => ({ ...current, target_user: event.target.value }))}
              value={form.target_user}
            />
          </label>
          <label className="field stack-sm">
            <span>발생 상황</span>
            <input
              disabled={readOnly || isWorking}
              maxLength={500}
              onChange={(event) => setForm((current) => ({ ...current, situation: event.target.value }))}
              value={form.situation}
            />
          </label>
        </div>

        <div className="form-grid">
          <MetricSelect
            disabled={readOnly || isWorking}
            label="감정 강도"
            onChange={(value) => setForm((current) => ({ ...current, intensity_level: value }))}
            options={METRIC_OPTIONS.intensity_level}
            value={form.intensity_level}
          />
          <MetricSelect
            disabled={readOnly || isWorking}
            label="반복 패턴"
            onChange={(value) => setForm((current) => ({ ...current, repeat_pattern_level: value }))}
            options={METRIC_OPTIONS.repeat_pattern_level}
            value={form.repeat_pattern_level}
          />
          <MetricSelect
            disabled={readOnly || isWorking}
            label="문제 명확도"
            onChange={(value) => setForm((current) => ({ ...current, clarity_level: value }))}
            options={METRIC_OPTIONS.clarity_level}
            value={form.clarity_level}
          />
          <label className="field stack-sm">
            <span>정렬 순서</span>
            <input
              disabled={readOnly || isWorking}
              min="0"
              onChange={(event) => setForm((current) => ({ ...current, order_index: Number(event.target.value) }))}
              type="number"
              value={form.order_index}
            />
          </label>
        </div>

        {!readOnly ? (
          <button disabled={isWorking} onClick={saveCandidate} type="button">
            수정 내용 저장
          </button>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="candidate-evidence-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Evidence Traceability</p>
            <h2 id="candidate-evidence-title">연결 Evidence {candidate.evidence_count}개</h2>
          </div>
        </div>

        <div className="stack">
          {(candidate.evidences ?? []).map((evidence) => (
            <article className="evidence-review-card stack-sm" key={evidence.id}>
              <div className="section-heading">
                <strong>{evidence.summary_ko || "Evidence"}</strong>
                <span className="status-badge">{evidence.pain_type || "unknown"}</span>
              </div>
              <blockquote className="evidence-quote">{evidence.original_text}</blockquote>
              <p className="muted">
                감정 {evidence.sentiment_level || "unknown"} · 강도 {evidence.intensity_level || "unknown"}
              </p>
              {evidence.source_url ? (
                <a href={evidence.source_url} rel="noreferrer" target="_blank">원문 출처 열기</a>
              ) : evidence.source_memo ? (
                <p className="muted">출처 메모: {evidence.source_memo}</p>
              ) : null}

              {canRestructure && draftSiblings.length > 0 ? (
                <div className="inline-actions">
                  <select
                    aria-label="Evidence 이동 대상"
                    disabled={isWorking}
                    onChange={(event) => setMoveTargets((current) => ({
                      ...current,
                      [evidence.id]: event.target.value,
                    }))}
                    value={moveTargets[evidence.id] ?? ""}
                  >
                    <option value="">이동할 draft Candidate</option>
                    {draftSiblings.map((sibling) => (
                      <option key={sibling.id} value={sibling.id}>{sibling.title}</option>
                    ))}
                  </select>
                  <button
                    className="button-secondary button-compact"
                    disabled={isWorking || candidate.evidence_count <= 1}
                    onClick={() => moveEvidence(evidence.id)}
                    type="button"
                  >
                    Evidence 이동
                  </button>
                </div>
              ) : null}

              {canRestructure && candidate.evidence_count > 1 ? (
                <label className="check-row">
                  <input
                    checked={splitEvidenceIds.includes(evidence.id)}
                    disabled={isWorking}
                    onChange={() => setSplitEvidenceIds((current) => (
                      current.includes(evidence.id)
                        ? current.filter((id) => id !== evidence.id)
                        : [...current, evidence.id]
                    ))}
                    type="checkbox"
                  />
                  새 Candidate로 분리할 Evidence
                </label>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {canRestructure ? (
        <section className="card stack" aria-labelledby="candidate-structure-title">
          <div>
            <p className="eyebrow">Structure Review</p>
            <h2 id="candidate-structure-title">Candidate 병합·분리</h2>
          </div>

          {draftSiblings.length > 0 ? (
            <div className="stack-sm">
              <strong>현재 Candidate를 다른 draft Candidate에 병합</strong>
              <div className="inline-actions">
                <select disabled={isWorking} onChange={(event) => setMergeTarget(event.target.value)} value={mergeTarget}>
                  <option value="">병합 대상 선택</option>
                  {draftSiblings.map((sibling) => (
                    <option key={sibling.id} value={sibling.id}>{sibling.title}</option>
                  ))}
                </select>
                <button className="button-secondary" disabled={isWorking || !mergeTarget} onClick={mergeCandidate} type="button">
                  선택 Candidate에 병합
                </button>
              </div>
              <p className="muted">현재 Candidate는 폐기 기록으로 남고 Evidence는 대상 Candidate로 이동합니다.</p>
            </div>
          ) : null}

          {candidate.evidence_count > 1 ? (
            <div className="stack-sm">
              <strong>선택한 Evidence를 새 Candidate로 분리</strong>
              <input
                disabled={isWorking}
                maxLength={200}
                onChange={(event) => setSplitTitle(event.target.value)}
                placeholder="새 Candidate 제목"
                value={splitTitle}
              />
              <textarea
                disabled={isWorking}
                maxLength={2000}
                onChange={(event) => setSplitSummary(event.target.value)}
                placeholder="새 Candidate 요약"
                rows={4}
                value={splitSummary}
              />
              <button
                className="button-secondary"
                disabled={
                  isWorking ||
                  splitEvidenceIds.length < 1 ||
                  splitEvidenceIds.length >= candidate.evidence_count ||
                  !splitTitle.trim() ||
                  !splitSummary.trim()
                }
                onClick={splitCandidate}
                type="button"
              >
                새 Candidate로 분리
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {canMutate ? (
        <section className="card stack" aria-labelledby="candidate-decision-title">
          <div>
            <p className="eyebrow">Decision</p>
            <h2 id="candidate-decision-title">확정·폐기·복구</h2>
          </div>

          {candidate.status === "draft" ? (
            <button disabled={isWorking} onClick={() => changeStatus("confirm", {}, "Problem Card로 확정했습니다.")} type="button">
              문제 카드로 확정
            </button>
          ) : null}

          {candidate.status === "confirmed" ? (
            <button className="button-secondary" disabled={isWorking} onClick={() => changeStatus("restore", {}, "Problem Card를 draft로 되돌렸습니다.")} type="button">
              draft로 되돌리기
            </button>
          ) : null}

          {candidate.status !== "discarded" ? (
            <div className="stack-sm">
              <input
                disabled={isWorking}
                maxLength={1000}
                onChange={(event) => setDiscardReason(event.target.value)}
                placeholder="폐기 사유 (선택)"
                value={discardReason}
              />
              <button
                className="button-secondary"
                disabled={isWorking}
                onClick={() => changeStatus(
                  "discard",
                  { discard_reason: discardReason || null },
                  "Candidate를 폐기했습니다.",
                )}
                type="button"
              >
                Candidate 폐기
              </button>
            </div>
          ) : (
            <button
              disabled={isWorking || candidate.evidence_count < 1}
              onClick={() => changeStatus("restore", {}, "Candidate를 draft로 복구했습니다.")}
              type="button"
            >
              Candidate 복구
            </button>
          )}
        </section>
      ) : null}
    </>
  );
}

function MetricSelect({ disabled, label, onChange, options, value }) {
  return (
    <label className="field stack-sm">
      <span>{label}</span>
      <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">판단 보류</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function emptyForm() {
  return {
    title: "",
    summary: "",
    target_user: "",
    situation: "",
    intensity_level: "",
    repeat_pattern_level: "",
    clarity_level: "",
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
    : "Problem Candidate 검토 작업에 실패했습니다.";
}
