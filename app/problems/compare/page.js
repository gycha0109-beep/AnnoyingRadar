import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getProblemComparisonSelectionState,
  MAX_PROBLEM_COMPARISON_ITEMS,
  MIN_PROBLEM_COMPARISON_ITEMS,
  normalizeProblemComparisonIds,
} from "../../../lib/saved-problems/comparison.mjs";
import {
  loadProblemComparison,
  loadProblemComparisonCatalog,
} from "../../../lib/saved-problems/service.mjs";
import { createServerSupabaseClient } from "../../../lib/supabase/server.js";
import { createServiceClient } from "../../../lib/supabase/service.js";
import styles from "./problem-comparison.module.css";

export const dynamic = "force-dynamic";

const METRICS = [
  ["요약", (item) => item.problem_card?.summary || "-"],
  ["대상 사용자", (item) => item.problem_card?.target_user || "-"],
  ["상황", (item) => item.problem_card?.situation || "-"],
  ["근거 수", (item) => item.problem_card?.evidence_count ?? "-"],
  ["감정 강도", (item) => item.problem_card?.intensity_level || "unknown"],
  ["반복 패턴", (item) => item.problem_card?.repeat_pattern_level || "unknown"],
  ["문제 명확도", (item) => item.problem_card?.clarity_level || "unknown"],
  ["Saved 카테고리", (item) => item.saved_problem?.category || "저장 안 됨"],
  ["Saved 메모", (item) => item.saved_problem?.memo || "-"],
  ["Saved 상태", (item) => item.saved_problem?.status || "저장 안 됨"],
];

export default async function ProblemComparisonPage({ searchParams }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const serviceClient = createServiceClient();
  const resolvedSearchParams = await searchParams;
  const normalizedIds = normalizeProblemComparisonIds(resolvedSearchParams?.ids);

  if (!normalizedIds.length) {
    const catalog = await loadProblemComparisonCatalog(serviceClient, user.id);
    return <ComparisonCatalog items={catalog} />;
  }

  const selection = getProblemComparisonSelectionState(normalizedIds);
  if (!selection.valid) {
    return <InvalidSelection message={selection.message} selectedCount={selection.ids.length} />;
  }

  const items = await loadProblemComparison(serviceClient, user.id, selection.ids);
  if (items.length !== selection.ids.length) {
    return (
      <InvalidSelection
        message="선택한 항목 중 현재 계정의 confirmed Problem Card가 아닌 항목이 포함되어 있습니다."
        selectedCount={items.length}
      />
    );
  }

  return <ComparisonResult items={items} />;
}

function ComparisonCatalog({ items }) {
  return (
    <main className="stack page-shell">
      <PageNav />
      <header className="hero stack-sm">
        <p className="eyebrow">UC-14 · Evidence-first comparison</p>
        <h1>문제 카드 비교</h1>
        <p className="hero-copy">
          confirmed Problem Card 중 {MIN_PROBLEM_COMPARISON_ITEMS}~{MAX_PROBLEM_COMPARISON_ITEMS}개를 골라 canonical 지표를 나란히 비교합니다.
        </p>
      </header>

      <section className="card stack" aria-labelledby="comparison-catalog-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">Comparison Catalog</p>
            <h2 id="comparison-catalog-title">비교 가능한 confirmed Problem Card {items.length}개</h2>
          </div>
          <Link className="button-link button-compact" href="/problems">Saved Problems</Link>
        </div>

        {items.length >= MIN_PROBLEM_COMPARISON_ITEMS ? (
          <form action="/problems/compare" method="get" className="stack">
            <div className="notice">
              체크박스로 2~4개를 선택한 뒤 비교를 실행하세요. Saved 여부는 비교 자격과 무관하며 메타데이터로만 표시됩니다.
            </div>
            <div className={styles.catalogGrid}>
              {items.map((item) => (
                <label className={styles.catalogCard} key={item.problem_candidate_id}>
                  <span className={styles.catalogSelect}>
                    <input
                      name="ids"
                      type="checkbox"
                      value={item.problem_candidate_id}
                      style={{ width: "auto", margin: 0, padding: 0 }}
                    />
                    비교 선택
                  </span>
                  <strong>{item.problem_card?.title || "Problem Card unavailable"}</strong>
                  <span className={styles.catalogSummary}>{item.problem_card?.summary || "요약 없음"}</span>
                  <span className={styles.catalogMetrics}>
                    Evidence {item.problem_card?.evidence_count ?? "-"}
                    {" · "}강도 {item.problem_card?.intensity_level || "unknown"}
                    {" · "}반복 {item.problem_card?.repeat_pattern_level || "unknown"}
                    {" · "}명확도 {item.problem_card?.clarity_level || "unknown"}
                  </span>
                  <span className="status-badge">
                    {item.saved_problem ? `Saved · ${item.saved_problem.status}` : "Not Saved"}
                  </span>
                </label>
              ))}
            </div>
            <div className="inline-actions">
              <button type="submit">선택한 Problem Card 비교</button>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            <strong>비교 가능한 confirmed Problem Card가 부족합니다.</strong>
            <p className="muted">최소 2개의 confirmed Problem Card가 필요합니다.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ComparisonResult({ items }) {
  return (
    <main className="stack page-shell">
      <PageNav />
      <header className="hero stack-sm">
        <p className="eyebrow">UC-14 · Evidence-first comparison</p>
        <h1>문제 카드 비교</h1>
        <p className="hero-copy">
          종합 점수나 자동 순위를 만들지 않고, confirmed Problem Card의 canonical 지표와 선택적 Saved 메타데이터를 나란히 봅니다.
        </p>
      </header>

      <section className={`card stack ${styles.compareShell}`} aria-labelledby="comparison-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">Comparison Set</p>
            <h2 id="comparison-title">선택한 Problem Card {items.length}개</h2>
          </div>
          <Link className="button-link button-compact" href="/problems/compare">선택 다시 하기</Link>
        </div>

        <div className={styles.tableScroller}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.metricHeading}>비교 항목</th>
                {items.map((item) => (
                  <th scope="col" key={item.problem_candidate_id} className={styles.problemHeading}>
                    <div className="stack-sm">
                      <span className="status-badge">confirmed</span>
                      <strong>{item.problem_card?.title || "Problem Card unavailable"}</strong>
                      <Link
                        className={styles.detailLink}
                        href={`/problem-candidates/${item.problem_candidate_id}`}
                      >
                        상세 열기
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map(([label, getValue]) => (
                <tr key={label}>
                  <th scope="row" className={styles.metricHeading}>{label}</th>
                  {items.map((item) => (
                    <td key={item.problem_candidate_id}>{getValue(item)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`notice ${styles.boundaryNotice}`}>
          이 화면은 판단 근거를 병렬로 보여주는 read-only projection입니다. 비교 결과, 점수, 순위는 저장하지 않습니다.
        </div>
      </section>
    </main>
  );
}

function InvalidSelection({ message, selectedCount }) {
  return (
    <main className="stack page-shell">
      <PageNav />
      <header className="hero stack-sm">
        <p className="eyebrow">Problem Card Comparison</p>
        <h1>비교할 카드를 다시 선택하세요</h1>
        <p className="hero-copy">
          confirmed Problem Card {MIN_PROBLEM_COMPARISON_ITEMS}~{MAX_PROBLEM_COMPARISON_ITEMS}개를 선택해야 합니다.
        </p>
      </header>
      <section className="card stack">
        <div className="notice warning">{message}</div>
        <p className="muted">현재 유효 선택 수: {selectedCount}</p>
        <div className="inline-actions">
          <Link className="button-link button-primary-link" href="/problems/compare">비교 대상 다시 선택</Link>
        </div>
      </section>
    </main>
  );
}

function PageNav() {
  return (
    <nav className="topbar">
      <div>
        <Link className="brand" href="/">어노잉 레이더</Link>
        <p className="muted user-line">Problem Card Comparison</p>
      </div>
      <div className="inline-actions">
        <Link className="button-link" href="/problems">Saved Problems</Link>
        <Link className="button-link" href="/projects">Projects</Link>
        <Link className="button-link" href="/ideas">Ideas</Link>
      </div>
    </nav>
  );
}
