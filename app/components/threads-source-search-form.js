"use client";

import { useState } from "react";

export default function ThreadsSourceSearchForm({ configured }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    const form = new FormData(event.currentTarget);
    const body = {
      q: String(form.get("q") ?? ""),
      search_type: String(form.get("search_type") ?? "RECENT"),
      search_mode: String(form.get("search_mode") ?? "KEYWORD"),
      limit: Number(form.get("limit") ?? 25),
      since: String(form.get("since") ?? "") || null,
      until: String(form.get("until") ?? "") || null,
    };

    try {
      const response = await fetch("/api/radar/admin/sources/threads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Threads 검색에 실패했습니다.");
      }
      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="source-lab-panel" aria-labelledby="threads-search-title">
      <div className="source-lab-heading">
        <div>
          <p className="curator-kicker">Source Adapter</p>
          <h2 id="threads-search-title">Threads 공개 글 검색</h2>
        </div>
        <span className={configured ? "source-configured" : "source-not-configured"}>
          {configured ? "token configured" : "token missing"}
        </span>
      </div>

      <p className="source-lab-copy">
        공식 Threads keyword search API에서 공개 글을 가져와 Source Signal로 정규화하고 중복 없이 저장합니다.
      </p>

      <form className="source-search-form" onSubmit={submit}>
        <label>
          검색어
          <input name="q" required maxLength={120} placeholder="예: 배달 최소주문" />
        </label>
        <div className="source-form-row">
          <label>
            정렬
            <select name="search_type" defaultValue="RECENT">
              <option value="RECENT">RECENT</option>
              <option value="TOP">TOP</option>
            </select>
          </label>
          <label>
            검색 모드
            <select name="search_mode" defaultValue="KEYWORD">
              <option value="KEYWORD">KEYWORD</option>
              <option value="TAG">TAG</option>
            </select>
          </label>
          <label>
            최대 결과
            <input name="limit" type="number" min="1" max="50" defaultValue="25" />
          </label>
        </div>
        <div className="source-form-row">
          <label>
            since (선택)
            <input name="since" type="datetime-local" />
          </label>
          <label>
            until (선택)
            <input name="until" type="datetime-local" />
          </label>
        </div>
        <button type="submit" disabled={pending || !configured}>
          {pending ? "검색 중…" : "Threads 검색 실행"}
        </button>
      </form>

      {!configured ? (
        <p className="source-warning">서버에 THREADS_ACCESS_TOKEN을 설정해야 실제 API 호출을 실행할 수 있습니다.</p>
      ) : null}
      {error ? <p className="source-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="source-run-result">
          <div className="source-run-metrics">
            <span>가져옴 <strong>{result.run?.fetched_count ?? 0}</strong></span>
            <span>신규 <strong>{result.run?.inserted_count ?? 0}</strong></span>
            <span>중복 <strong>{result.run?.duplicate_count ?? 0}</strong></span>
            <span>제외 <strong>{result.run?.skipped_count ?? 0}</strong></span>
          </div>
          <div className="source-result-list">
            {(result.signals ?? []).map((signal) => (
              <article key={signal.id}>
                <div className="source-result-meta">
                  <span>@{signal.author_handle || "unknown"}</span>
                  <span>{signal.published_at ? new Date(signal.published_at).toLocaleString("ko-KR") : "시간 미상"}</span>
                </div>
                <p>{signal.raw_text}</p>
                {signal.canonical_url ? (
                  <a href={signal.canonical_url} target="_blank" rel="noreferrer">Threads 원문 ↗</a>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
