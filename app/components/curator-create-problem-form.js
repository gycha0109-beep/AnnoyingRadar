"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "요청을 처리하지 못했습니다.");
  }
  return payload;
}

export default function CuratorCreateProblemForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get("title") ?? "").trim(),
      summary: String(form.get("summary") ?? "").trim(),
      target_user: String(form.get("target_user") ?? "").trim() || null,
      situation: String(form.get("situation") ?? "").trim() || null,
      category: String(form.get("category") ?? "").trim() || null,
    };

    try {
      const payload = await readResponse(await fetch("/api/radar/admin/problems", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      const id = payload?.problem?.id;
      if (!id) throw new Error("생성된 Public Problem id를 확인하지 못했습니다.");
      router.push(`/curator/problems/${id}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="curator-create-form" onSubmit={submit}>
      <div>
        <p className="curator-kicker">New Draft</p>
        <h2>Public Problem 생성</h2>
        <p>생성 직후에는 Draft이며 공개되지 않습니다.</p>
      </div>

      <label>
        <span>문제 제목</span>
        <input name="title" maxLength={240} required placeholder="예: 헬스장 혼잡도를 방문 전에 알기 어렵다" />
      </label>
      <label>
        <span>요약</span>
        <textarea name="summary" maxLength={4000} required rows={5} placeholder="반복되는 friction을 한 문단으로 정리합니다." />
      </label>
      <label>
        <span>주로 겪는 사람</span>
        <input name="target_user" maxLength={1000} placeholder="선택" />
      </label>
      <label>
        <span>발생 상황</span>
        <textarea name="situation" maxLength={2000} rows={3} placeholder="선택" />
      </label>
      <label>
        <span>카테고리</span>
        <input name="category" maxLength={120} placeholder="예: 운동" />
      </label>

      {error ? <p className="curator-error" role="alert">{error}</p> : null}
      <button disabled={busy} type="submit">{busy ? "생성 중…" : "Draft 생성"}</button>
    </form>
  );
}
