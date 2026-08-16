"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const EMPTY_FORM = { category: "", memo: "" };

export default function SavedProblemPanel({ candidateId }) {
  const [payload, setPayload] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal) => {
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}/save`, {
        cache: "no-store",
        signal,
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Saved Problem 정보를 불러오지 못했습니다."));
      setPayload(result);
      setForm(formFrom(result?.saved_problem));
    } catch (loadError) {
      if (loadError?.name !== "AbortError") setError(errorMessage(loadError));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveProblem() {
    await mutate(`/api/problem-candidates/${candidateId}/save`, {
      method: "POST",
    }, "Problem Card를 Saved Problems에 저장했습니다.");
  }

  async function saveMetadata(event) {
    event.preventDefault();
    await mutate(`/api/problem-candidates/${candidateId}/save`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: form.category, memo: form.memo }),
    }, "Saved Problem 메타데이터를 저장했습니다.");
  }

  async function changeStatus(status) {
    await mutate(`/api/problem-candidates/${candidateId}/save/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }, status === "archived" ? "Saved Problem을 보관했습니다." : "Saved Problem을 복구했습니다.");
  }

  async function mutate(url, options, successMessage) {
    if (isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(url, options);
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Saved Problem 작업에 실패했습니다."));
      const savedProblem = result?.saved_problem ?? null;
      setPayload((current) => ({
        ...(current ?? {}),
        saved_problem: savedProblem,
        eligibility: current?.eligibility ?? { eligible: true, reason: null },
      }));
      setForm(formFrom(savedProblem));
      setMessage(successMessage);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) {
    return (
      <section className="card stack" aria-labelledby="saved-problem-title">
        <p className="eyebrow">Saved Problem</p>
        <h2 id="saved-problem-title">Problem Card 저장 상태</h2>
        <p className="muted">저장 상태를 불러오는 중입니다.</p>
      </section>
    );
  }

  const savedProblem = payload?.saved_problem ?? null;
  const eligibility = payload?.eligibility ?? { eligible: false, reason: "source_unavailable" };
  if (!savedProblem && !eligibility.eligible) return null;

  return (
    <section className="card stack" id="saved-problem" aria-labelledby="saved-problem-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Saved Problem</p>
          <h2 id="saved-problem-title">Problem Card 관리</h2>
        </div>
        <div className="inline-actions">
          {savedProblem ? <span className="status-badge">{savedProblem.status}</span> : null}
          <Link className="button-link button-compact" href="/problems">Saved Problems</Link>
        </div>
      </div>

      <p className="muted">
        Problem Card 본문과 Idea lifecycle은 변경하지 않고, 개인 관리용 카테고리와 메모만 별도로 저장합니다.
      </p>

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}

      {!savedProblem ? (
        <button disabled={isWorking} onClick={saveProblem} type="button">
          {isWorking ? "저장 중..." : "Problem Card 저장"}
        </button>
      ) : (
        <form className="stack" onSubmit={saveMetadata}>
          <label className="field stack-sm">
            <span>카테고리</span>
            <input
              maxLength={120}
              name="category"
              onChange={updateField}
              placeholder="예: 생산성, 쇼핑, 개발도구"
              value={form.category}
            />
          </label>
          <label className="field stack-sm">
            <span>메모</span>
            <textarea
              maxLength={4000}
              name="memo"
              onChange={updateField}
              placeholder="왜 저장했는지, 다음에 무엇을 확인할지 기록하세요."
              rows={5}
              value={form.memo}
            />
          </label>
          <div className="inline-actions saved-problem-actions">
            <button disabled={isWorking} type="submit">Saved Problem 메타데이터 저장</button>
            {savedProblem.status === "active" ? (
              <button
                className="button-secondary"
                disabled={isWorking}
                onClick={() => changeStatus("archived")}
                type="button"
              >
                Saved Problem 보관
              </button>
            ) : (
              <button
                className="button-secondary"
                disabled={isWorking}
                onClick={() => changeStatus("active")}
                type="button"
              >
                Saved Problem 복구
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function formFrom(savedProblem) {
  return {
    category: savedProblem?.category ?? "",
    memo: savedProblem?.memo ?? "",
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
    : "Saved Problem 작업에 실패했습니다.";
}
