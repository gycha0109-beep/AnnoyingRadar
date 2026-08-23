import Link from "next/link";
import { redirect } from "next/navigation";

import BlindEvaluationControl from "../../components/blind-evaluation-control.js";
import NaverBlogSourceSearchForm from "../../components/naver-blog-source-search-form.js";
import ThreadsSourceSearchForm from "../../components/threads-source-search-form.js";
import { getBlindEvaluationProgress } from "../../../lib/sources/blind-evaluation.mjs";
import { getGoldCampaignProgress } from "../../../lib/sources/gold-campaign.mjs";
import { getSilverStats } from "../../../lib/sources/semantic-gate.mjs";
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
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function CuratorSourcesPage() {
  const { user, role, serviceClient } = await loadCuratorContext();
  const [runs, campaignProgress, evaluation, silver] = await Promise.all([
    listRecentSourceIngestionRuns(serviceClient, { limit: 20 }),
    getGoldCampaignProgress(serviceClient),
    getBlindEvaluationProgress(serviceClient),
    getSilverStats(serviceClient),
  ]);
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
          <p className="curator-kicker">Source Lab · Phase 15.5D</p>
          <h1>Semantic Gate와 blind human evaluation을 분리합니다.</h1>
          <p>LLM은 semantic facts만 관찰하고 PASS/REVIEW/REJECT는 deterministic code가 결정합니다. AI Silver와 human evaluation은 서로 다른 authority입니다.</p>
        </div>
      </header>

      <section className="source-lab-panel" aria-labelledby="campaign-title">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">Real Signal Acquisition</p><h2 id="campaign-title">수집 캠페인</h2></div>
          <span>{campaignProgress.completed_queries} / {campaignProgress.planned_queries} queries</span>
        </div>
        <div className="source-run-metrics">
          <span>unique pool <strong>{campaignProgress.unique_signal_pool}</strong></span>
          <span>fetched <strong>{campaignProgress.fetched_total}</strong></span>
          <span>new <strong>{campaignProgress.inserted_total}</strong></span>
          <span>duplicate <strong>{campaignProgress.duplicate_total}</strong></span>
          <span>failed <strong>{campaignProgress.failed_runs}</strong></span>
        </div>
        <p className={campaignProgress.unique_signal_pool >= 600 ? "source-configured" : "source-warning"}>
          {campaignProgress.unique_signal_pool >= 600 ? "Acquisition gate passed." : "추가 수집이 필요합니다."}
        </p>
      </section>

      <section className="source-lab-grid">
        <div className="source-lab-panel">
          <p className="curator-kicker">Blind Human Evaluation</p>
          <h2>Representative 60 + Challenge 60</h2>
          <p className="source-lab-copy">샘플은 classifier/Silver 결과와 무관하게 acquisition provenance만으로 먼저 고정됩니다. labeling 상태에서는 DB trigger가 이 120개에 AI judgment/Silver INSERT를 거부합니다.</p>
          <BlindEvaluationControl evaluation={evaluation} />
        </div>

        <div className="source-lab-panel">
          <p className="curator-kicker">AI Silver</p>
          <h2>Semantic development labels</h2>
          <div className="source-run-metrics">
            <span>total <strong>{silver.total}</strong></span>
            <span>pass <strong>{silver.pass}</strong></span>
            <span>review <strong>{silver.review}</strong></span>
            <span>reject <strong>{silver.reject}</strong></span>
            <span>low certainty <strong>{silver.low_certainty}</strong></span>
          </div>
          <p className="source-warning">Silver는 Gold가 아닙니다. Blind evaluation 120개를 먼저 고정한 뒤에만 <code>npm run classify:silver:live</code>를 실행합니다. 이 명령은 외부 LLM 비용을 발생시킬 수 있습니다.</p>
        </div>
      </section>

      <section className="source-adapter-grid" aria-label="Source adapters">
        <NaverBlogSourceSearchForm configured={naverConfigured} />
        <ThreadsSourceSearchForm configured={Boolean(process.env.THREADS_ACCESS_TOKEN)} />
      </section>

      <section className="source-lab-panel">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">Runs</p><h2>최근 수집 실행</h2></div>
          <span>{runs.length}개</span>
        </div>
        {runs.length > 0 ? (
          <div className="source-run-list">
            {runs.map((run) => (
              <article key={run.id}>
                <div className="source-run-title"><strong>{run.query_text}</strong><span className={`source-run-status source-run-status-${run.status}`}>{run.status}</span></div>
                <p>{run.source_platform} · {run.search_type} · {run.search_mode} · limit {run.requested_limit}</p>
                <div className="source-run-metrics compact"><span>fetched <strong>{run.fetched_count}</strong></span><span>new <strong>{run.inserted_count}</strong></span><span>dup <strong>{run.duplicate_count}</strong></span></div>
                <small>{formatTime(run.started_at)}</small>
              </article>
            ))}
          </div>
        ) : <p className="source-empty">아직 수집 실행 기록이 없습니다.</p>}
      </section>
    </main>
  );
}
