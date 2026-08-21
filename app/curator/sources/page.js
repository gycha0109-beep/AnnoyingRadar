import Link from "next/link";
import { redirect } from "next/navigation";

import GoldBenchmarkFreezeControl from "../../components/gold-benchmark-freeze-control.js";
import NaverBlogSourceSearchForm from "../../components/naver-blog-source-search-form.js";
import SourceSignalComplaintReview from "../../components/source-signal-complaint-review.js";
import ThreadsSourceSearchForm from "../../components/threads-source-search-form.js";
import {
  getComplaintGoldStats,
  listSourceSignalReviewQueue,
} from "../../../lib/sources/complaint-service.mjs";
import {
  getGoldBenchmarkStats,
  getGoldCampaignProgress,
} from "../../../lib/sources/gold-campaign.mjs";
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
  const [runs, reviewQueue, goldStats, campaignProgress, benchmarkStats] = await Promise.all([
    listRecentSourceIngestionRuns(serviceClient, { limit: 20 }),
    listSourceSignalReviewQueue(serviceClient, { limit: 30 }),
    getComplaintGoldStats(serviceClient),
    getGoldCampaignProgress(serviceClient),
    getGoldBenchmarkStats(serviceClient),
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
          <p className="curator-kicker">Source Lab · Phase 15.5C</p>
          <h1>실제 Source Signal pool과 Gold benchmark를 고정합니다.</h1>
          <p>수집 캠페인은 complaint-heavy, domain friction, neutral, noise 표본을 함께 확보합니다. Source Signal은 Gold 검토 전후에도 Raw Input, Pain Evidence, Public Problem과 분리됩니다.</p>
        </div>
      </header>

      <section className="source-lab-panel" aria-labelledby="gold-campaign-title">
        <div className="source-lab-heading">
          <div>
            <p className="curator-kicker">Real Gold Acquisition Campaign</p>
            <h2 id="gold-campaign-title">수집 캠페인 진행률</h2>
          </div>
          <span>{campaignProgress.completed_queries} / {campaignProgress.planned_queries} queries</span>
        </div>
        <p className="source-lab-copy">고정 query plan은 약 800개의 검색 결과 기회를 만들고, 실제 중복 제거 후 최소 600개의 review pool을 목표로 합니다. 완료된 query는 재실행 시 건너뛰어 캠페인을 안전하게 이어서 실행할 수 있습니다.</p>
        <div className="source-run-metrics">
          <span>unique pool <strong>{campaignProgress.unique_signal_pool}</strong></span>
          <span>fetched <strong>{campaignProgress.fetched_total}</strong></span>
          <span>new <strong>{campaignProgress.inserted_total}</strong></span>
          <span>duplicate <strong>{campaignProgress.duplicate_total}</strong></span>
          <span>failed <strong>{campaignProgress.failed_runs}</strong></span>
        </div>
        <p className={campaignProgress.unique_signal_pool >= 600 ? "source-configured" : "source-warning"}>
          {campaignProgress.unique_signal_pool >= 600
            ? "Gold labeling pool target reached."
            : `Gold labeling 전 권장 pool까지 ${Math.max(0, 600 - campaignProgress.unique_signal_pool)}개가 더 필요합니다.`}
        </p>
      </section>

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
            <span>{goldStats.total} / 300</span>
          </div>
          <p className="source-lab-copy">실제 Source Signal을 사람이 라벨링한 benchmark입니다. 화면에 보이지 않는 원문 정보는 추정하지 않고, 300개가 준비되면 calibration 200 / locked holdout 100으로 한 번만 고정합니다.</p>
          <div className="source-run-metrics">
            <span>relevant <strong>{goldStats.yes}</strong></span>
            <span>not relevant <strong>{goldStats.no}</strong></span>
            <span>uncertain <strong>{goldStats.uncertain}</strong></span>
          </div>
          <GoldBenchmarkFreezeControl benchmark={benchmarkStats} />
          <p className="source-warning">Holdout은 freeze 후 review queue에서 숨겨지고, benchmark에 포함된 Gold label은 DB trigger로 수정이 차단됩니다. classifier tuning은 calibration partition만 사용해야 합니다.</p>
        </div>
      </section>

      <section className="source-lab-panel complaint-review-panel" aria-labelledby="complaint-review-title">
        <div className="source-lab-heading">
          <div>
            <p className="curator-kicker">Complaint Relevance Gate</p>
            <h2 id="complaint-review-title">Source Signal Gold 검토</h2>
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
          <p className="source-empty">검토 가능한 Source Signal이 없습니다. 수집 캠페인을 실행하거나 benchmark freeze 상태를 확인하십시오.</p>
        )}
      </section>
    </main>
  );
}
