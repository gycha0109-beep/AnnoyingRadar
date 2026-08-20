"use client";

import { useState } from "react";

export default function NaverBlogSourceSearchForm({ configured }) {
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
      sort: String(form.get("sort") ?? "date"),
      limit: Number(form.get("limit") ?? 25),
      start: Number(form.get("start") ?? 1),
    };

    try {
      const response = await fetch("/api/radar/admin/sources/naver/blog/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Naver 블로그 검색에 실패했습니다.");
      }
      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="source-lab-panel" aria-labelledby="naver-blog-search-title">
      <div className="source-lab-heading">
        <div>
          <p className="curator-kicker">Primary Source Adapter</p>
          <h2 id="naver-blog-search-title">Naver 블로그 검색</h2>
        </div>
        <span className={configured ? "source-configured" : "source-not-configured"}>
          {configured ? "credentials configured" : "credentials missing"}
        </span>
      </div>

      <p className="source-lab-copy">
        Naver 공식 Search API의 블로그 검색 결과를 Source Signal 후보로 저장합니다. 저장되는 텍스트는 원문 전체가 아니라 검색 결과의 제목 + 요약 패시지입니다.
      </p>
      <p className="source-warning">
        content_scope=search_snippet입니다. Gold label은 화면에 실제로 보이는 텍스트만 근거로 판단하고, 보이지 않는 원문에 first-hand 경험이나 friction이 있다고 추정하지 않습니다.
      </p>

      <form className="source-search-form" onSubmit={submit}>
        <label>
          검색어
          <input name="q" required maxLength={120} placeholder="예: 배달 최소주문 불편" />
        </label>
        <div className="source-form-row">
          <label>
            정렬
            <select name="sort" defaultValue="date">
              <option value="date">date · 최신순</option>
              <option value="sim">sim · 정확도순</option>
            </select>
          </label>
          <label>
            최대 결과
            <input name="limit" type="number" min="1" max="50" defaultValue="25" />
          </label>
          <label>
            시작 위치
            <input name="start" type="number" min="1" max="1000" defaultValue="1" />
          </label>
        </div>
        <button type="submit" disabled={pending || !configured}>
          {pending ? "검색 중…" : "Naver 검색 실행"}
        </button>
      </form>

      {!configured ? (
        <p className="source-warning">서버에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정해야 실제 API 호출을 실행할 수 있습니다.</p>
      ) : null}
      {error ? <p className="source-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="source-run-result">
          <div className="source-run-metrics">
            <span>가져옴 <strong>{result.run?.fetched_count ?? 0}</strong></span>
            <span>신규 <strong>{result.run?.inserted_count ?? 0}</strong></span>
            <span>중복 <strong>{result.run?.duplicate_count ?? 0}</strong></span>
            <span>제외 <strong>{result.run?.skipped_count ?? 0}</strong></span>
            <span>검색 전체 <strong>{result.paging?.total ?? "-"}</strong></span>
          </div>
          <div className="source-result-list">
            {(result.signals ?? []).map((signal) => (
              <article key={signal.id}>
                <div className="source-result-meta">
                  <span>{signal.author_handle || "블로그명 미상"}</span>
                  <span>{signal.published_at ? new Date(signal.published_at).toLocaleDateString("ko-KR") : "작성일 미상"}</span>
                </div>
                <p>{signal.raw_text}</p>
                {signal.canonical_url ? (
                  <a href={signal.canonical_url} target="_blank" rel="noreferrer">Naver 검색 원문 링크 ↗</a>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
