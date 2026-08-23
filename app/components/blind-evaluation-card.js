"use client";

import { useEffect, useRef, useState } from "react";

const PROBLEM = ["yes", "no", "uncertain"];
const ACTOR = ["self", "other", "generic", "unknown", "not_applicable"];
const FRICTION = ["concrete", "vague", "none", "unknown"];
const KIND = ["organic", "advertisement", "news", "repost", "informational", "unknown"];

export default function BlindEvaluationCard({ sample }) {
  const [problem, setProblem] = useState("uncertain");
  const [actor, setActor] = useState("unknown");
  const [friction, setFriction] = useState("unknown");
  const [kind, setKind] = useState("unknown");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const formRef = useRef(null);

  function applyPreset(name) {
    if (name === "negative") {
      setProblem("no"); setActor("not_applicable"); setFriction("none"); setKind("unknown"); setEvidence("");
    } else if (name === "positive") {
      setProblem("yes"); setActor("self"); setFriction("concrete"); setKind("organic");
    } else {
      setProblem("uncertain"); setActor("unknown"); setFriction("unknown"); setKind("unknown"); setEvidence("");
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key.toLowerCase() === "n") applyPreset("negative");
      if (event.key.toLowerCase() === "y") applyPreset("positive");
      if (event.key.toLowerCase() === "u") applyPreset("uncertain");
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") formRef.current?.requestSubmit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function captureSelection() {
    const selected = String(window.getSelection()?.toString() ?? "").trim();
    if (!selected) return setError("위 Source Signal에서 evidence 문구를 먼저 드래그하십시오.");
    if (!sample.signal.raw_text.includes(selected)) return setError("선택한 문구가 Source Signal의 연속 문자열이 아닙니다.");
    setEvidence(selected);
    setError(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (problem === "yes" && !evidence.trim()) {
      setError("problem_claim=yes이면 exact evidence_quote가 필요합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/radar/admin/source-signals/${sample.signal.id}/evaluation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_claim: problem,
          experience_actor: actor,
          friction_specificity: friction,
          content_kind: kind,
          evidence_quote: evidence.trim() || null,
          annotator_note: note.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Human evaluation 저장에 실패했습니다.");
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="complaint-review-card">
      <div className="source-result-meta">
        <span>#{sample.sample_rank} · {sample.cohort}{sample.acquisition_bucket ? ` · ${sample.acquisition_bucket}` : ""}</span>
        <span>{sample.signal.source_platform} · {sample.signal.content_scope}</span>
      </div>
      <p className="complaint-signal-text" style={{ fontSize: "1.12rem", lineHeight: 1.8 }}>{sample.signal.raw_text}</p>
      <p className="source-warning">BLIND MODE: classifier/Silver 결과는 이 화면에서 조회하거나 표시하지 않습니다. 위에 보이는 snippet만 판단 근거입니다.</p>

      <div className="source-run-metrics">
        <button type="button" onClick={() => applyPreset("negative")}>N · 문제 없음</button>
        <button type="button" onClick={() => applyPreset("positive")}>Y · 본인 구체 불편</button>
        <button type="button" onClick={() => applyPreset("uncertain")}>U · 애매</button>
      </div>

      <form ref={formRef} className="complaint-gold-form" onSubmit={submit}>
        <div className="complaint-tristate-grid">
          <label>problem claim<select value={problem} onChange={(e) => setProblem(e.target.value)}>{PROBLEM.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>experience actor<select value={actor} onChange={(e) => setActor(e.target.value)}>{ACTOR.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>friction specificity<select value={friction} onChange={(e) => setFriction(e.target.value)}>{FRICTION.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>content kind<select value={kind} onChange={(e) => setKind(e.target.value)}>{KIND.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <label>
          evidence quote — Source Signal에서 exact substring
          <textarea rows="3" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </label>
        <button type="button" onClick={captureSelection}>드래그한 문구를 evidence로 사용</button>
        <label>
          note (선택)
          <textarea rows="2" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="complaint-gold-actions">
          <button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장하고 다음"}</button>
          <small>N/Y/U preset · Ctrl/⌘+Enter 저장</small>
        </div>
        {error ? <p className="source-error" role="alert">{error}</p> : null}
      </form>
    </article>
  );
}
