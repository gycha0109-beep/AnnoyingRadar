"use client";

import { useState } from "react";

const TRI_STATE_OPTIONS = [
  ["uncertain", "uncertain"],
  ["yes", "yes"],
  ["no", "no"],
];

export default function SourceSignalComplaintReview({ signal, modelConfigured }) {
  const [classification, setClassification] = useState(signal.classification ?? null);
  const [annotation, setAnnotation] = useState(signal.gold_annotation ?? null);
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function classify() {
    setClassifying(true);
    setError(null);
    try {
      const response = await fetch(`/api/radar/admin/source-signals/${signal.id}/classify`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Complaint 분류에 실패했습니다.");
      setClassification(payload.classification ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setClassifying(false);
    }
  }

  async function saveGold(event) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = {
      complaint_relevant: String(form.get("complaint_relevant") ?? "uncertain"),
      first_hand_experience: String(form.get("first_hand_experience") ?? "uncertain"),
      concrete_friction: String(form.get("concrete_friction") ?? "uncertain"),
      spam_or_ad: form.get("spam_or_ad") === "on",
      repost_or_copy: form.get("repost_or_copy") === "on",
      news_only: form.get("news_only") === "on",
      generic_negative_only: form.get("generic_negative_only") === "on",
      core_evidence: String(form.get("core_evidence") ?? ""),
      annotator_note: String(form.get("annotator_note") ?? ""),
    };

    try {
      const response = await fetch(`/api/radar/admin/source-signals/${signal.id}/gold`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Gold annotation 저장에 실패했습니다.");
      setAnnotation(payload.annotation ?? null);
      setSaved(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  }

  const defaultGold = annotation ?? {
    complaint_relevant: "uncertain",
    first_hand_experience: "uncertain",
    concrete_friction: "uncertain",
    spam_or_ad: false,
    repost_or_copy: false,
    news_only: false,
    generic_negative_only: false,
    core_evidence: "",
    annotator_note: "",
  };

  return (
    <article className="complaint-review-card">
      <div className="source-result-meta">
        <span>@{signal.author_handle || "unknown"}</span>
        <span>{signal.source_platform}</span>
      </div>
      <p className="complaint-signal-text">{signal.raw_text}</p>
      <div className="source-signal-footer">
        <small>{signal.external_content_id}</small>
        {signal.canonical_url ? (
          <a href={signal.canonical_url} target="_blank" rel="noreferrer">원문 ↗</a>
        ) : null}
      </div>

      <section className="complaint-machine-panel" aria-label="Complaint classifier result">
        <div className="complaint-machine-heading">
          <strong>Gate result</strong>
          {classification ? (
            <span className={`complaint-decision complaint-decision-${classification.final_decision}`}>
              {classification.final_decision}
            </span>
          ) : <span className="source-not-configured">not classified</span>}
        </div>
        {classification ? (
          <div className="complaint-machine-details">
            <span>complaint <strong>{classification.complaint_relevant}</strong></span>
            <span>first-hand <strong>{classification.first_hand_experience}</strong></span>
            <span>friction <strong>{classification.concrete_friction}</strong></span>
            <span>confidence <strong>{classification.confidence ?? "-"}</strong></span>
            <small>{(classification.reason_codes ?? []).join(" · ") || "no reason"}</small>
          </div>
        ) : null}
        <button type="button" onClick={classify} disabled={classifying}>
          {classifying ? "분류 중…" : classification ? "다시 분류" : "Complaint 분류"}
        </button>
        {!modelConfigured ? (
          <p className="source-warning">OpenAI credential이 없습니다. deterministic hard-reject는 실행할 수 있지만 모델 판단이 필요한 Signal은 503으로 종료됩니다.</p>
        ) : null}
      </section>

      <form className="complaint-gold-form" onSubmit={saveGold} key={annotation?.updated_at ?? "new"}>
        <div className="complaint-gold-heading">
          <strong>Gold Set v0.1</strong>
          {annotation?.reviewed_at ? <small>reviewed {new Date(annotation.reviewed_at).toLocaleString("ko-KR")}</small> : null}
        </div>
        <div className="complaint-tristate-grid">
          <label>
            complaint relevant
            <select name="complaint_relevant" defaultValue={defaultGold.complaint_relevant}>
              {TRI_STATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            first-hand
            <select name="first_hand_experience" defaultValue={defaultGold.first_hand_experience}>
              {TRI_STATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            concrete friction
            <select name="concrete_friction" defaultValue={defaultGold.concrete_friction}>
              {TRI_STATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="complaint-noise-grid">
          <label><input name="spam_or_ad" type="checkbox" defaultChecked={defaultGold.spam_or_ad} /> spam/ad</label>
          <label><input name="repost_or_copy" type="checkbox" defaultChecked={defaultGold.repost_or_copy} /> repost/copy</label>
          <label><input name="news_only" type="checkbox" defaultChecked={defaultGold.news_only} /> news-only</label>
          <label><input name="generic_negative_only" type="checkbox" defaultChecked={defaultGold.generic_negative_only} /> generic negative</label>
        </div>
        <label>
          core evidence — 원문에서 그대로 복사
          <textarea name="core_evidence" rows="2" defaultValue={defaultGold.core_evidence ?? ""} />
        </label>
        <label>
          annotator note
          <textarea name="annotator_note" rows="2" maxLength={4000} defaultValue={defaultGold.annotator_note ?? ""} />
        </label>
        <div className="complaint-gold-actions">
          <button type="submit" disabled={saving}>{saving ? "저장 중…" : "Gold label 저장"}</button>
          {saved ? <span className="source-configured">saved</span> : null}
        </div>
      </form>

      {error ? <p className="source-error" role="alert">{error}</p> : null}
    </article>
  );
}
