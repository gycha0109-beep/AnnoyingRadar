"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  MAX_RAW_TEXT_LENGTH,
  apiErrorMessage,
  buildRawInputPayload,
  formatUpdatedAt,
  rawInputPreview,
  sourceTypeLabel,
} from "../../lib/raw-inputs/presentation.mjs";

const EMPTY_FORM = {
  raw_text: "",
  source_type: "manual",
  source_url: "",
  source_memo: "",
  language: "ko",
};

export default function RawInputDashboard() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [recentRawInputs, setRecentRawInputs] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [recentError, setRecentError] = useState("");

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
  }, [router]);

  const refreshRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    setRecentError("");

    try {
      const { response, payload } = await requestRecentRawInputs();

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "최근 입력을 불러오지 못했습니다."),
        );
      }

      setRecentRawInputs(Array.isArray(payload?.raw_inputs) ? payload.raw_inputs : []);
    } catch (error) {
      setRecentError(errorMessage(error, "최근 입력을 불러오지 못했습니다."));
    } finally {
      setIsLoadingRecent(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    let active = true;

    async function loadInitialRecent() {
      try {
        const { response, payload } = await requestRecentRawInputs();

        if (!active) {
          return;
        }

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        if (!response.ok) {
          throw new Error(
            apiErrorMessage(payload, "최근 입력을 불러오지 못했습니다."),
          );
        }

        setRecentRawInputs(Array.isArray(payload?.raw_inputs) ? payload.raw_inputs : []);
      } catch (error) {
        if (active) {
          setRecentError(errorMessage(error, "최근 입력을 불러오지 못했습니다."));
        }
      } finally {
        if (active) {
          setIsLoadingRecent(false);
        }
      }
    }

    void loadInitialRecent();

    return () => {
      active = false;
    };
  }, [redirectToLogin]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");

    let payload;
    try {
      payload = buildRawInputPayload(form);
    } catch (error) {
      setSubmitError(errorMessage(error, "입력 내용을 확인해 주세요."));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/raw-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await readJson(response);

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(responsePayload, "Raw Input을 저장하지 못했습니다."),
        );
      }

      const rawInputId = responsePayload?.raw_input_id;
      if (!rawInputId) {
        throw new Error("저장 응답에 Raw Input ID가 없습니다.");
      }

      router.push(`/raw-inputs/${rawInputId}`);
    } catch (error) {
      setSubmitError(errorMessage(error, "Raw Input을 저장하지 못했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="workspace-grid">
      <section className="card stack" id="new-input" aria-labelledby="new-input-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">새 분석</p>
            <h2 id="new-input-title">불만 원문 입력</h2>
          </div>
          <span className="status-badge">input_saved</span>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field stack-sm">
            <span>원문</span>
            <textarea
              autoFocus
              maxLength={MAX_RAW_TEXT_LENGTH}
              name="raw_text"
              onChange={updateField}
              placeholder="리뷰, 커뮤니티 글, 인터뷰 메모처럼 실제 불편이 드러나는 텍스트를 붙여넣으세요."
              required
              rows={14}
              value={form.raw_text}
            />
            <span className="field-help">
              {form.raw_text.length.toLocaleString("ko-KR")} / {MAX_RAW_TEXT_LENGTH.toLocaleString("ko-KR")}자
            </span>
          </label>

          <div className="form-grid">
            <label className="field stack-sm">
              <span>출처 유형</span>
              <select name="source_type" onChange={updateField} value={form.source_type}>
                <option value="manual">직접 입력</option>
                <option value="review">리뷰</option>
                <option value="community">커뮤니티</option>
                <option value="interview">인터뷰</option>
                <option value="other">기타</option>
              </select>
            </label>

            <label className="field stack-sm">
              <span>언어</span>
              <select name="language" onChange={updateField} value={form.language}>
                <option value="ko">한국어</option>
                <option value="en">영어</option>
                <option value="ja">일본어</option>
                <option value="zh">중국어</option>
                <option value="other">기타</option>
              </select>
            </label>
          </div>

          <label className="field stack-sm">
            <span>출처 URL</span>
            <input
              name="source_url"
              onChange={updateField}
              placeholder="https://..."
              type="url"
              value={form.source_url}
            />
          </label>

          <label className="field stack-sm">
            <span>출처 메모</span>
            <input
              name="source_memo"
              onChange={updateField}
              placeholder="어디서, 왜 수집한 텍스트인지 남겨두세요."
              value={form.source_memo}
            />
          </label>

          {submitError ? <p className="notice error" role="alert">{submitError}</p> : null}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "저장 중…" : "Raw Input 저장"}
          </button>
        </form>
      </section>

      <aside className="card stack recent-panel" aria-labelledby="recent-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">재진입</p>
            <h2 id="recent-title">최근 입력 3개</h2>
          </div>
          <button
            className="button-secondary button-compact"
            disabled={isLoadingRecent}
            onClick={refreshRecent}
            type="button"
          >
            새로고침
          </button>
        </div>

        {isLoadingRecent ? <p className="muted">불러오는 중…</p> : null}
        {recentError ? <p className="notice error" role="alert">{recentError}</p> : null}

        {!isLoadingRecent && !recentError && recentRawInputs.length === 0 ? (
          <div className="empty-state">
            <strong>아직 저장된 입력이 없습니다.</strong>
            <p className="muted">첫 Raw Input을 저장하면 여기에 표시됩니다.</p>
          </div>
        ) : null}

        <div className="recent-list">
          {recentRawInputs.map((rawInput) => (
            <Link className="recent-item" href={`/raw-inputs/${rawInput.id}`} key={rawInput.id}>
              <div className="recent-meta">
                <span>{sourceTypeLabel(rawInput.source_type)}</span>
                <time dateTime={rawInput.updated_at}>{formatUpdatedAt(rawInput.updated_at)}</time>
              </div>
              <strong>{rawInputPreview(rawInput.raw_text)}</strong>
              <span className="muted">{rawInput.analysis_status}</span>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}

async function requestRecentRawInputs() {
  const response = await fetch("/api/raw-inputs/recent", {
    cache: "no-store",
  });
  const payload = await readJson(response);
  return { response, payload };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(error, fallbackMessage) {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}
