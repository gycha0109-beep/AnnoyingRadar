"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MAX_RAW_TEXT_LENGTH,
  apiErrorMessage,
  buildRawInputPayload,
  formatUpdatedAt,
  hasRawInputChanges,
  rawInputFormFromRecord,
} from "../../../lib/raw-inputs/presentation.mjs";

export default function RawInputEditor({ rawInputId }) {
  const router = useRouter();
  const [rawInput, setRawInput] = useState(null);
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const hasChanges = useMemo(
    () => Boolean(form && hasRawInputChanges(rawInput, form)),
    [form, rawInput],
  );

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
  }, [router]);

  const loadRawInput = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}`, {
        cache: "no-store",
      });
      const payload = await readJson(response);

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "Raw Input을 불러오지 못했습니다."));
      }

      const nextRawInput = payload?.raw_input;
      if (!nextRawInput) {
        throw new Error("조회 응답에 Raw Input 데이터가 없습니다.");
      }

      setRawInput(nextRawInput);
      setForm(rawInputFormFromRecord(nextRawInput));
    } catch (error) {
      setLoadError(errorMessage(error, "Raw Input을 불러오지 못했습니다."));
    } finally {
      setIsLoading(false);
    }
  }, [rawInputId, redirectToLogin]);

  useEffect(() => {
    loadRawInput();
  }, [loadRawInput]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSaveError("");
    setSaveMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");
    setSaveMessage("");

    let payload;
    try {
      payload = buildRawInputPayload(form);
    } catch (error) {
      setSaveError(errorMessage(error, "입력 내용을 확인해 주세요."));
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/raw-inputs/${rawInputId}`, {
        method: "PATCH",
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
          apiErrorMessage(responsePayload, "Raw Input을 수정하지 못했습니다."),
        );
      }

      const updatedRawInput = responsePayload?.raw_input;
      if (!updatedRawInput) {
        throw new Error("수정 응답에 Raw Input 데이터가 없습니다.");
      }

      setRawInput(updatedRawInput);
      setForm(rawInputFormFromRecord(updatedRawInput));
      setSaveMessage("변경 내용을 저장하고 서버 응답 기준선과 동기화했습니다.");
    } catch (error) {
      setSaveError(errorMessage(error, "Raw Input을 수정하지 못했습니다."));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <section className="card"><p className="muted">Raw Input을 불러오는 중…</p></section>;
  }

  if (loadError) {
    return (
      <section className="card stack">
        <p className="notice error" role="alert">{loadError}</p>
        <div className="inline-actions">
          <button className="button-secondary" onClick={loadRawInput} type="button">다시 시도</button>
          <Link className="button-link" href="/">홈으로 이동</Link>
        </div>
      </section>
    );
  }

  if (!rawInput || !form) {
    return <section className="card"><p className="muted">로그인 화면으로 이동하는 중…</p></section>;
  }

  return (
    <section className="card stack" aria-labelledby="raw-input-title">
      <div className="section-heading detail-heading">
        <div>
          <p className="eyebrow">Raw Input 상세</p>
          <h1 id="raw-input-title">원문 검토 및 수정</h1>
          <p className="muted record-id">{rawInput.id}</p>
        </div>
        <div className="detail-statuses">
          <span className="status-badge">{rawInput.analysis_status}</span>
          <time className="muted" dateTime={rawInput.updated_at}>
            {formatUpdatedAt(rawInput.updated_at)} 수정
          </time>
        </div>
      </div>

      <div className="notice warning">
        원문을 바꾸면 기존 draft·discarded Candidate와 Link가 정리되고 Evidence는 deleted 처리됩니다.
        confirmed Candidate가 있으면 서버가 409로 수정을 차단합니다.
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field stack-sm">
          <span>원문</span>
          <textarea
            maxLength={MAX_RAW_TEXT_LENGTH}
            name="raw_text"
            onChange={updateField}
            required
            rows={16}
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
              <option value="">미지정</option>
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
              <option value="">미지정</option>
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
          <input inputMode="url" name="source_url" onChange={updateField} value={form.source_url} />
        </label>

        <label className="field stack-sm">
          <span>출처 메모</span>
          <input name="source_memo" onChange={updateField} value={form.source_memo} />
        </label>

        {saveError ? <p className="notice error" role="alert">{saveError}</p> : null}
        {saveMessage ? <p className="notice success" role="status">{saveMessage}</p> : null}

        <div className="inline-actions">
          <button disabled={isSaving || !hasChanges} type="submit">
            {isSaving ? "저장 중…" : hasChanges ? "변경 사항 저장" : "변경 사항 없음"}
          </button>
          <button
            className="button-secondary"
            disabled={isSaving || !hasChanges}
            onClick={() => setForm(rawInputFormFromRecord(rawInput))}
            type="button"
          >
            변경 취소
          </button>
          <Link className="button-link" href="/#new-input">새 입력 만들기</Link>
        </div>
      </form>
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

function errorMessage(error, fallbackMessage) {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}
