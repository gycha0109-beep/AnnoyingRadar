"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";

const HUMAN_DECISIONS = Object.freeze([
  { value: "candidate", label: "A · Candidate", help: "제목/문맥만으로 complaint-central이라고 판단" },
  { value: "review", label: "B · Needs context", help: "원문을 더 봐야 판단 가능" },
  { value: "reject", label: "C · Reject", help: "Problem Discovery 수집 대상이 아님" },
]);

const GROUPS = Object.freeze([
  {
    id: "boundary",
    title: "Set A · Boundary",
    description: "현재 gate가 경계로 남긴 항목입니다. 기계 판정과 reason code는 화면에 노출하지 않습니다.",
    key: "boundary_set",
  },
  {
    id: "reject_risk",
    title: "Set B · Adversarial",
    description: "운영 gate와 별도인 high-recall audit probe가 수상하다고 표시한 항목입니다. probe는 정답을 내리지 않습니다.",
    key: "reject_risk_set",
  },
  {
    id: "reject_random",
    title: "Set C · Random control",
    description: "Adversarial 후보를 제외한 REJECT에서 고정 seed로 뽑은 대조군입니다.",
    key: "reject_random_set",
  },
]);

const LOCAL_CHANGE_EVENT = "annoying-radar-source-audit-local-change";

export default function SourceAdmissionIndependentAudit({ audit }) {
  const storageKey = `annoying-radar:${audit.manifest.audit_version}:${audit.manifest.admission_version}:${audit.manifest.pool_fingerprint}`;
  const allItems = useMemo(() => GROUPS.flatMap((group) => audit[group.key]), [audit]);
  const validIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);
  const rawSnapshot = useSyncExternalStore(
    subscribeToAuditStorage,
    () => window.localStorage.getItem(storageKey) ?? "",
    () => "",
  );
  const labels = useMemo(() => labelsFromSnapshot(rawSnapshot, validIds), [rawSnapshot, validIds]);
  const [activeGroupId, setActiveGroupId] = useState("boundary");
  const [cursorByGroup, setCursorByGroup] = useState({ boundary: 0, reject_risk: 0, reject_random: 0 });
  const [message, setMessage] = useState("브라우저에만 저장됩니다. production DB에는 쓰지 않습니다.");
  const importRef = useRef(null);

  const activeGroup = GROUPS.find((group) => group.id === activeGroupId) ?? GROUPS[0];
  const activeItems = audit[activeGroup.key];
  const activeCursor = Math.min(cursorByGroup[activeGroup.id] ?? 0, Math.max(0, activeItems.length - 1));
  const currentItem = activeItems[activeCursor] ?? null;
  const currentLabel = currentItem ? labels[currentItem.id]?.decision ?? null : null;

  const progress = Object.fromEntries(GROUPS.map((group) => {
    const items = audit[group.key];
    const completed = items.filter((item) => labels[item.id]?.decision).length;
    return [group.id, { completed, total: items.length }];
  }));

  const totals = countDecisions(labels);
  const completedCount = Object.keys(labels).filter((id) => validIds.has(id)).length;
  const allCompleted = allItems.length > 0 && completedCount === allItems.length;

  function persist(nextLabels) {
    const payload = {
      audit_version: audit.manifest.audit_version,
      admission_version: audit.manifest.admission_version,
      pool_fingerprint: audit.manifest.pool_fingerprint,
      updated_at: new Date().toISOString(),
      labels: nextLabels,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  }

  function labelCurrent(decision) {
    if (!currentItem) return;
    const nextLabels = {
      ...labels,
      [currentItem.id]: {
        decision,
        set: currentItem.set,
        reviewed_at: new Date().toISOString(),
      },
    };
    persist(nextLabels);
    setMessage("저장했습니다.");
    if (activeCursor < activeItems.length - 1) {
      setCursorByGroup((current) => ({ ...current, [activeGroup.id]: activeCursor + 1 }));
    }
  }

  function move(delta) {
    if (!activeItems.length) return;
    setCursorByGroup((current) => ({
      ...current,
      [activeGroup.id]: Math.max(0, Math.min(activeItems.length - 1, activeCursor + delta)),
    }));
  }

  function jumpToFirstIncomplete(group) {
    const items = audit[group.key];
    const firstIncomplete = items.findIndex((item) => !labels[item.id]?.decision);
    setActiveGroupId(group.id);
    setCursorByGroup((current) => ({
      ...current,
      [group.id]: firstIncomplete >= 0 ? firstIncomplete : 0,
    }));
  }

  function exportJson() {
    const payload = buildExportPayload(audit, labels);
    downloadBlob(
      `phase15-5e-independent-audit-${audit.manifest.pool_fingerprint}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    setMessage("JSON을 내보냈습니다.");
  }

  function exportCsv() {
    const rows = allItems.map((item) => ({
      set: item.set,
      source_signal_id: item.id,
      human_decision: labels[item.id]?.decision ?? "",
      reviewed_at: labels[item.id]?.reviewed_at ?? "",
      title: item.title,
      snippet: item.snippet,
      canonical_url: item.canonical_url ?? "",
      audit_risk_codes: item.audit_risk_codes.join("|"),
      audit_risk_scopes: item.audit_risk_scopes.join("|"),
    }));
    downloadBlob(
      `phase15-5e-independent-audit-${audit.manifest.pool_fingerprint}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8",
    );
    setMessage("CSV를 내보냈습니다.");
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (
        parsed?.manifest?.audit_version !== audit.manifest.audit_version
        || parsed?.manifest?.pool_fingerprint !== audit.manifest.pool_fingerprint
      ) {
        setMessage("현재 audit protocol/pool과 다른 JSON이라 불러오지 않았습니다.");
        return;
      }

      const restored = sanitizeLabels(parsed?.labels, validIds);
      persist(restored);
      const previousAdmission = parsed?.manifest?.admission_version;
      const versionNote = previousAdmission && previousAdmission !== audit.manifest.admission_version
        ? ` (${previousAdmission} → ${audit.manifest.admission_version} 재사용)`
        : "";
      setMessage(`${Object.keys(restored).length}개 기존 인간 판정을 불러왔습니다${versionNote}. 현재 set에 없는 ID는 자동 제외했습니다.`);
    } catch {
      setMessage("JSON 파일을 읽지 못했습니다.");
    }
  }

  function clearAudit() {
    if (!window.confirm("이 브라우저의 현재 audit 판정을 전부 지우시겠습니까?")) return;
    window.localStorage.removeItem(storageKey);
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
    setCursorByGroup({ boundary: 0, reject_risk: 0, reject_random: 0 });
    setMessage("현재 브라우저 audit 저장값을 삭제했습니다.");
  }

  return (
    <div className="source-audit-stack">
      <section className="source-audit-summary" aria-label="Independent audit manifest">
        <div className="source-run-metrics">
          <span>admission <strong>{audit.manifest.admission_version}</strong></span>
          <span>development <strong>{audit.manifest.eligible}</strong></span>
          <span>candidate <strong>{audit.manifest.candidate_count}</strong></span>
          <span>boundary <strong>{audit.manifest.boundary_count}</strong></span>
          <span>reject <strong>{audit.manifest.reject_count}</strong></span>
          <span>risk sweep <strong>{audit.manifest.reject_risk_count}</strong></span>
          <span>random control <strong>{audit.manifest.reject_random_count}</strong></span>
          <span>blind excluded <strong>{audit.manifest.blind_excluded}</strong></span>
        </div>
        <p className="source-lab-copy">pool fingerprint: <code>{audit.manifest.pool_fingerprint}</code> · 저장 위치: browser localStorage · DB write 없음</p>
      </section>

      <section className="source-audit-tabs" aria-label="Audit sets">
        {GROUPS.map((group) => (
          <button
            className={activeGroupId === group.id ? "source-audit-tab active" : "source-audit-tab"}
            key={group.id}
            onClick={() => jumpToFirstIncomplete(group)}
            type="button"
          >
            <strong>{group.title}</strong>
            <span>{progress[group.id].completed} / {progress[group.id].total}</span>
          </button>
        ))}
      </section>

      <section className="source-lab-panel source-audit-panel">
        <div className="source-lab-heading">
          <div>
            <p className="curator-kicker">{activeGroup.title}</p>
            <h2>{activeItems.length ? `${activeCursor + 1} / ${activeItems.length}` : "0 / 0"}</h2>
          </div>
          <span>{progress[activeGroup.id].completed}개 판정 완료</span>
        </div>
        <p className="source-lab-copy">{activeGroup.description}</p>

        {currentItem ? (
          <article className="source-audit-card">
            <header>
              <h3>{currentItem.title || "제목 없음"}</h3>
              {currentItem.author_handle ? <small>{currentItem.author_handle}</small> : null}
            </header>
            <div className="source-audit-snippet">
              <p>{currentItem.snippet || "검색 snippet 없음"}</p>
            </div>
            <div className="source-audit-source-actions">
              {currentItem.canonical_url ? (
                <a className="source-audit-link" href={currentItem.canonical_url} target="_blank" rel="noreferrer">원문 열기</a>
              ) : <span>원문 URL 없음</span>}
              <code>{currentItem.id}</code>
            </div>

            <div className="source-audit-decision-grid" aria-label="Human decision">
              {HUMAN_DECISIONS.map((option) => (
                <button
                  className={currentLabel === option.value ? `source-audit-decision selected ${option.value}` : `source-audit-decision ${option.value}`}
                  key={option.value}
                  onClick={() => labelCurrent(option.value)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.help}</span>
                </button>
              ))}
            </div>

            <div className="source-audit-navigation">
              <button className="button-secondary button-compact" disabled={activeCursor === 0} onClick={() => move(-1)} type="button">이전</button>
              <span>{currentLabel ? `현재 판정: ${currentLabel}` : "미판정"}</span>
              <button className="button-secondary button-compact" disabled={activeCursor >= activeItems.length - 1} onClick={() => move(1)} type="button">다음</button>
            </div>
          </article>
        ) : <p className="source-empty">이 set에는 검토 항목이 없습니다.</p>}
      </section>

      <section className="source-lab-panel source-audit-results">
        <div className="source-lab-heading">
          <div>
            <p className="curator-kicker">Human Audit Result</p>
            <h2>{allCompleted ? "모든 audit item 판정 완료" : "진행 중"}</h2>
          </div>
          <span>{completedCount} / {allItems.length}</span>
        </div>
        <div className="source-run-metrics">
          <span>Candidate <strong>{totals.candidate}</strong></span>
          <span>Needs context <strong>{totals.review}</strong></span>
          <span>Reject <strong>{totals.reject}</strong></span>
        </div>
        <p className="source-lab-copy">{message}</p>
        <div className="source-audit-export-actions">
          <button className="button-secondary button-compact" onClick={exportJson} type="button">JSON 내보내기</button>
          <button className="button-secondary button-compact" onClick={exportCsv} type="button">CSV 내보내기</button>
          <button className="button-secondary button-compact" onClick={() => importRef.current?.click()} type="button">JSON 불러오기</button>
          <button className="button-secondary button-compact" onClick={clearAudit} type="button">브라우저 저장 초기화</button>
          <input ref={importRef} className="source-audit-file-input" accept="application/json,.json" onChange={importJson} type="file" />
        </div>
      </section>
    </div>
  );
}

function subscribeToAuditStorage(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_CHANGE_EVENT, callback);
  };
}

function labelsFromSnapshot(rawSnapshot, validIds) {
  if (!rawSnapshot) return {};
  try {
    return sanitizeLabels(JSON.parse(rawSnapshot)?.labels, validIds);
  } catch {
    return {};
  }
}

function sanitizeLabels(value, validIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cleaned = {};
  for (const [id, label] of Object.entries(value)) {
    if (!validIds.has(id)) continue;
    if (!HUMAN_DECISIONS.some((option) => option.value === label?.decision)) continue;
    cleaned[id] = {
      decision: label.decision,
      set: typeof label.set === "string" ? label.set : null,
      reviewed_at: typeof label.reviewed_at === "string" ? label.reviewed_at : null,
    };
  }
  return cleaned;
}

function countDecisions(labels) {
  const counts = { candidate: 0, review: 0, reject: 0 };
  for (const label of Object.values(labels)) {
    if (label?.decision in counts) counts[label.decision] += 1;
  }
  return counts;
}

function buildExportPayload(audit, labels) {
  return {
    exported_at: new Date().toISOString(),
    manifest: audit.manifest,
    labels,
    sets: {
      boundary: audit.boundary_set,
      reject_risk: audit.reject_risk_set,
      reject_random: audit.reject_random_set,
    },
  };
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? {
    set: "",
    source_signal_id: "",
    human_decision: "",
    reviewed_at: "",
    title: "",
    snippet: "",
    canonical_url: "",
    audit_risk_codes: "",
    audit_risk_scopes: "",
  });
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
