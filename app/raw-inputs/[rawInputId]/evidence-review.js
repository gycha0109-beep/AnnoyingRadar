"use client";

import { useCallback, useEffect, useState } from "react";

const EMPTY_LEVEL = "unknown";
const EXTRACTABLE_STATUSES = new Set(["input_saved", "extraction_failed", "reviewing_evidence"]);

export default function EvidenceReview({ rawInputId }) {
  const [analysisStatus, setAnalysisStatus] = useState(null);
  const [extraction, setExtraction] = useState(null);
  const [evidences, setEvidences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const applyPayload = useCallback((payload) => {
    setAnalysisStatus(payload.analysis_status ?? null);
    setExtraction(payload.extraction ?? null);
    setEvidences(Array.isArray(payload.evidences) ? payload.evidences : []);
  }, []);

  const loadEvidence = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence`, { cache: "no-store" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Evidence를 불러오지 못했습니다."));
      applyPayload(payload);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [applyPayload, rawInputId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/raw-inputs/${rawInputId}/evidence`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await readJson(response) }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(apiMessage(payload, "Evidence를 불러오지 못했습니다."));
        applyPayload(payload);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyPayload, rawInputId]);

  function updateEvidence(id, fieldName, value) {
    setEvidences((current) =>
      current.map((evidence) =>
        evidence.id === id ? { ...evidence, [fieldName]: value } : evidence,
      ),
    );
    setMessage("");
  }

  async function extractWithAI() {
    const force = analysisStatus === "reviewing_evidence" || analysisStatus === "extraction_failed";
    if (
      force &&
      evidences.length > 0 &&
      !window.confirm("현재 Evidence 초안은 AI 재추출 성공 시 교체됩니다. 계속하시겠습니까?")
    ) {
      return;
    }

    await runAction(async () => {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "AI Evidence 추출에 실패했습니다."));
      applyPayload(payload);
      setMessage(
        payload.evidences?.length
          ? `AI가 Evidence ${payload.evidences.length}개를 추출했습니다.`
          : "AI가 명확한 Pain Evidence를 찾지 못했습니다.",
      );
    });
  }

  async function prepareFixture() {
    await runAction(async () => {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence/fixture`, { method: "POST" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "고정 Evidence를 준비하지 못했습니다."));
      setAnalysisStatus(payload.analysis_status);
      setExtraction(null);
      setEvidences(payload.evidences ?? []);
      setMessage("개발 검증용 결정론적 Evidence fixture를 준비했습니다.");
    });
  }

  async function saveEvidence() {
    const updates = evidences.map((evidence, orderIndex) => ({
      id: evidence.id,
      summary_ko: nullable(evidence.summary_ko),
      pain_type: nullable(evidence.pain_type),
      target_user: nullable(evidence.target_user),
      situation: nullable(evidence.situation),
      sentiment_level: evidence.sentiment_level || EMPTY_LEVEL,
      intensity_level: evidence.intensity_level || EMPTY_LEVEL,
      order_index: orderIndex,
    }));

    await runAction(async () => {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Evidence를 저장하지 못했습니다."));
      setEvidences(payload.evidences ?? []);
      setMessage("Evidence 수정 내용을 저장했습니다.");
    });
  }

  async function deleteEvidence(id) {
    await runAction(async () => {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ id, status: "deleted" }] }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Evidence를 삭제하지 못했습니다."));
      setEvidences(payload.evidences ?? []);
      setMessage("Evidence를 deleted 처리했습니다.");
    });
  }

  async function confirmEvidence() {
    if (evidences.length < 1) {
      setError("확정할 Evidence가 1개 이상 필요합니다.");
      return;
    }

    await runAction(async () => {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence/confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed_evidence_ids: evidences.map((evidence) => evidence.id),
          deleted_evidence_ids: [],
        }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Evidence 확정을 완료하지 못했습니다."));
      setAnalysisStatus(payload.analysis_status);
      setEvidences(payload.evidences ?? []);
      setMessage("Evidence를 확정하고 grouping 단계로 전환했습니다.");
    });
  }

  async function runAction(action) {
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) {
    return <section className="card"><p className="muted">Evidence를 불러오는 중…</p></section>;
  }

  const canExtract = EXTRACTABLE_STATUSES.has(analysisStatus);
  const isReadOnly = analysisStatus !== "reviewing_evidence";

  return (
    <section className="card stack" aria-labelledby="evidence-review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Phase 3 · Evidence Extraction</p>
          <h2 id="evidence-review-title">Pain Evidence 추출 및 검토</h2>
        </div>
        <span className="status-badge">{analysisStatus ?? "unknown"}</span>
      </div>

      <p className="muted">
        AI는 원문에서 직접 인용 가능한 불만 근거만 초안으로 만듭니다. 결과는 사용자가 수정·삭제·확정합니다.
      </p>

      {extraction ? <ExtractionMetadata extraction={extraction} /> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}

      {analysisStatus === "extracting" ? (
        <div className="empty-state stack-sm">
          <strong>AI가 원문에서 Pain Evidence를 추출하고 있습니다.</strong>
          <p className="muted">요청이 끝난 뒤 자동 반영됩니다. 오래 걸리면 서버 재조회를 사용하세요.</p>
          <button className="button-secondary" disabled={isWorking} onClick={loadEvidence} type="button">
            서버 재조회
          </button>
        </div>
      ) : null}

      {analysisStatus !== "extracting" && evidences.length === 0 ? (
        <div className="empty-state stack-sm">
          <strong>검토할 Evidence가 없습니다.</strong>
          {analysisStatus === "extraction_failed" && extraction?.error_code ? (
            <p className="muted">최근 실패 코드: {extraction.error_code}</p>
          ) : null}
          <div className="inline-actions">
            {canExtract ? (
              <button disabled={isWorking} onClick={extractWithAI} type="button">
                {isWorking ? "AI 추출 중…" : analysisStatus === "extraction_failed" ? "AI 추출 재시도" : "AI Evidence 추출"}
              </button>
            ) : null}
            {canExtract ? (
              <button className="button-secondary" disabled={isWorking} onClick={prepareFixture} type="button">
                개발용 고정 fixture
              </button>
            ) : null}
            <button className="button-link" disabled={isWorking} onClick={loadEvidence} type="button">
              서버 재조회
            </button>
          </div>
        </div>
      ) : null}

      {evidences.length > 0 ? (
        <div className="stack">
          {evidences.map((evidence, index) => (
            <article className="evidence-card stack" key={evidence.id}>
              <div className="section-heading">
                <strong>Evidence {index + 1}</strong>
                <span className="status-badge">{evidence.status}</span>
              </div>

              <blockquote className="evidence-quote">{evidence.original_text}</blockquote>

              <label className="field stack-sm">
                <span>한국어 요약</span>
                <input
                  disabled={isReadOnly}
                  onChange={(event) => updateEvidence(evidence.id, "summary_ko", event.target.value)}
                  value={evidence.summary_ko ?? ""}
                />
              </label>

              <div className="form-grid">
                <label className="field stack-sm">
                  <span>Pain 유형</span>
                  <input
                    disabled={isReadOnly}
                    onChange={(event) => updateEvidence(evidence.id, "pain_type", event.target.value)}
                    value={evidence.pain_type ?? ""}
                  />
                </label>
                <label className="field stack-sm">
                  <span>대상 사용자</span>
                  <input
                    disabled={isReadOnly}
                    onChange={(event) => updateEvidence(evidence.id, "target_user", event.target.value)}
                    value={evidence.target_user ?? ""}
                  />
                </label>
              </div>

              <label className="field stack-sm">
                <span>발생 상황</span>
                <input
                  disabled={isReadOnly}
                  onChange={(event) => updateEvidence(evidence.id, "situation", event.target.value)}
                  value={evidence.situation ?? ""}
                />
              </label>

              <div className="form-grid">
                <label className="field stack-sm">
                  <span>감정</span>
                  <select
                    disabled={isReadOnly}
                    onChange={(event) => updateEvidence(evidence.id, "sentiment_level", event.target.value)}
                    value={evidence.sentiment_level ?? EMPTY_LEVEL}
                  >
                    <option value="negative">negative</option>
                    <option value="mixed">mixed</option>
                    <option value="neutral">neutral</option>
                    <option value="unknown">unknown</option>
                  </select>
                </label>
                <label className="field stack-sm">
                  <span>강도</span>
                  <select
                    disabled={isReadOnly}
                    onChange={(event) => updateEvidence(evidence.id, "intensity_level", event.target.value)}
                    value={evidence.intensity_level ?? EMPTY_LEVEL}
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="unknown">unknown</option>
                  </select>
                </label>
              </div>

              {analysisStatus === "reviewing_evidence" ? (
                <button
                  className="button-secondary"
                  disabled={isWorking}
                  onClick={() => deleteEvidence(evidence.id)}
                  type="button"
                >
                  deleted 처리
                </button>
              ) : null}
            </article>
          ))}

          {analysisStatus === "extraction_failed" ? (
            <div className="inline-actions">
              <button disabled={isWorking} onClick={extractWithAI} type="button">
                {isWorking ? "AI 추출 중…" : "AI 추출 재시도"}
              </button>
              <button className="button-secondary" disabled={isWorking} onClick={prepareFixture} type="button">
                개발용 고정 fixture
              </button>
              <button className="button-link" disabled={isWorking} onClick={loadEvidence} type="button">
                서버 재조회
              </button>
            </div>
          ) : null}

          {analysisStatus === "reviewing_evidence" ? (
            <div className="inline-actions">
              <button disabled={isWorking} onClick={saveEvidence} type="button">
                수정 내용 저장
              </button>
              <button className="button-secondary" disabled={isWorking} onClick={extractWithAI} type="button">
                AI 재추출
              </button>
              <button
                className="button-secondary"
                disabled={isWorking || evidences.length < 1}
                onClick={confirmEvidence}
                type="button"
              >
                남은 Evidence 확정 및 grouping 진입
              </button>
              <button className="button-link" disabled={isWorking} onClick={loadEvidence} type="button">
                서버 재조회
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ExtractionMetadata({ extraction }) {
  const parts = [];
  if (extraction.model) parts.push(`model ${extraction.model}`);
  if (extraction.prompt_version) parts.push(`prompt ${extraction.prompt_version}`);
  if (Number.isInteger(extraction.usage?.input_tokens)) parts.push(`input ${extraction.usage.input_tokens} tokens`);
  if (Number.isInteger(extraction.usage?.output_tokens)) parts.push(`output ${extraction.usage.output_tokens} tokens`);
  if (parts.length === 0) return null;
  return <p className="muted">최근 AI 추출: {parts.join(" · ")}</p>;
}

function nullable(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
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
  return error instanceof Error && error.message ? error.message : "Evidence 작업에 실패했습니다.";
}
