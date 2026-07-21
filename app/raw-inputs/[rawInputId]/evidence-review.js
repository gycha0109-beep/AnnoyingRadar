"use client";

import { useCallback, useEffect, useState } from "react";

const EMPTY_LEVEL = "unknown";

export default function EvidenceReview({ rawInputId }) {
  const [analysisStatus, setAnalysisStatus] = useState(null);
  const [evidences, setEvidences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEvidence = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence`, {
        cache: "no-store",
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Evidence를 불러오지 못했습니다."));
      }
      setAnalysisStatus(payload.analysis_status);
      setEvidences(Array.isArray(payload.evidences) ? payload.evidences : []);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [rawInputId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/raw-inputs/${rawInputId}/evidence`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await readJson(response) }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(apiMessage(payload, "Evidence를 불러오지 못했습니다."));
        setAnalysisStatus(payload.analysis_status);
        setEvidences(Array.isArray(payload.evidences) ? payload.evidences : []);
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
  }, [rawInputId]);

  function updateEvidence(id, fieldName, value) {
    setEvidences((current) =>
      current.map((evidence) =>
        evidence.id === id ? { ...evidence, [fieldName]: value } : evidence,
      ),
    );
    setMessage("");
  }

  async function prepareFixture() {
    await runAction(async () => {
      const response = await fetch(`/api/raw-inputs/${rawInputId}/evidence/fixture`, {
        method: "POST",
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "고정 Evidence를 준비하지 못했습니다."));
      }
      setAnalysisStatus(payload.analysis_status);
      setEvidences(payload.evidences ?? []);
      setMessage("LLM 없이 결정론적 Evidence fixture를 준비했습니다.");
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
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Evidence를 저장하지 못했습니다."));
      }
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
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Evidence를 삭제하지 못했습니다."));
      }
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
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Evidence 확정을 완료하지 못했습니다."));
      }
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

  return (
    <section className="card stack" aria-labelledby="evidence-review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Phase 2 · Evidence Review</p>
          <h2 id="evidence-review-title">Pain Evidence 검토</h2>
        </div>
        <span className="status-badge">{analysisStatus ?? "unknown"}</span>
      </div>

      <p className="muted">
        이 단계에서는 LLM을 호출하지 않습니다. 원문 문장 단위의 결정론적 fixture로 저장·수정·삭제·확정 계약을 검증합니다.
      </p>

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}

      {evidences.length === 0 ? (
        <div className="empty-state stack-sm">
          <strong>검토할 Evidence가 없습니다.</strong>
          <button disabled={isWorking} onClick={prepareFixture} type="button">
            {isWorking ? "준비 중…" : "고정 Evidence 준비"}
          </button>
        </div>
      ) : (
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
                  onChange={(event) => updateEvidence(evidence.id, "summary_ko", event.target.value)}
                  value={evidence.summary_ko ?? ""}
                />
              </label>

              <div className="form-grid">
                <label className="field stack-sm">
                  <span>Pain 유형</span>
                  <input
                    onChange={(event) => updateEvidence(evidence.id, "pain_type", event.target.value)}
                    value={evidence.pain_type ?? ""}
                  />
                </label>
                <label className="field stack-sm">
                  <span>대상 사용자</span>
                  <input
                    onChange={(event) => updateEvidence(evidence.id, "target_user", event.target.value)}
                    value={evidence.target_user ?? ""}
                  />
                </label>
              </div>

              <label className="field stack-sm">
                <span>발생 상황</span>
                <input
                  onChange={(event) => updateEvidence(evidence.id, "situation", event.target.value)}
                  value={evidence.situation ?? ""}
                />
              </label>

              <div className="form-grid">
                <label className="field stack-sm">
                  <span>감정</span>
                  <select
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

          {analysisStatus === "reviewing_evidence" ? (
            <div className="inline-actions">
              <button disabled={isWorking} onClick={saveEvidence} type="button">
                수정 내용 저장
              </button>
              <button
                className="button-secondary"
                disabled={isWorking || evidences.length < 1}
                onClick={confirmEvidence}
                type="button"
              >
                남은 Evidence 확정 및 grouping 진입
              </button>
              <button
                className="button-link"
                disabled={isWorking}
                onClick={loadEvidence}
                type="button"
              >
                서버 재조회
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
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
