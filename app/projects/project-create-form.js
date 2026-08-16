"use client";

import { useState } from "react";

export default function ProjectCreateForm() {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  async function createProject(event) {
    event.preventDefault();
    if (isWorking) return;
    setIsWorking(true);
    setError("");

    try {
      const response = await fetch("/api/research-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, purpose: purpose || null }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Research Project 생성에 실패했습니다."));
      const projectId = payload?.project?.id;
      if (!projectId) throw new Error("생성된 Research Project를 확인할 수 없습니다.");
      window.location.assign(`/projects/${projectId}`);
    } catch (createError) {
      setError(errorMessage(createError));
      setIsWorking(false);
    }
  }

  return (
    <form className="card stack" onSubmit={createProject}>
      <div>
        <p className="eyebrow">New Research Project</p>
        <h2>리서치 프로젝트 생성</h2>
        <p className="muted">검증할 문제와 아이디어를 묶는 조사 단위입니다. Task나 일정 관리 기능은 포함하지 않습니다.</p>
      </div>
      <label className="field stack-sm">
        <span>프로젝트 이름</span>
        <input
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 프리랜서 결제 문제"
          required
          value={title}
        />
      </label>
      <label className="field stack-sm">
        <span>조사 목적</span>
        <textarea
          maxLength={4000}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="이 프로젝트에서 어떤 문제와 아이디어를 함께 검토할지 기록하세요."
          rows={4}
          value={purpose}
        />
      </label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button disabled={isWorking || !title.trim()} type="submit">
        {isWorking ? "생성 중..." : "Research Project 생성"}
      </button>
    </form>
  );
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
  return error instanceof Error && error.message ? error.message : "Research Project 생성에 실패했습니다.";
}
