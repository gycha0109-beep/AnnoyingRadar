"use client";

import { useState } from "react";

export default function BlindEvaluationControl({ evaluation }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function post(path) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "요청에 실패했습니다.");
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!evaluation.initialized) {
    return (
      <div className="complaint-gold-actions">
        <button type="button" disabled={busy} onClick={() => post("/api/radar/admin/source-signals/evaluation/initialize")}>
          {busy ? "고정 중…" : "Blind evaluation 120개 고정"}
        </button>
        {error ? <p className="source-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="source-run-metrics">
        <span>human labeled <strong>{evaluation.labeled}</strong> / {evaluation.target}</span>
        <span>representative <strong>{evaluation.representative}</strong></span>
        <span>challenge <strong>{evaluation.challenge}</strong></span>
        <span>status <strong>{evaluation.status}</strong></span>
      </div>
      <div className="complaint-gold-actions">
        {evaluation.status === "labeling" && evaluation.labeled < evaluation.target ? (
          <a className="source-primary-link" href="/curator/sources/evaluation">Blind labeling 시작/계속</a>
        ) : null}
        {evaluation.status === "labeling" && evaluation.labeled === evaluation.target ? (
          <button type="button" disabled={busy} onClick={() => post("/api/radar/admin/source-signals/evaluation/lock")}>
            {busy ? "잠금 중…" : "Human evaluation 잠금"}
          </button>
        ) : null}
      </div>
      {error ? <p className="source-error">{error}</p> : null}
    </div>
  );
}
