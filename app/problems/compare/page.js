import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getProblemComparisonSelectionState,
  MAX_PROBLEM_COMPARISON_ITEMS,
  MIN_PROBLEM_COMPARISON_ITEMS,
} from "../../../lib/saved-problems/comparison.mjs";
import { loadSavedProblemComparison } from "../../../lib/saved-problems/service.mjs";
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
  ["카테고리", (item) => item.category || "미분류"],
  ["메모", (item) => item.memo || "-"],
  ["저장 상태", (item) => item.status || "-"],
];

export default async function ProblemComparisonPage({ searchParams }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const selection = getProblemComparisonSelectionState(resolvedSearchParams?.ids);

  if (!selection.valid) {
    return <InvalidSelection message={selection.message} selectedCount={selection.ids.length} />;
  }

  const serviceClient = createServiceClient();
  const items = await loadSavedProblemComparison(serviceClient, user.id, selection.ids);

  if (items.length !== selection.ids.length) {
    return (
      <InvalidSelection
        message="선택한 항목 중 현재 계정의 Saved Problem이 아닌 카드가 포함되어 있습니다."
        selectedCount={items.length}
      />
    );
  }

  return (
    <main className="stack page-shell">
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

      <header className="hero stack-sm">
        <p className="eyebrow">UC-14 · Evidence-first comparison</p>
        <h1>문제 카드 비교</h1>
        <p className="hero-copy">
          종합 점수나 자동 순위를 만들지 않고, 저장한 Problem Card의 canonical 지표와 메모를 나란히 봅니다.
        </p>
      </header>

      <section className={`card stack ${styles.compareShell}`} aria-labelledby="comparison-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">Comparison Set</p>
            <h2 id="comparison-title">선택한 Problem Card {items.length}개</h2>
          </div>
          <Link className="button-link button-compact" href="/problems">선택 다시 하기</Link>
        </div>

        <div className={styles.tableScroller}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.metricHeading}>비교 항목</th>
                {items.map((item) => (
                  <th scope="col" key={item.problem_candidate_id} className={styles.problemHeading}>
                    <div className="stack-sm">
                      <span className="status-badge">{item.status}</span>
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
      <nav className="topbar">
        <Link className="brand" href="/">어노잉 레이더</Link>
        <Link className="button-link" href="/problems">Saved Problems</Link>
      </nav>
      <header className="hero stack-sm">
        <p className="eyebrow">Problem Card Comparison</p>
        <h1>비교할 카드를 다시 선택하세요</h1>
        <p className="hero-copy">
          Saved Problem {MIN_PROBLEM_COMPARISON_ITEMS}~{MAX_PROBLEM_COMPARISON_ITEMS}개를 선택해야 합니다.
        </p>
      </header>
      <section className="card stack">
        <div className="notice warning">{message}</div>
        <p className="muted">현재 유효 선택 수: {selectedCount}</p>
        <div className="inline-actions">
          <Link className="button-link button-primary-link" href="/problems">Saved Problems에서 선택</Link>
        </div>
      </section>
    </main>
  );
}
