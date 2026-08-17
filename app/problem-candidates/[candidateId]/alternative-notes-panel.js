"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./alternative-notes.module.css";

const EMPTY_FORM = Object.freeze({ kind: "service", name: "", url: "", note: "" });

export default function AlternativeNotesPanel({ candidateId }) {
  const [payload, setPayload] = useState({
    notes: [],
    eligibility: { eligible: false, candidate_status: null, analysis_status: null },
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deleteArmedId, setDeleteArmedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(`/api/problem-candidates/${candidateId}/alternatives`, { cache: "no-store" });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "기존 서비스 / 대안 메모를 불러오지 못했습니다."));
      setPayload(result ?? { notes: [], eligibility: { eligible: false } });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createNote(event) {
    event.preventDefault();
    if (!form.name.trim() || isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "기존 서비스 / 대안 메모 추가에 실패했습니다."));
      setForm(EMPTY_FORM);
      setMessage("기존 서비스 / 대안 메모를 추가했습니다.");
      await load();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setIsWorking(false);
    }
  }

  function beginEdit(note) {
    setEditingId(note.id);
    setDeleteArmedId(null);
    setEditForm({
      kind: note.kind,
      name: note.name,
      url: note.url ?? "",
      note: note.note ?? "",
    });
    setError("");
    setMessage("");
  }

  async function saveEdit(noteId) {
    if (!editForm.name.trim() || isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}/alternatives/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "기존 서비스 / 대안 메모 수정에 실패했습니다."));
      setEditingId(null);
      setMessage("기존 서비스 / 대안 메모를 수정했습니다.");
      await load();
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setIsWorking(false);
    }
  }

  async function deleteNote(noteId) {
    if (deleteArmedId !== noteId || isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}/alternatives/${noteId}`, {
        method: "DELETE",
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "기존 서비스 / 대안 메모 삭제에 실패했습니다."));
      setDeleteArmedId(null);
      if (editingId === noteId) setEditingId(null);
      setMessage("기존 서비스 / 대안 메모를 삭제했습니다.");
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setIsWorking(false);
    }
  }

  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const eligible = payload.eligibility?.eligible === true;

  return (
    <section className={`card ${styles.panel}`} aria-labelledby="problem-alternatives-title">
      <div className="section-heading">
        <div className="stack-sm">
          <p className="eyebrow">UC-15 · Manual research asset</p>
          <h2 id="problem-alternatives-title">기존 서비스 / 대안</h2>
          <p className="muted">
            이 문제를 이미 해결하고 있는 서비스나 사용자가 대신 쓰는 방법을 직접 기록합니다.
          </p>
        </div>
        <span className="status-badge">{notes.length} notes</span>
      </div>

      {isLoading ? <p className="muted">기존 서비스 / 대안 메모를 불러오는 중입니다.</p> : null}

      {!isLoading && notes.length ? (
        <div className={styles.noteList}>
          {notes.map((note) => (
            <article className={styles.noteCard} key={note.id} data-alternative-id={note.id}>
              {editingId === note.id ? (
                <div className={styles.editorGrid}>
                  <select
                    aria-label={`${note.name} 종류`}
                    disabled={isWorking}
                    onChange={(event) => setEditForm((current) => ({ ...current, kind: event.target.value }))}
                    value={editForm.kind}
                  >
                    <option value="service">서비스</option>
                    <option value="alternative">대안</option>
                  </select>
                  <input
                    aria-label={`${note.name} 이름`}
                    disabled={isWorking}
                    maxLength={200}
                    onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                    value={editForm.name}
                  />
                  <input
                    aria-label={`${note.name} URL`}
                    className={styles.fullRow}
                    disabled={isWorking}
                    maxLength={2000}
                    onChange={(event) => setEditForm((current) => ({ ...current, url: event.target.value }))}
                    placeholder="https://... (선택)"
                    value={editForm.url}
                  />
                  <textarea
                    aria-label={`${note.name} 메모`}
                    disabled={isWorking}
                    maxLength={4000}
                    onChange={(event) => setEditForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="왜 이 문제의 기존 해결책/대안인지 기록하세요."
                    rows={4}
                    value={editForm.note}
                  />
                  <div className={`inline-actions ${styles.fullRow}`}>
                    <button
                      className="button-compact"
                      disabled={isWorking || !editForm.name.trim()}
                      onClick={() => void saveEdit(note.id)}
                      type="button"
                    >
                      수정 저장
                    </button>
                    <button
                      className="button-secondary button-compact"
                      disabled={isWorking}
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.noteHeader}>
                    <div className={styles.noteTitle}>
                      <span className={styles.kindBadge}>{kindLabel(note.kind)}</span>
                      <strong>{note.name}</strong>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        className="button-secondary button-compact"
                        disabled={isWorking}
                        onClick={() => beginEdit(note)}
                        type="button"
                      >
                        수정
                      </button>
                      {deleteArmedId === note.id ? (
                        <>
                          <button
                            className={`${styles.dangerButton} button-compact`}
                            disabled={isWorking}
                            onClick={() => void deleteNote(note.id)}
                            type="button"
                          >
                            삭제 확정
                          </button>
                          <button
                            className="button-secondary button-compact"
                            disabled={isWorking}
                            onClick={() => setDeleteArmedId(null)}
                            type="button"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <button
                          className={`${styles.dangerButton} button-compact`}
                          disabled={isWorking}
                          onClick={() => setDeleteArmedId(note.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  {note.url ? (
                    <a className={styles.externalLink} href={note.url} rel="noreferrer" target="_blank">
                      {note.url}
                    </a>
                  ) : null}
                  <p className={styles.noteText}>{note.note || "메모 없음"}</p>
                </>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && !notes.length ? (
        <div className="empty-state">
          <strong>아직 기록한 기존 서비스나 대안이 없습니다.</strong>
          <p className="muted">경쟁 서비스, 수동 우회 방법, 다른 도구 등 실제 대안을 기록해 두세요.</p>
        </div>
      ) : null}

      {eligible ? (
        <form className="stack" onSubmit={createNote}>
          <div className="section-heading">
            <div className="stack-sm">
              <strong>새 서비스 / 대안 추가</strong>
              <span className="muted">자동 검색 없이 직접 확인한 사실과 메모만 저장합니다.</span>
            </div>
          </div>
          <div className={styles.editorGrid}>
            <select
              aria-label="종류"
              disabled={isWorking}
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
              value={form.kind}
            >
              <option value="service">서비스</option>
              <option value="alternative">대안</option>
            </select>
            <input
              aria-label="이름"
              disabled={isWorking}
              maxLength={200}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="서비스 또는 대안 이름"
              required
              value={form.name}
            />
            <input
              aria-label="URL"
              className={styles.fullRow}
              disabled={isWorking}
              maxLength={2000}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://... (선택)"
              value={form.url}
            />
            <textarea
              aria-label="메모"
              disabled={isWorking}
              maxLength={4000}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="어떤 방식으로 문제를 해결하는지, 부족한 점은 무엇인지 적어두세요."
              rows={4}
              value={form.note}
            />
          </div>
          <div className="inline-actions">
            <button className="button-compact" disabled={isWorking || !form.name.trim()} type="submit">
              서비스 / 대안 추가
            </button>
          </div>
        </form>
      ) : (
        !isLoading ? (
          <p className="notice warning">
            새 메모는 completed 분석의 confirmed Problem Card에서만 추가할 수 있습니다.
          </p>
        ) : null
      )}

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}
    </section>
  );
}

function kindLabel(kind) {
  return kind === "alternative" ? "대안" : "서비스";
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
  return error instanceof Error && error.message ? error.message : "기존 서비스 / 대안 작업에 실패했습니다.";
}
