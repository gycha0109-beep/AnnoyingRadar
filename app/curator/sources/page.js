import Link from "next/link";
import { redirect } from "next/navigation";

import ThreadsSourceSearchForm from "../../components/threads-source-search-form.js";
import {
  listRecentSourceIngestionRuns,
  listRecentSourceSignals,
} from "../../../lib/sources/service.mjs";
import { createServerSupabaseClient } from "../../../lib/supabase/server.js";
import { createServiceClient } from "../../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

async function loadCuratorContext() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const { data: curator, error } = await serviceClient
    .from("ar_radar_curators")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!curator?.role) redirect("/workspace");

  return { user, role: curator.role, serviceClient };
}

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function CuratorSourcesPage() {
  const { user, role, serviceClient } = await loadCuratorContext();
  const [runs, signals] = await Promise.all([
    listRecentSourceIngestionRuns(serviceClient, { limit: 20 }),
    listRecentSourceSignals(serviceClient, { limit: 30 }),
  ]);

  return (
    <main className="curator-shell source-lab-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator">Radar Curator</Link>
          <p>{user.email ?? user.id} · {role}</p>
        </div>
        <div className="curator-nav-actions">
          <Link href="/curator">Publication Queue</Link>
          <Link href="/">Public Radar</Link>
          <Link href="/workspace">Workspace</Link>
        </div>
      </nav>

      <header className="curator-hero">
        <div>
          <p className="curator-kicker">Source Lab · Phase 15.4</p>
          <h1>외부 Signal을 안전하게 수집합니다.</h1>
          <p>Threads 공식 검색 API의 결과를 정규화하고, 같은 게시물은 하나의 Source Signal로 유지하면서 검색별 Observation을 별도로 기록합니다.</p>
        </div>
      </header>

      <ThreadsSourceSearchForm configured={Boolean(process.env.THREADS_ACCESS_TOKEN)} />

      <section className="source-lab-grid">
        <div className="source-lab-panel">
          <div className="source-lab-heading">
            <div>
              <p className="curator-kicker">Runs</p>
              <h2>최근 수집 실행</h2>
            </div>
            <span>{runs.length}개</span>
          </div>
          {runs.length > 0 ? (
            <div className="source-run-list">
              {runs.map((run) => (
                <article key={run.id}>
                  <div className="source-run-title">
                    <strong>{run.query_text}</strong>
                    <span className={`source-run-status source-run-status-${run.status}`}>{run.status}</span>
                  </div>
                  <p>{run.search_type} · {run.search_mode} · limit {run.requested_limit}</p>
                  <div className="source-run-metrics compact">
                    <span>fetched <strong>{run.fetched_count}</strong></span>
                    <span>new <strong>{run.inserted_count}</strong></span>
                    <span>dup <strong>{run.duplicate_count}</strong></span>
                    <span>skip <strong>{run.skipped_count}</strong></span>
                  </div>
                  <small>{formatTime(run.started_at)}</small>
                  {run.error_message ? <p className="source-error">{run.error_message}</p> : null}
                </article>
              ))}
            </div>
          ) : <p className="source-empty">아직 수집 실행 기록이 없습니다.</p>}
        </div>

        <div className="source-lab-panel">
          <div className="source-lab-heading">
            <div>
              <p className="curator-kicker">Signals</p>
              <h2>최근 Source Signals</h2>
            </div>
            <span>{signals.length}개</span>
          </div>
          {signals.length > 0 ? (
            <div className="source-result-list persisted">
              {signals.map((signal) => (
                <article key={signal.id}>
                  <div className="source-result-meta">
                    <span>@{signal.author_handle || "unknown"}</span>
                    <span>{formatTime(signal.published_at)}</span>
                  </div>
                  <p>{signal.raw_text}</p>
                  <div className="source-signal-footer">
                    <small>{signal.adapter_version} · last seen {formatTime(signal.last_seen_at)}</small>
                    {signal.canonical_url ? (
                      <a href={signal.canonical_url} target="_blank" rel="noreferrer">원문 ↗</a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="source-empty">저장된 외부 Signal이 아직 없습니다.</p>}
        </div>
      </section>
    </main>
  );
}
