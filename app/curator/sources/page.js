import Link from "next/link";
import { redirect } from "next/navigation";

import NaverBlogSourceSearchForm from "../../components/naver-blog-source-search-form.js";
import SourceSignalComplaintReview from "../../components/source-signal-complaint-review.js";
import ThreadsSourceSearchForm from "../../components/threads-source-search-form.js";
import {
  getComplaintGoldStats,
  listSourceSignalReviewQueue,
} from "../../../lib/sources/complaint-service.mjs";
import { listRecentSourceIngestionRuns } from "../../../lib/sources/service.mjs";
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
  const [runs, reviewQueue, goldStats] = await Promise.all([
    listRecentSourceIngestionRuns(serviceClient, { limit: 20 }),
    listSourceSignalReviewQueue(serviceClient, { limit: 30 }),
    getComplaintGoldStats(serviceClient),
  ]);
  const modelConfigured = Boolean(
    process.env.OPENAI_API_KEY
    && (process.env.OPENAI_COMPLAINT_MODEL || process.env.OPENAI_EVIDENCE_MODEL),
  );
  const naverConfigured = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

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
          <p className="curator-kicker">Source Lab · Phase 15.5B</p>
          <h1>여러 공식 Source에서 실제 문제 신호를 확보합니다.</h1>
          <p>수집원은 provenance를 보존한 채 Source Signal로만 적재합니다. 검색 결과나 snippet을 바로 Complaint, Pain Evidence, Public Problem으로 승격하지 않습니다.</p>
        </div>
      </header>

      <section className="source-adapter-grid" aria-label="Source adapters">
        <NaverBlogSourceSearchForm configured={naverConfigured} />
        <ThreadsSourceSearchForm configured={Boolean(process.env.THREADS_ACCESS_TOKEN)} />
      </section>

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
                  <p>{run.source_platform} · {run.search_type} · {run.search_mode} · limit {run.requested_limit}</p>
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

        <div className="source-lab-panel complaint-gold-summary">
          <div className="source-lab-heading">
            <div>
              <p className="curator-kicker">Gold Set v0.1</p>
              <h2>Human benchmark</h2>
            </div>
            <span>{goldStats.total} / 약 300</span>
          </div>
          <p className="source-lab-copy">실제 Source Signal을 사람이 라벨링한 benchmark입니다. source별 표현 차이를 섞되, 화면에 보이지 않는 원문 정보는 추정하지 않습니다.</p>
          <div className="source-run-metrics">
            <span>relevant <strong>{goldStats.yes}</strong></span>
            <span>not relevant <strong>{goldStats.no}</strong></span>
            <span>uncertain <strong>{goldStats.uncertain}</strong></span>
          </div>
          <p className="source-warning">Gold benchmark가 충분히 쌓이고 precision/recall을 검증하기 전에는 classifier pass를 Pain Evidence나 Public Problem으로 자동 승격하지 않습니다.</p>
        </div>
      </section>

      <section className="source-lab-panel complaint-review-panel" aria-labelledby="complaint-review-title">
        <div className="source-lab-heading">
          <div>
            <p className="curator-kicker">Complaint Relevance Gate</p>
            <h2 id="complaint-review-title">최근 Source Signal 검토</h2>
          </div>
          <span>{reviewQueue.length}개</span>
        </div>
        <p className="source-lab-copy">PASS는 complaint relevant + first-hand experience + concrete friction이 모두 yes일 때만 가능합니다. confidence는 참고 provenance일 뿐 threshold의 근거는 Gold benchmark입니다.</p>

        {reviewQueue.length > 0 ? (
          <div className="complaint-review-list">
            {reviewQueue.map((signal) => (
              <SourceSignalComplaintReview
                key={signal.id}
                signal={signal}
                modelConfigured={modelConfigured}
              />
            ))}
          </div>
        ) : (
          <p className="source-empty">저장된 Source Signal이 없습니다. Source Adapter로 실제 Signal이 들어오면 여기서 Gold label과 classifier 결과를 검토할 수 있습니다.</p>
        )}
      </section>
    </main>
  );
}
